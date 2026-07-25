"""The single seam for Valorant data.

Everything the platform knows about Riot accounts flows through this module,
so swapping HenrikDev for the official Riot API (post-approval) or a
self-hosted fork touches only this file.

Results are cached in Redis: account metadata rarely changes, and rank
doesn't need to be fresher than ~15 minutes.
"""
import logging
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone as dt_timezone

import httpx
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

BASE_URL = "https://api.henrikdev.xyz"
# On a 429 we retry with backoff (respecting Retry-After) instead of failing
# outright — loading a profile bursts several endpoints and can trip the limit.
MAX_RETRIES = 2
MAX_BACKOFF_SECONDS = 4
# Every successful HenrikDev response is also kept under a long "stale" key so
# that if a later refetch is rate-limited we serve the last-good data rather
# than showing an error. History is append-only, so stale data is still useful.
RAW_STALE_TTL = 60 * 60 * 6  # 6 hours
# valorant-api.com serves the canonical CDN art keyed by the same UUIDs
# HenrikDev returns, so the tracker can build image URLs without a second lookup.
ASSET_CDN = "https://media.valorant-api.com"
ACCOUNT_CACHE_TTL = 60 * 60  # 1 hour
MMR_CACHE_TTL = 60 * 15  # 15 minutes
MATCHES_CACHE_TTL = 60 * 5  # 5 minutes — match history is append-only
MMR_HISTORY_CACHE_TTL = 60 * 10

# HenrikDev tier names come with a division suffix ("Ascendant 2");
# the platform stores the base tier only.
_TIERS = {
    "iron", "bronze", "silver", "gold", "platinum",
    "diamond", "ascendant", "immortal", "radiant",
}


class ProviderError(Exception):
    """The data provider is unavailable, rejected the request, or the
    account was not found. `.not_found` distinguishes the latter."""

    def __init__(self, message: str, *, not_found: bool = False):
        super().__init__(message)
        self.not_found = not_found


@dataclass
class RiotAccount:
    puuid: str
    region: str
    account_level: int | None
    card_id: str = ""  # player-card uuid; art urls derive from it
    card_wide: str = ""
    card_small: str = ""
    title: str = ""  # resolved title text ("Fearless"), "" when unset


@dataclass
class SeasonStat:
    """One past act's competitive record from the v3 MMR payload."""
    season: str  # short id, e.g. "e9a3"
    wins: int
    games: int
    end_tier: str  # full name, "Ascendant 1"


@dataclass
class RiotMMR:
    current_tier: str  # "" when unranked
    current_rr: int | None
    peak_tier: str
    current_division: int | None = None  # 1-3 within a tier; None for Radiant/unranked
    peak_division: int | None = None
    last_change: int | None = None  # RR delta of the latest ranked game
    elo: int | None = None
    leaderboard_rank: int | None = None  # Immortal+ regional placement
    seasons: list = None  # list[SeasonStat] as dicts (cache-safe)

    def __post_init__(self):
        if self.seasons is None:
            self.seasons = []


@dataclass
class MatchPlayer:
    """One player's line on a match scoreboard."""
    puuid: str
    name: str
    tag: str
    team_id: str  # "Red" / "Blue"
    agent: str
    agent_id: str
    agent_image: str
    tier_name: str  # "Diamond 2" / "" when hidden
    score: int
    kills: int
    deaths: int
    assists: int
    headshots: int
    bodyshots: int
    legshots: int
    damage_dealt: int
    acs: int  # average combat score (score / rounds)
    kd: float
    hs_percent: float
    is_subject: bool = False  # the account this history belongs to
    party_id: str = ""  # players sharing a party_id queued together
    # Round/kill-timeline derived stats. Zero when the payload lacks the
    # kills/rounds arrays (older matches, partial payloads).
    damage_received: int = 0
    adr: float = 0.0  # damage dealt per round
    dd_delta: float = 0.0  # (dealt - received) per round
    kast: float = 0.0  # % rounds with a Kill, Assist, Survival, or Trade
    first_bloods: int = 0
    first_deaths: int = 0
    multikills: int = 0  # rounds with 3+ kills
    best_kill_round: int = 0  # most kills in a single round
    plants: int = 0
    defuses: int = 0
    weapons: list = None  # [{id, name, image, kills}] sorted by kills desc
    duels: list = None  # subject only: [{puuid,name,tag,agent_image,dir}]

    def __post_init__(self):
        if self.weapons is None:
            self.weapons = []
        if self.duels is None:
            self.duels = []


@dataclass
class MatchTeam:
    team_id: str
    won: bool | None
    rounds_won: int
    rounds_lost: int


@dataclass
class RoundInfo:
    """One round's outcome + team economy, for the round-by-round timeline
    and buy-phase graph on the match detail view. Built entirely from data
    already present in the v4 match payload's `rounds` array — no extra
    API calls."""
    number: int  # 1-indexed
    winning_team: str  # "Red" / "Blue" — matches MatchTeam.team_id
    result: str  # raw outcome, e.g. "Eliminated" / "Detonate" / "Defuse" / "Surrendered"
    bomb_planted: bool = False
    bomb_defused: bool = False
    team_loadouts: dict = None  # {"Red": avg loadout value, "Blue": ...}
    team_buys: dict = None  # {"Red": "eco"|"semi"|"full", "Blue": ...}

    def __post_init__(self):
        if self.team_loadouts is None:
            self.team_loadouts = {}
        if self.team_buys is None:
            self.team_buys = {}


