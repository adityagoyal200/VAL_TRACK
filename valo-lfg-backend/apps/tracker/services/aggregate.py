"""Turn a list of parsed matches into the top-line numbers a tracker shows.

Figures come from the tracked player's own scoreboard line (`is_subject`),
so this works for any account without a second API round-trip. Matches are
assumed newest-first (the provider's order) — the streak relies on it.
"""
from collections import defaultdict
from dataclasses import dataclass, field

from apps.integrations.services.henrikdev_client import Match, MatchPlayer
from apps.tracker.services.rating import rate_match_player


@dataclass
class AgentStat:
    agent: str
    agent_image: str
    games: int = 0
    wins: int = 0
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    acs_total: int = 0
    adr_total: float = 0.0
    kast_total: float = 0.0
    hs_total: float = 0.0
    first_bloods: int = 0
    multikills: int = 0
    rating_total: float = 0.0
    rating_games: int = 0  # games that produced a rating (may be < games)

    @property
    def win_rate(self) -> float:
        return round(100 * self.wins / self.games, 1) if self.games else 0.0

    @property
    def kd(self) -> float:
        return round(self.kills / self.deaths, 2) if self.deaths else float(self.kills)

    @property
    def avg_acs(self) -> int:
        return round(self.acs_total / self.games) if self.games else 0

    @property
    def adr(self) -> float:
        return round(self.adr_total / self.games, 1) if self.games else 0.0

    @property
    def kast(self) -> float:
        return round(self.kast_total / self.games, 1) if self.games else 0.0

    @property
    def hs_percent(self) -> float:
        return round(self.hs_total / self.games, 1) if self.games else 0.0

    @property
    def avg_rating(self) -> float | None:
        return round(self.rating_total / self.rating_games, 1) if self.rating_games else None


@dataclass
class MapStat:
    map_name: str
    map_image: str
    games: int = 0
    wins: int = 0
    kills: int = 0
    deaths: int = 0
    acs_total: int = 0
    rating_total: float = 0.0
    rating_games: int = 0

    @property
    def win_rate(self) -> float:
        return round(100 * self.wins / self.games, 1) if self.games else 0.0

    @property
    def kd(self) -> float:
        return round(self.kills / self.deaths, 2) if self.deaths else float(self.kills)

    @property
    def avg_acs(self) -> int:
        return round(self.acs_total / self.games) if self.games else 0

    @property
    def avg_rating(self) -> float | None:
        return round(self.rating_total / self.rating_games, 1) if self.rating_games else None


@dataclass
class WeaponStat:
    weapon_id: str
    name: str
    image: str
    kills: int = 0


@dataclass
class Overview:
    matches_counted: int = 0
    wins: int = 0
    losses: int = 0
    draws: int = 0
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    acs_total: int = 0
    hs_total: float = 0.0
    adr_total: float = 0.0
    kast_total: float = 0.0
    # shot-location totals across the sample, for the accuracy silhouette
    headshots: int = 0
    bodyshots: int = 0
    legshots: int = 0
    damage_dealt: int = 0
    damage_received: int = 0
    first_bloods: int = 0
    first_deaths: int = 0
    multikills: int = 0
    best_kill_round: int = 0
    plants: int = 0
    defuses: int = 0
    mvps: int = 0
    team_mvps: int = 0
    current_streak: int = 0  # +n win streak / -n loss streak, newest game first
    ratings: list[float] = field(default_factory=list)  # per-game rating, newest-first
    best_match: dict | None = None  # highest-ACS game in the sample
    top_agents: list[AgentStat] = field(default_factory=list)
    top_maps: list[MapStat] = field(default_factory=list)
    top_weapons: list[WeaponStat] = field(default_factory=list)

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
        return round(self.acs_total / self.matches_counted) if self.matches_counted else 0

    @property
    def avg_kills(self) -> float:
        return round(self.kills / self.matches_counted, 1) if self.matches_counted else 0.0

    @property
    def adr(self) -> float:
        return round(self.adr_total / self.matches_counted, 1) if self.matches_counted else 0.0

    @property
    def kast(self) -> float:
        return round(self.kast_total / self.matches_counted, 1) if self.matches_counted else 0.0

    @property
    def hs_percent(self) -> float:
        return round(self.hs_total / self.matches_counted, 1) if self.matches_counted else 0.0

    @property
    def body_percent(self) -> float:
        shots = self.headshots + self.bodyshots + self.legshots
        return round(100 * self.bodyshots / shots, 1) if shots else 0.0

    @property
    def leg_percent(self) -> float:
        shots = self.headshots + self.bodyshots + self.legshots
        return round(100 * self.legshots / shots, 1) if shots else 0.0

    @property
    def hs_shot_percent(self) -> float:
        """Headshot share of all shots landed in the sample (the silhouette
        figure) — distinct from `hs_percent`, the per-match average."""
        shots = self.headshots + self.bodyshots + self.legshots
        return round(100 * self.headshots / shots, 1) if shots else 0.0

    @property
    def avg_rating(self) -> float | None:
        """Headline tracker score: mean of the rated games in the sample."""
        return round(sum(self.ratings) / len(self.ratings), 1) if self.ratings else None

    @property
    def rating_form(self) -> list[float]:
        """Recent ratings, newest-first, for the hero sparkline (last 15)."""
        return self.ratings[:15]


