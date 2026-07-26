"""Party / teammate analysis over the recent v4 match window.

Everything here needs the full roster and kill feed (party_id, per-kill
duels), which only the detailed v4 matches carry — so it reflects the recent
window, not all-time. Produces three views tracker.gg-style plus extras:

- party-size breakdown (solo / duo / trio / 4 / 5-stack)
- most-played-with teammates (the "duos & trios")
- nemeses and favourite victims from the kill feed
"""
from collections import defaultdict
from dataclasses import dataclass, field

from apps.integrations.services.henrikdev_client import Match


@dataclass
class PartySizeStat:
    size: int  # 1..5
    games: int = 0
    wins: int = 0
    kills: int = 0
    deaths: int = 0
    acs_total: int = 0
    placement_total: int = 0

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
    def avg_placement(self) -> float:
        return round(self.placement_total / self.games, 1) if self.games else 0.0


@dataclass
class Teammate:
    puuid: str
    name: str
    tag: str
    agent_image: str
    games: int = 0
    wins: int = 0

    @property
    def win_rate(self) -> float:
        return round(100 * self.wins / self.games, 1) if self.games else 0.0


@dataclass
class Duelist:
    """A recurring opponent: how the kill feed nets out against them."""
    puuid: str
    name: str
    tag: str
    agent_image: str
    kills: int = 0  # subject killed them
    deaths: int = 0  # they killed subject

    @property
    def diff(self) -> int:
        return self.kills - self.deaths


@dataclass
class Squad:
    party_sizes: list = field(default_factory=list)
    teammates: list = field(default_factory=list)
    nemeses: list = field(default_factory=list)  # kill you most (deaths desc)
    victims: list = field(default_factory=list)  # you kill most (kills desc)
    matches_analysed: int = 0
    solo_win_rate: float = 0.0
    stacked_win_rate: float = 0.0  # any party of 2+


def build_squad(matches: list[Match], subject_puuid: str) -> Squad:
    sizes: dict[int, PartySizeStat] = {}
    mates: dict[str, Teammate] = {}
    duels: dict[str, Duelist] = {}
    solo = PartySizeStat(size=1)
    stacked = PartySizeStat(size=0)

    analysed = 0
    for m in matches:
        subject = next((p for p in m.players if p.is_subject), None)
        if subject is None:
            continue
        analysed += 1
        won = m.subject_won

        size = max(1, min(m.subject_party_size, 5))
        bucket = sizes.setdefault(size, PartySizeStat(size=size))
        for b in (bucket, solo if size == 1 else stacked):
            b.games += 1
            b.wins += 1 if won else 0
            b.kills += m.subject_kills
            b.deaths += m.subject_deaths
            b.acs_total += m.subject_acs
            b.placement_total += m.subject_placement or 0

        # teammates who shared the subject's party this match
        if subject.party_id:
            for p in m.players:
                if p.is_subject or p.party_id != subject.party_id:
                    continue
                mate = mates.setdefault(
                    p.puuid, Teammate(p.puuid, p.name, p.tag, p.agent_image)
                )
                mate.games += 1
                mate.wins += 1 if won else 0

        # nemeses / victims from the subject's duel feed
        for d in m.subject_duels or []:
            opp = duels.setdefault(
                d["puuid"], Duelist(d["puuid"], d.get("name", ""), d.get("tag", ""), d.get("agent_image", ""))
            )
            if d.get("dir") == "kill":
                opp.kills += 1
            else:
                opp.deaths += 1

    squad = Squad()
    squad.matches_analysed = analysed
    squad.party_sizes = [sizes[s] for s in sorted(sizes)]
    squad.solo_win_rate = solo.win_rate
    squad.stacked_win_rate = stacked.win_rate
    # Only teammates seen more than once are meaningful "duos".
    squad.teammates = sorted(
        (t for t in mates.values() if t.games >= 2),
        key=lambda t: (-t.games, -t.win_rate),
    )[:8]
    squad.nemeses = sorted(
        (d for d in duels.values() if d.deaths >= 2),
        key=lambda d: (-d.deaths, d.diff),
    )[:5]
    squad.victims = sorted(
        (d for d in duels.values() if d.kills >= 2),
        key=lambda d: (-d.kills, -d.diff),
    )[:5]
    return squad