@dataclass
class Match:
    """A parsed competitive/other match. `summary_for` fields describe the
    tracked player's own line so the list view needs no client-side scan."""
    match_id: str
    map_name: str
    map_id: str
    map_image: str
    mode: str  # queue name, e.g. "Competitive"
    started_at: str  # ISO-8601 UTC
    game_length_seconds: int
    teams: list[MatchTeam]
    players: list[MatchPlayer]
    # match-level context, surfaced on the detail view
    season_name: str = ""  # "V26 · Act IV"
    cluster: str = ""  # server location, e.g. "Mumbai"
    region: str = ""  # shard, e.g. "AP"
    queue_id: str = ""  # raw queue id, e.g. "competitive"
    # denormalised view of the tracked player, for the history list
    subject_won: bool | None = None
    subject_agent: str = ""
    subject_agent_image: str = ""
    subject_kills: int = 0
    subject_deaths: int = 0
    subject_assists: int = 0
    subject_acs: int = 0
    subject_hs_percent: float = 0.0
    subject_score_line: str = ""  # "13 - 9"
    subject_adr: float = 0.0
    subject_kast: float = 0.0
    subject_first_bloods: int = 0
    subject_multikills: int = 0
    subject_mvp: bool = False  # top ACS in the lobby
    subject_team_mvp: bool = False  # top ACS on their team (and not match MVP)
    subject_party_size: int = 1  # players queued with the subject (incl. them)
    subject_placement: int = 0  # subject's ACS rank in the lobby (1 = top)
    subject_weapons: list = None  # subject's per-weapon kills, for aggregation
    subject_duels: list = None  # subject's kill/death feed vs each opponent
    rounds_detail: list = None  # list[RoundInfo] — round-by-round outcome + economy

    def __post_init__(self):
        if self.rounds_detail is None:
            self.rounds_detail = []
        if self.subject_weapons is None:
            self.subject_weapons = []
        if self.subject_duels is None:
            self.subject_duels = []


@dataclass
class MMRHistoryEntry:
    match_id: str
    started_at: str  # ISO-8601 UTC
    tier_name: str
    rr: int | None  # ranked rating after the game (0-100)
    rr_change: int | None  # elo delta for the game
    map_name: str


def _headers() -> dict:
    if not settings.HENRIKDEV_API_KEY:
        raise ProviderError("Riot data provider is not configured (missing API key).")
    return {"Authorization": settings.HENRIKDEV_API_KEY}


def _retry_after_seconds(resp: httpx.Response, attempt: int) -> float:
    """Seconds to wait before a retry — honour the Retry-After header when the
    provider sends one, else exponential backoff, capped."""
    header = resp.headers.get("Retry-After")
    if header:
        try:
            return min(float(header), MAX_BACKOFF_SECONDS)
        except ValueError:
            pass
    return min(2 ** attempt, MAX_BACKOFF_SECONDS)


def _get(path: str, *, attempt: int = 0) -> dict:
    stale_key = f"riot:raw:{path}"

    def _stale_or(exc: "ProviderError") -> dict:
        """Serve the last-good response for this path if we have one, so a
        transient provider failure never breaks an already-seen profile."""
        cached = cache.get(stale_key)
        if cached is not None:
            logger.warning("HenrikDev %s failed (%s); serving stale cache", path, exc)
            return cached
        raise exc

    try:
        resp = httpx.get(f"{BASE_URL}{path}", headers=_headers(), timeout=15)
    except httpx.HTTPError as exc:
        return _stale_or(ProviderError(f"Riot data provider unreachable: {exc}"))

    if resp.status_code == 404:
        raise ProviderError("Riot account not found.", not_found=True)
    if resp.status_code == 429:
        if attempt < MAX_RETRIES:
            time.sleep(_retry_after_seconds(resp, attempt))
            return _get(path, attempt=attempt + 1)
        return _stale_or(ProviderError("Riot data provider rate limit hit; try again shortly."))
    if resp.status_code != 200:
        logger.warning("HenrikDev %s -> %s: %s", path, resp.status_code, resp.text[:300])
        return _stale_or(ProviderError("Riot data provider returned an error."))

    data = resp.json().get("data", {})
    cache.set(stale_key, data, RAW_STALE_TTL)  # keep last-good for the fallback above
    return data


def _parse_tier(name: str | None) -> str:
    if not name:
        return ""
    base = name.split()[0].lower()
    return base if base in _TIERS else ""


def _parse_division(name: str | None) -> int | None:
    """Division number from a tier name ("Diamond 2" -> 2). Tiers without
    divisions (Radiant) or unranked return None."""
    if not name:
        return None
    parts = name.split()
    if len(parts) >= 2 and parts[-1].isdigit():
        return int(parts[-1])
    return None