def _subject_line(m: Match) -> MatchPlayer | None:
    return next((p for p in m.players if p.is_subject), None)


def build_overview(matches: list[Match], *, top_n: int = 5) -> Overview:
    ov = Overview()
    agents: dict[str, AgentStat] = {}
    maps: dict[str, MapStat] = defaultdict(lambda: MapStat("", ""))
    weapons: dict[str, WeaponStat] = {}
    streak_open = True

    for m in matches:
        sub = _subject_line(m)
        if sub is None:
            continue
        ov.matches_counted += 1
        won = m.subject_won
        if won is True:
            ov.wins += 1
        elif won is False:
            ov.losses += 1
        else:
            ov.draws += 1

        # Streak: consecutive same-result run from the newest decided game.
        if streak_open and won is not None:
            step = 1 if won else -1
            if ov.current_streak == 0 or (ov.current_streak > 0) == won:
                ov.current_streak += step
            else:
                streak_open = False

        ov.kills += sub.kills
        ov.deaths += sub.deaths
        ov.assists += sub.assists
        ov.acs_total += sub.acs
        ov.hs_total += sub.hs_percent
        ov.adr_total += sub.adr
        ov.kast_total += sub.kast
        ov.headshots += sub.headshots
        ov.bodyshots += sub.bodyshots
        ov.legshots += sub.legshots
        ov.damage_dealt += sub.damage_dealt
        ov.damage_received += sub.damage_received
        ov.first_bloods += sub.first_bloods
        ov.first_deaths += sub.first_deaths
        ov.multikills += sub.multikills
        ov.best_kill_round = max(ov.best_kill_round, sub.best_kill_round)
        ov.plants += sub.plants
        ov.defuses += sub.defuses
        ov.mvps += 1 if m.subject_mvp else 0
        ov.team_mvps += 1 if m.subject_team_mvp else 0

        rating = rate_match_player(sub)
        if rating is not None:
            ov.ratings.append(rating)

        if ov.best_match is None or sub.acs > ov.best_match["acs"]:
            ov.best_match = {
                "match_id": m.match_id,
                "map_name": m.map_name,
                "map_image": m.map_image,
                "agent": sub.agent,
                "agent_image": sub.agent_image,
                "acs": sub.acs,
                "rating": rating,
                "kills": sub.kills,
                "deaths": sub.deaths,
                "assists": sub.assists,
                "won": won,
                "started_at": m.started_at,
            }

        a = agents.setdefault(sub.agent, AgentStat(sub.agent, sub.agent_image))
        a.games += 1
        a.wins += 1 if won else 0
        a.kills += sub.kills
        a.deaths += sub.deaths
        a.assists += sub.assists
        a.acs_total += sub.acs
        a.adr_total += sub.adr
        a.kast_total += sub.kast
        a.hs_total += sub.hs_percent
        a.first_bloods += sub.first_bloods
        a.multikills += sub.multikills
        if rating is not None:
            a.rating_total += rating
            a.rating_games += 1

        mp = maps[m.map_name]
        mp.map_name = m.map_name
        mp.map_image = m.map_image
        mp.games += 1
        mp.wins += 1 if won else 0
        mp.kills += sub.kills
        mp.deaths += sub.deaths
        mp.acs_total += sub.acs
        if rating is not None:
            mp.rating_total += rating
            mp.rating_games += 1

        for w in sub.weapons or []:
            key = w.get("id") or w.get("name", "")
            row = weapons.setdefault(key, WeaponStat(
                weapon_id=w.get("id", ""), name=w.get("name", ""), image=w.get("image", ""),
            ))
            row.kills += w.get("kills", 0)

    ov.top_agents = sorted(agents.values(), key=lambda s: (-s.games, -s.avg_acs))[:top_n]
    ov.top_maps = sorted(maps.values(), key=lambda s: (-s.games, -s.win_rate))[:top_n]
    ov.top_weapons = sorted(weapons.values(), key=lambda s: -s.kills)[:8]
    return ov
