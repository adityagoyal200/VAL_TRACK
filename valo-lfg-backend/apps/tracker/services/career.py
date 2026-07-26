"""Group a player's lifetime stored matches into per-act career stats.

Each `StoredMatch` carries the act it belongs to (`e11a4`, …), so this bins
matches by act and rolls up the core combat numbers plus per-agent and
per-map splits. An extra synthetic "all" bucket aggregates everything.
"""
from collections import defaultdict
from dataclasses import dataclass, field

from apps.integrations.services.henrikdev_client import StoredMatch
from apps.tracker.services.rating import rate_stored_match


@dataclass
class CareerAgent:
    agent: str
    agent_image: str
    games: int = 0
    wins: int = 0
    kills: int = 0
    deaths: int = 0
    acs_total: int = 0

    @property
    def win_rate(self) -> float:
        return round(100 * self.wins / self.games, 1) if self.games else 0.0

    @property
    def kd(self) -> float:
        return round(self.kills / self.deaths, 2) if self.deaths else float(self.kills)

    @property
    def avg_acs(self) -> int:
        return round(self.acs_total / self.games) if self.games else 0


@dataclass
class CareerMap:
    map_name: str
    map_image: str
    games: int = 0
    wins: int = 0
    acs_total: int = 0

    @property
    def win_rate(self) -> float:
        return round(100 * self.wins / self.games, 1) if self.games else 0.0

    @property
    def avg_acs(self) -> int:
        return round(self.acs_total / self.games) if self.games else 0


@dataclass
class ActStat:
    act: str  # HenrikDev short ("e11a4") or "all" — the bin key
    label: str = ""  # authoritative display, e.g. "V26 · Act IV"
    matches: int = 0
    wins: int = 0
    losses: int = 0
    draws: int = 0
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    acs_total: int = 0
    head: int = 0
    body: int = 0
    leg: int = 0
    damage_made: int = 0
    rounds: int = 0
    peak_tier: int = 0
    rating_total: float = 0.0
    rating_games: int = 0
    latest_at: str = ""  # newest match ISO ts in the bucket, for ordering
    agents: dict = field(default_factory=dict)
    maps: dict = field(default_factory=dict)

    @property
    def win_rate(self) -> float:
        decided = self.wins + self.losses
        return round(100 * self.wins / decided, 1) if decided else 0.0

    @property
    def kd(self) -> float:
        return round(self.kills / self.deaths, 2) if self.deaths else float(self.kills)

    @property
    def kda(self) -> float:
        return round((self.kills + self.assists) / self.deaths, 2) if self.deaths else float(self.kills + self.assists)

    @property
    def avg_acs(self) -> int:
        return round(self.acs_total / self.matches) if self.matches else 0

    @property
    def _shots(self) -> int:
        return self.head + self.body + self.leg

    @property
    def hs_percent(self) -> float:
        return round(100 * self.head / self._shots, 1) if self._shots else 0.0

    @property
    def body_percent(self) -> float:
        return round(100 * self.body / self._shots, 1) if self._shots else 0.0

    @property
    def leg_percent(self) -> float:
        return round(100 * self.leg / self._shots, 1) if self._shots else 0.0

    @property
    def avg_kills(self) -> float:
        return round(self.kills / self.matches, 1) if self.matches else 0.0

    @property
    def adr(self) -> float:
        return round(self.damage_made / self.rounds, 1) if self.rounds else 0.0

    @property
    def avg_rating(self) -> float | None:
        return round(self.rating_total / self.rating_games, 1) if self.rating_games else None

    @property
    def top_agents(self) -> list[CareerAgent]:
        return sorted(self.agents.values(), key=lambda a: (-a.games, -a.avg_acs))[:6]

    @property
    def top_maps(self) -> list[CareerMap]:
        return sorted(self.maps.values(), key=lambda m: (-m.games, -m.win_rate))[:8]


@dataclass
class ServerStat:
    """Games played on one game-server cluster (Mumbai, Singapore, …) across
    the whole stored history — 'where do I actually play' at a glance."""
    server: str
    games: int = 0
    wins: int = 0
    losses: int = 0
    acs_total: int = 0

    @property
    def win_rate(self) -> float:
        decided = self.wins + self.losses
        return round(100 * self.wins / decided, 1) if decided else 0.0

    @property
    def avg_acs(self) -> int:
        return round(self.acs_total / self.games) if self.games else 0


def build_server_breakdown(matches: list[StoredMatch]) -> list[ServerStat]:
    """Count games per server cluster, most-played first. Skips matches whose
    payload carried no cluster (older records / non-standard queues)."""
    by_server: dict[str, ServerStat] = {}
    for m in matches:
        name = (m.cluster or "").strip()
        if not name:
            continue
        s = by_server.setdefault(name, ServerStat(server=name))
        s.games += 1
        if m.won is True:
            s.wins += 1
        elif m.won is False:
            s.losses += 1
        s.acs_total += m.acs
    return sorted(by_server.values(), key=lambda s: -s.games)


def _accumulate(act: ActStat, m: StoredMatch) -> None:
    if not act.label and m.act_name:
        act.label = m.act_name
    if m.started_at > act.latest_at:
        act.latest_at = m.started_at
    act.matches += 1
    if m.won is True:
        act.wins += 1
    elif m.won is False:
        act.losses += 1
    else:
        act.draws += 1
    act.kills += m.kills
    act.deaths += m.deaths
    act.assists += m.assists
    act.acs_total += m.acs
    act.head += m.head
    act.body += m.body
    act.leg += m.leg
    act.damage_made += m.damage_made
    act.rounds += m.rounds
    act.peak_tier = max(act.peak_tier, m.tier)

    rating = rate_stored_match(m)
    if rating is not None:
        act.rating_total += rating
        act.rating_games += 1

    a = act.agents.setdefault(m.agent, CareerAgent(m.agent, m.agent_image))
    a.games += 1
    a.wins += 1 if m.won else 0
    a.kills += m.kills
    a.deaths += m.deaths
    a.acs_total += m.acs

    mp = act.maps.setdefault(m.map_name, CareerMap(m.map_name, m.map_image))
    mp.games += 1
    mp.wins += 1 if m.won else 0
    mp.acs_total += m.acs


def build_career(matches: list[StoredMatch]) -> tuple[list[ActStat], ActStat]:
    """Returns (per-act stats newest-act-first, lifetime 'all' bucket)."""
    by_act: dict[str, ActStat] = {}
    lifetime = ActStat(act="all", label="All Acts")

    for m in matches:
        if not m.act:
            continue
        act = by_act.setdefault(m.act, ActStat(act=m.act))
        _accumulate(act, m)
        _accumulate(lifetime, m)

    # Order by the newest match in each act (ISO ts sort chronologically), so
    # the current act leads. Act *shorts* can't be string-sorted — "e9" would
    # wrongly beat "e11" lexically.
    acts = sorted(by_act.values(), key=lambda a: a.latest_at, reverse=True)
    return acts, lifetime