def _title_text(title_id: str | None) -> str:
    """Resolve a player-title uuid to its display text via valorant-api.com.
    Titles are static content, so a long cache and a silent fallback are fine."""
    if not title_id:
        return ""
    cache_key = f"riot:title:{title_id}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    text = ""
    try:
        resp = httpx.get(f"https://valorant-api.com/v1/playertitles/{title_id}", timeout=10)
        if resp.status_code == 200:
            text = (resp.json().get("data") or {}).get("titleText") or ""
    except httpx.HTTPError:
        pass
    cache.set(cache_key, text, 60 * 60 * 24)
    return text


def _pretty_season(name: str) -> str:
    """valorant-api yells its season names ('EPISODE 9', 'ACT IV'); tidy the
    words while leaving year codes (V25/V26) and roman numerals intact."""
    return name.replace("EPISODE", "Episode").replace("ACT", "Act").strip()


def _season_index() -> dict:
    """valorant-api season uuid -> {'act', 'parent'} display names. Static
    content, cached a day. Empty on failure (callers fall back to the short)."""
    cache_key = "riot:seasons:v1"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    index: dict[str, dict] = {}
    try:
        resp = httpx.get("https://valorant-api.com/v1/seasons", timeout=15)
        if resp.status_code == 200:
            rows = resp.json().get("data") or []
            names = {s.get("uuid"): (s.get("displayName") or "") for s in rows}
            for s in rows:
                parent = s.get("parentUuid")
                index[s.get("uuid")] = {
                    "act": s.get("displayName") or "",
                    "parent": names.get(parent, "") if parent else "",
                }
    except httpx.HTTPError:
        pass
    cache.set(cache_key, index, 60 * 60 * 24)
    return index


def _season_name(season_id: str, short: str = "") -> str:
    """Authoritative season label from valorant-api, e.g. 'V26 · Act IV'. Riot
    dropped Episodes for a 'V25/V26 + Acts I-VI' scheme in 2025, which the
    HenrikDev `short` ('e11a4') doesn't reflect — so resolve by uuid and only
    fall back to the (uppercased) short when the uuid is unknown."""
    if season_id:
        entry = _season_index().get(season_id)
        if entry:
            parent = _pretty_season(entry.get("parent", ""))
            act = _pretty_season(entry.get("act", ""))
            if parent and act:
                return f"{parent} · {act}"
            return parent or act or (short.upper() if short else "")
    return short.upper() if short else ""


def get_account(game_name: str, tag_line: str) -> RiotAccount:
    cache_key = f"riot:account:v2:{game_name.lower()}#{tag_line.lower()}"
    cached = cache.get(cache_key)
    if cached:
        return RiotAccount(**cached)

    data = _get(f"/valorant/v2/account/{game_name}/{tag_line}")
    card_id = data.get("card") or ""
    account = RiotAccount(
        puuid=data.get("puuid", ""),
        region=data.get("region", ""),
        account_level=data.get("account_level"),
        card_id=card_id,
        card_wide=f"{ASSET_CDN}/playercards/{card_id}/wideart.png" if card_id else "",
        card_small=f"{ASSET_CDN}/playercards/{card_id}/smallart.png" if card_id else "",
        title=_title_text(data.get("title")),
    )
    if not account.puuid:
        raise ProviderError("Riot account lookup returned no puuid.")
    cache.set(cache_key, account.__dict__, ACCOUNT_CACHE_TTL)
    return account


def get_mmr(region: str, puuid: str) -> RiotMMR:
    cache_key = f"riot:mmr:v3:{puuid}"  # v3: seasonal history + leaderboard
    cached = cache.get(cache_key)
    if cached:
        return RiotMMR(**cached)

    data = _get(f"/valorant/v3/by-puuid/mmr/{region}/pc/{puuid}")
    current = data.get("current") or {}
    peak = data.get("peak") or {}
    current_name = (current.get("tier") or {}).get("name")
    peak_name = (peak.get("tier") or {}).get("name")
    placement = current.get("leaderboard_placement") or {}
    seasons = []
    for s in data.get("seasonal") or []:
        seasons.append(SeasonStat(
            season=((s.get("season") or {}).get("short") or ""),
            wins=_as_int(s.get("wins")),
            games=_as_int(s.get("games")),
            end_tier=((s.get("end_tier") or {}).get("name") or ""),
        ).__dict__)
    mmr = RiotMMR(
        current_tier=_parse_tier(current_name),
        current_rr=current.get("rr"),
        peak_tier=_parse_tier(peak_name),
        current_division=_parse_division(current_name),
        peak_division=_parse_division(peak_name),
        last_change=current.get("last_change"),
        elo=current.get("elo"),
        leaderboard_rank=placement.get("rank"),
        seasons=seasons,
    )
    cache.set(cache_key, mmr.__dict__, MMR_CACHE_TTL)
    return mmr


# A match started slightly before the recorded window start still counts —
# absorbs clock skew between the client, Riot's servers, and our own clock.
VERIFY_CLOCK_SKEW = timedelta(seconds=120)


def _parse_match_start(meta: dict) -> datetime | None:
    """Match start time from v4 metadata (ISO `started_at`), falling back to
    the older unix `game_start` shape, as a tz-aware UTC datetime."""
    raw = meta.get("started_at") or meta.get("game_start_iso")
    if raw:
        try:
            started = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            return started if started.tzinfo else started.replace(tzinfo=dt_timezone.utc)
        except ValueError:
            pass
    unix = meta.get("game_start")
    if isinstance(unix, (int, float)):
        return datetime.fromtimestamp(unix, tz=dt_timezone.utc)
    return None


def get_latest_match_after(region: str, puuid: str, after: datetime) -> str | None:
    """Returns the id of a recent match that STARTED at/after `after` (minus a
    small skew tolerance), or None. Uncached — drives live verification polling."""
    data = _get(f"/valorant/v4/by-puuid/matches/{region}/pc/{puuid}?size=5")
    matches = data if isinstance(data, list) else []
    threshold = after - VERIFY_CLOCK_SKEW

    newest_seen = None
    for match in matches:
        meta = match.get("metadata") or {}
        started = _parse_match_start(meta)
        if started is None:
            continue
        if newest_seen is None or started > newest_seen:
            newest_seen = started
        if started >= threshold:
            match_id = meta.get("match_id") or "unknown"
            logger.info("verification: match %s started %s (>= %s)", match_id, started, threshold)
            return match_id

    if newest_seen is not None:
        logger.info(
            "verification: no qualifying match; newest started %s, need >= %s",
            newest_seen, threshold,
        )
    else:
        logger.info("verification: no parseable matches returned for %s", puuid)
    return None


# ---------------------------------------------------------------------------
# Tracker: match history, scoreboards, and rank-rating history
# ---------------------------------------------------------------------------

def _agent_image(agent_id: str | None) -> str:
    return f"{ASSET_CDN}/agents/{agent_id}/displayicon.png" if agent_id else ""


def _map_image(map_id: str | None) -> str:
    # `listviewicon` is the wide banner tracker.gg-style rows use.
    return f"{ASSET_CDN}/maps/{map_id}/listviewicon.png" if map_id else ""


def _as_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _iso_from_meta(meta: dict) -> str:
    started = _parse_match_start(meta)
    return started.isoformat() if started else ""


def _parse_player(raw: dict, subject_puuid: str) -> MatchPlayer:
    stats = raw.get("stats") or {}
    # v4 exposes shot counts under stats; older shapes nest them differently.
    head = _as_int(stats.get("headshots"))
    body = _as_int(stats.get("bodyshots"))
    legs = _as_int(stats.get("legshots"))
    shots = head + body + legs
    kills = _as_int(stats.get("kills"))
    deaths = _as_int(stats.get("deaths"))
    assists = _as_int(stats.get("assists"))
    score = _as_int(stats.get("score"))
    agent = raw.get("agent") or {}
    tier = raw.get("tier") or {}
    damage = stats.get("damage")
    if isinstance(damage, dict):
        damage_dealt = _as_int(damage.get("dealt"))
        damage_received = _as_int(damage.get("received"))
    else:
        damage_dealt = _as_int(stats.get("damage_made"))
        damage_received = _as_int(stats.get("damage_received"))
    puuid = raw.get("puuid", "")
    return MatchPlayer(
        puuid=puuid,
        name=raw.get("name", ""),
        tag=raw.get("tag", ""),
        team_id=str(raw.get("team_id") or raw.get("team") or ""),
        agent=agent.get("name", ""),
        agent_id=agent.get("id", ""),
        agent_image=_agent_image(agent.get("id")),
        tier_name=(tier.get("name") or "").strip(),
        score=score,
        kills=kills,
        deaths=deaths,
        assists=assists,
        headshots=head,
        bodyshots=body,
        legshots=legs,
        damage_dealt=damage_dealt,
        damage_received=damage_received,
        acs=0,  # filled once round count is known
        kd=round(kills / deaths, 2) if deaths else float(kills),
        hs_percent=round(100 * head / shots, 1) if shots else 0.0,
        is_subject=bool(subject_puuid) and puuid == subject_puuid,
        party_id=str(raw.get("party_id") or ""),
    )


def _parse_team(raw: dict) -> MatchTeam:
    rounds = raw.get("rounds") or {}
    return MatchTeam(
        team_id=str(raw.get("team_id") or raw.get("team") or ""),
        won=raw.get("won"),
        rounds_won=_as_int(rounds.get("won")),
        rounds_lost=_as_int(rounds.get("lost")),
    )


def _round_count(teams: list[MatchTeam]) -> int:
    if not teams:
        return 0
    # Every team plays the same number of rounds; take the max team's total.
    return max((t.rounds_won + t.rounds_lost) for t in teams) or 0


def _weapon_image(weapon_id: str | None) -> str:
    return f"{ASSET_CDN}/weapons/{weapon_id}/displayicon.png" if weapon_id else ""


# A death answered within this window counts as a trade for KAST.
TRADE_WINDOW_MS = 5000


def _apply_timeline_stats(raw: dict, players: list[MatchPlayer], rounds: int) -> None:
    """Fill the kill/round-timeline stats (KAST, first bloods, multikills,
    plants/defuses, weapon breakdown) from the v4 `kills` + `rounds` arrays.
    A payload without those arrays leaves the defaults (zeros) in place."""
    by_puuid = {p.puuid: p for p in players if p.puuid}
    if not by_puuid:
        return
    subject = next((p for p in players if p.is_subject), None)
    subj_id = subject.puuid if subject else None

    def _duel(opp_id: str, direction: str) -> None:
        opp = by_puuid.get(opp_id)
        if subject is None or opp is None or opp_id == subj_id:
            return
        subject.duels.append({
            "puuid": opp_id, "name": opp.name, "tag": opp.tag,
            "agent_image": opp.agent_image, "dir": direction,
        })

    # --- plants / defuses ------------------------------------------------
    for rnd in raw.get("rounds") or []:
        for event, counter in (("plant", "plants"), ("defuse", "defuses")):
            actor = ((rnd.get(event) or {}).get("player") or {}).get("puuid")
            if actor in by_puuid:
                setattr(by_puuid[actor], counter, getattr(by_puuid[actor], counter) + 1)

    all_kills = raw.get("kills") or []
    if not all_kills:
        return

    # --- group the kill feed by round, chronologically --------------------
    rounds_kills: dict[int, list[dict]] = defaultdict(list)
    for k in all_kills:
        rounds_kills[_as_int(k.get("round"), -1)].append(k)
    for kills in rounds_kills.values():
        kills.sort(key=lambda k: _as_int(k.get("time_in_round_in_ms")))

    weapon_kills: dict[str, dict[str, dict]] = defaultdict(dict)  # puuid -> weapon_id -> row
    kast_rounds: dict[str, int] = defaultdict(int)

    for kills in rounds_kills.values():
        first = kills[0]
        fb_killer = (first.get("killer") or {}).get("puuid")
        fb_victim = (first.get("victim") or {}).get("puuid")
        if fb_killer in by_puuid:
            by_puuid[fb_killer].first_bloods += 1
        if fb_victim in by_puuid:
            by_puuid[fb_victim].first_deaths += 1

        round_kills: dict[str, int] = defaultdict(int)
        involved: set[str] = set()  # got a kill or assist this round
        death_time: dict[str, int] = {}  # victim puuid -> when they died
        for k in kills:
            killer = (k.get("killer") or {}).get("puuid")
            victim = (k.get("victim") or {}).get("puuid")
            t = _as_int(k.get("time_in_round_in_ms"))
            if killer == subj_id and victim:
                _duel(victim, "kill")
            elif victim == subj_id and killer:
                _duel(killer, "death")
            if killer in by_puuid:
                round_kills[killer] += 1
                involved.add(killer)
                weapon = k.get("weapon") or {}
                wid = weapon.get("id") or ""
                wname = weapon.get("name") or ("Ability" if (weapon.get("type") or "").lower() != "weapon" else "Unknown")
                row = weapon_kills[killer].setdefault(wid or wname, {
                    "id": wid, "name": wname, "image": _weapon_image(wid), "kills": 0,
                })
                row["kills"] += 1
            if victim in by_puuid:
                death_time[victim] = t
            for a in k.get("assistants") or []:
                ap = (a or {}).get("puuid")
                if ap in by_puuid:
                    involved.add(ap)

        for puuid, player in by_puuid.items():
            n = round_kills.get(puuid, 0)
            if n >= 3:
                player.multikills += 1
            player.best_kill_round = max(player.best_kill_round, n)

            died_at = death_time.get(puuid)
            traded = False
            if died_at is not None:
                # Whoever killed this player dying shortly after = a trade.
                killer = next(
                    ((k.get("killer") or {}).get("puuid") for k in kills
                     if (k.get("victim") or {}).get("puuid") == puuid),
                    None,
                )
                if killer is not None and killer in death_time:
                    traded = 0 <= death_time[killer] - died_at <= TRADE_WINDOW_MS
            if puuid in involved or died_at is None or traded:
                kast_rounds[puuid] += 1

    played = rounds or len(rounds_kills)
    # Rounds missing from the kill feed had no kills at all — everyone
    # survived them, which still counts toward KAST.
    silent = max(0, played - len(rounds_kills))
    for puuid, player in by_puuid.items():
        if played:
            player.kast = round(100 * (kast_rounds[puuid] + silent) / played, 1)
        player.weapons = sorted(
            weapon_kills.get(puuid, {}).values(), key=lambda w: -w["kills"]
        )


# Team-total buy-value thresholds (5 players), roughly standard across
# Valorant economy trackers. Approximate by design — real buy decisions are
# per-player, this just labels the round for a quick-scan graph.
BUY_ECO_MAX = 5000
BUY_SEMI_MAX = 20000


def _buy_type(loadout_value: int) -> str:
    if loadout_value < BUY_ECO_MAX:
        return "eco"
    if loadout_value < BUY_SEMI_MAX:
        return "semi"
    return "full"


def _parse_rounds(raw: dict) -> list[RoundInfo]:
    """Round-by-round outcome + team economy from the v4 payload's `rounds`
    array — already fetched for the kill-feed timeline stats, just unused
    until now. Tolerant of a missing/partial array."""
    out: list[RoundInfo] = []
    for i, rnd in enumerate(raw.get("rounds") or [], start=1):
        team_totals: dict[str, int] = defaultdict(int)
        team_counts: dict[str, int] = defaultdict(int)
        for s in rnd.get("stats") or []:
            player = s.get("player") or {}
            team = str(player.get("team") or "")
            if not team:
                continue
            econ = s.get("economy") or {}
            team_totals[team] += _as_int(econ.get("loadout_value"))
            team_counts[team] += 1
        team_loadouts = {
            team: round(total / team_counts[team]) for team, total in team_totals.items()
        }
        out.append(RoundInfo(
            number=_as_int(rnd.get("id"), i - 1) + 1,
            winning_team=str(rnd.get("winning_team") or ""),
            result=str(rnd.get("result") or ""),
            bomb_planted=bool(rnd.get("plant")) or bool(rnd.get("bomb_planted")),
            bomb_defused=bool(rnd.get("defuse")) or bool(rnd.get("bomb_defused")),
            team_loadouts=team_loadouts,
            team_buys={team: _buy_type(total) for team, total in team_loadouts.items()},
        ))
    return out


def parse_match(raw: dict, subject_puuid: str) -> Match:
    """Parse one HenrikDev v4 match object into a `Match`. Tolerant of missing
    keys — a partial payload yields zeros rather than raising."""
    meta = raw.get("metadata") or {}
    teams = [_parse_team(t) for t in (raw.get("teams") or [])]
    rounds = _round_count(teams)
    players = [_parse_player(p, subject_puuid) for p in (raw.get("players") or [])]
    for p in players:
        p.acs = round(p.score / rounds) if rounds else p.score
        if rounds:
            p.adr = round(p.damage_dealt / rounds, 1)
            p.dd_delta = round((p.damage_dealt - p.damage_received) / rounds, 1)
    _apply_timeline_stats(raw, players, rounds)

    game_map = meta.get("map") or {}
    queue = meta.get("queue") or {}
    season = meta.get("season") or {}
    length_ms = meta.get("game_length_in_ms")
    length_s = _as_int(length_ms) // 1000 if length_ms else _as_int(meta.get("game_length"))

    match = Match(
        match_id=meta.get("match_id", ""),
        map_name=game_map.get("name", ""),
        map_id=game_map.get("id", ""),
        map_image=_map_image(game_map.get("id")),
        mode=queue.get("name") or meta.get("mode") or "",
        started_at=_iso_from_meta(meta),
        game_length_seconds=length_s,
        teams=teams,
        players=players,
        season_name=_season_name(season.get("id", ""), season.get("short", "")),
        cluster=meta.get("cluster") or "",
        region=(meta.get("region") or "").upper(),
        queue_id=queue.get("id") or "",
        rounds_detail=_parse_rounds(raw),
    )

    subject = next((p for p in players if p.is_subject), None)
    if subject:
        team = next((t for t in teams if t.team_id == subject.team_id), None)
        match.subject_won = team.won if team else None
        match.subject_agent = subject.agent
        match.subject_agent_image = subject.agent_image
        match.subject_kills = subject.kills
        match.subject_deaths = subject.deaths
        match.subject_assists = subject.assists
        match.subject_acs = subject.acs
        match.subject_hs_percent = subject.hs_percent
        match.subject_adr = subject.adr
        match.subject_kast = subject.kast
        match.subject_first_bloods = subject.first_bloods
        match.subject_multikills = subject.multikills
        match.subject_weapons = subject.weapons
        match.subject_duels = subject.duels
        if subject.party_id:
            match.subject_party_size = sum(
                1 for p in players if p.party_id == subject.party_id
            )
        if players:
            top_acs = max(p.acs for p in players)
            match.subject_mvp = subject.acs == top_acs and top_acs > 0
            teammates = [p for p in players if p.team_id == subject.team_id]
            team_top = max(p.acs for p in teammates) if teammates else 0
            match.subject_team_mvp = (
                not match.subject_mvp and subject.acs == team_top and team_top > 0
            )
            # ACS placement across the whole lobby (1 = best).
            match.subject_placement = 1 + sum(1 for p in players if p.acs > subject.acs)
        if team:
            other = next((t for t in teams if t.team_id != team.team_id), None)
            opp = other.rounds_won if other else team.rounds_lost
            match.subject_score_line = f"{team.rounds_won} - {opp}"
    return match


def get_matches(region: str, puuid: str, *, mode: str | None = None, size: int = 10) -> list[Match]:
    """Recent matches with full scoreboards for `puuid`. `mode` filters by queue
    (e.g. "competitive"); omit for all queues. Cached briefly per (puuid, mode, size)."""
    size = max(1, min(size, 20))  # HenrikDev caps v4 history depth
    cache_key = f"riot:matches:v6:{puuid}:{mode or 'all'}:{size}"  # v6: season/cluster meta
    cached = cache.get(cache_key)
    if cached is not None:
        return [_match_from_cache(m) for m in cached]

    query = f"?size={size}" + (f"&mode={mode}" if mode else "")
    data = _get(f"/valorant/v4/by-puuid/matches/{region}/pc/{puuid}{query}")
    raw_matches = data if isinstance(data, list) else []
    matches = [parse_match(m, puuid) for m in raw_matches]
    cache.set(cache_key, [_match_to_cache(m) for m in matches], MATCHES_CACHE_TTL)
    return matches


def get_match(region: str, match_id: str, subject_puuid: str = "") -> Match:
    """A single match by id (works for matches outside the recent window)."""
    data = _get(f"/valorant/v4/match/{region}/{match_id}")
    if not data:
        raise ProviderError("Match not found.", not_found=True)
    return parse_match(data, subject_puuid)


def get_mmr_history(region: str, puuid: str, *, size: int = 20) -> list[MMRHistoryEntry]:
    """Ranked-rating timeline for the RR graph, newest first. Graceful: returns
    [] when the account hides its competitive history."""
    cache_key = f"riot:mmrhist:v1:{puuid}:{size}"
    cached = cache.get(cache_key)
    if cached is not None:
        return [MMRHistoryEntry(**e) for e in cached]

    try:
        data = _get(f"/valorant/v2/by-puuid/mmr-history/{region}/pc/{puuid}")
    except ProviderError as exc:
        if exc.not_found:
            return []
        raise
    raw = (data.get("history") if isinstance(data, dict) else data) or []
    entries: list[MMRHistoryEntry] = []
    for item in raw[:size]:
        tier = item.get("tier") or {}
        game_map = item.get("map") or {}
        raw_date = item.get("date") or item.get("date_raw")
        started_at = ""
        if raw_date:
            try:
                dt = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
                started_at = (dt if dt.tzinfo else dt.replace(tzinfo=dt_timezone.utc)).isoformat()
            except (ValueError, TypeError):
                started_at = ""
        entries.append(MMRHistoryEntry(
            match_id=item.get("match_id", ""),
            started_at=started_at,
            tier_name=(tier.get("name") or "").strip(),
            rr=item.get("rr"),
            rr_change=item.get("last_change", item.get("last_mmr_change")),
            map_name=game_map.get("name", ""),
        ))
    cache.set(cache_key, [e.__dict__ for e in entries], MMR_HISTORY_CACHE_TTL)
    return entries


# ---------------------------------------------------------------------------
# Stored matches: the lifetime history HenrikDev keeps, paginated and tagged
# with the act each game belongs to. Lighter than v4 (no kill feed / roster),
# but it reaches back across every act — the source for per-act career stats.
# ---------------------------------------------------------------------------

STORED_CACHE_TTL = 60 * 30  # 30 min — lifetime history changes slowly


@dataclass
class StoredMatch:
    match_id: str
    act: str  # HenrikDev season short, e.g. "e11a4" — used only as a bin key
    act_name: str  # authoritative display label, e.g. "V26 · Act IV"
    map_name: str
    map_id: str
    map_image: str
    mode: str
    started_at: str  # ISO-8601 UTC
    won: bool | None
    rounds: int
    agent: str
    agent_id: str
    agent_image: str
    tier: int  # numeric competitive tier (0 = unranked/hidden)
    score: int
    kills: int
    deaths: int
    assists: int
    head: int
    body: int
    leg: int
    damage_made: int
    damage_received: int
    rounds_won: int = 0
    rounds_lost: int = 0
    cluster: str = ""  # game-server location, e.g. "Mumbai" / "Singapore"
    region: str = ""   # account region shard, e.g. "ap"

    @property
    def acs(self) -> int:
        return round(self.score / self.rounds) if self.rounds else self.score

    @property
    def kd(self) -> float:
        return round(self.kills / self.deaths, 2) if self.deaths else float(self.kills)

    @property
    def hs_percent(self) -> float:
        shots = self.head + self.body + self.leg
        return round(100 * self.head / shots, 1) if shots else 0.0

    @property
    def adr(self) -> float:
        return round(self.damage_made / self.rounds, 1) if self.rounds else 0.0


def parse_stored_match(raw: dict) -> StoredMatch:
    """Parse one v1 stored-matches entry (subject's own line + team scores)."""
    meta = raw.get("meta") or {}
    stats = raw.get("stats") or {}
    teams = raw.get("teams") or {}
    game_map = meta.get("map") or {}
    season = meta.get("season") or {}
    agent = stats.get("character") or {}
    shots = stats.get("shots") or {}
    damage = stats.get("damage") or {}

    # teams is {"red": n, "blue": n}; the subject's team decides the outcome.
    team = str(stats.get("team") or "").lower()
    red, blue = _as_int(teams.get("red")), _as_int(teams.get("blue"))
    rounds = red + blue
    rounds_won = rounds_lost = 0
    if team in ("red", "blue"):
        rounds_won = red if team == "red" else blue
        rounds_lost = blue if team == "red" else red
    won = None
    if team in ("red", "blue") and red != blue:
        won = rounds_won > rounds_lost

    return StoredMatch(
        match_id=meta.get("id", ""),
        act=season.get("short", ""),
        act_name=_season_name(season.get("id", ""), season.get("short", "")),
        map_name=game_map.get("name", ""),
        map_id=game_map.get("id", ""),
        map_image=_map_image(game_map.get("id")),
        mode=meta.get("mode", ""),
        started_at=str(meta.get("started_at") or ""),
        won=won,
        rounds=rounds,
        agent=agent.get("name", ""),
        agent_id=agent.get("id", ""),
        agent_image=_agent_image(agent.get("id")),
        tier=_as_int(stats.get("tier")),
        score=_as_int(stats.get("score")),
        kills=_as_int(stats.get("kills")),
        deaths=_as_int(stats.get("deaths")),
        assists=_as_int(stats.get("assists")),
        head=_as_int(shots.get("head")),
        body=_as_int(shots.get("body")),
        leg=_as_int(shots.get("leg")),
        damage_made=_as_int(damage.get("made")),
        damage_received=_as_int(damage.get("received")),
        cluster=meta.get("cluster") or "",
        region=meta.get("region") or "",
    )


def get_stored_matches(
    region: str,
    game_name: str,
    tag_line: str,
    *,
    mode: str | None = "competitive",
    max_pages: int = 5,
    page_size: int = 100,
) -> list[StoredMatch]:
    """Paginated lifetime history for per-act career stats. Walks up to
    `max_pages` pages (newest first), stops early on a short page. Cached."""
    key_mode = mode or "all"
    cache_key = f"riot:stored:v3:{game_name.lower()}#{tag_line.lower()}:{key_mode}:{max_pages}x{page_size}"  # v3: cluster/region
    cached = cache.get(cache_key)
    if cached is not None:
        return [StoredMatch(**m) for m in cached]

    out: list[StoredMatch] = []
    for page in range(1, max_pages + 1):
        query = f"?size={page_size}&page={page}" + (f"&mode={mode}" if mode else "")
        try:
            data = _get(f"/valorant/v1/stored-matches/{region}/{game_name}/{tag_line}{query}")
        except ProviderError as exc:
            if exc.not_found and out:
                break  # ran past the last page
            if exc.not_found:
                return []
            raise
        rows = data if isinstance(data, list) else []
        if not rows:
            break
        out.extend(parse_stored_match(r) for r in rows)
        if len(rows) < page_size:
            break

    cache.set(cache_key, [m.__dict__ for m in out], STORED_CACHE_TTL)
    return out


def get_stored_matches_page(
    region: str,
    game_name: str,
    tag_line: str,
    *,
    mode: str | None = None,
    page: int = 1,
    size: int = 20,
) -> list[StoredMatch]:
    """One page of lifetime history, for the deep "load more" match browser.

    Unlike `get_stored_matches` (which always walks from page 1 for a
    career/backfill rollup), this fetches exactly the requested page — each
    page is its own cache entry, so paging forward never re-fetches earlier
    pages. This is how the Matches tab reaches games older than the ~20 most
    recent, since the detailed v4 match endpoint (`get_matches`) is hard
    capped there by HenrikDev and has no pagination at all.
    """
    key_mode = mode or "all"
    cache_key = f"riot:storedpage:v1:{game_name.lower()}#{tag_line.lower()}:{key_mode}:{page}x{size}"
    cached = cache.get(cache_key)
    if cached is not None:
        return [StoredMatch(**m) for m in cached]

    query = f"?size={size}&page={page}" + (f"&mode={mode}" if mode else "")
    try:
        data = _get(f"/valorant/v1/stored-matches/{region}/{game_name}/{tag_line}{query}")
    except ProviderError as exc:
        if exc.not_found:
            return []
        raise
    rows = data if isinstance(data, list) else []
    out = [parse_stored_match(r) for r in rows]
    cache.set(cache_key, [m.__dict__ for m in out], STORED_CACHE_TTL)
    return out


# Redis caches plain JSON, so Match (with nested dataclasses) is flattened to
# dicts on the way in and rebuilt on the way out.
def _match_to_cache(m: Match) -> dict:
    d = m.__dict__.copy()
    d["teams"] = [t.__dict__ for t in m.teams]
    d["players"] = [p.__dict__ for p in m.players]
    d["rounds_detail"] = [r.__dict__ for r in m.rounds_detail]
    return d


def _match_from_cache(d: dict) -> Match:
    d = dict(d)
    d["teams"] = [MatchTeam(**t) for t in d.get("teams", [])]
    d["players"] = [MatchPlayer(**p) for p in d.get("players", [])]
    d["rounds_detail"] = [RoundInfo(**r) for r in d.get("rounds_detail", [])]
    return Match(**d)
