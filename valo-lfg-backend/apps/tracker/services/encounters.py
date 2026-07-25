"""Lifetime encounter / premade history: who we've faced or teamed with
across every match persisted in `EncounterMatch`/`EncounterPlayer` — the
recent detailed-match window (ingested for free on every tracker view) plus
whatever the full-history backfill task has pulled in from past acts.

Party ids are per-match/session, not a stable identity — a recurring
"duo"/"trio"/"stack" is detected by the same SET of puuids repeatedly
sharing a party_id together, not by the party_id value itself (which is
different every time the same friends queue up again).
"""
from collections import defaultdict
from dataclasses import dataclass, field

from apps.tracker.models import EncounterPlayer


@dataclass
class EncounteredPlayer:
    puuid: str
    name: str
    tag: str
    agent_image: str
    games: int = 0
    wins: int = 0
    losses: int = 0
    acts: set = field(default_factory=set)
    last_seen: str = ""  # ISO started_at of the most recent shared match
    first_seen: str = ""  # ISO started_at of the *earliest* shared match across
    #                       ALL acts — when this account first showed up with the
    #                       subject (as close as we can get to "when they met")
    first_seen_act: str = ""  # season/act name of that earliest shared match

    @property
    def win_rate(self) -> float:
        decided = self.wins + self.losses
        return round(100 * self.wins / decided, 1) if decided else 0.0

    @property
    def act_list(self) -> list:
        return sorted(self.acts)


@dataclass
class PartyGroup:
    puuids: tuple
    names: list  # [(name, tag, agent_image), ...] in a stable order
    size: int
    side: str  # "ally" | "enemy"
    games: int = 0
    acts: set = field(default_factory=set)
    last_seen: str = ""
    first_seen: str = ""  # ISO started_at of the first game this exact group appeared together
    first_seen_act: str = ""  # season/act name of that first game

    @property
    def label(self) -> str:
        if self.size == 2:
            return "Duo"
        if self.size == 3:
            return "Trio"
        return f"{self.size}-Stack"

    @property
    def act_list(self) -> list:
        return sorted(self.acts)


def _member_dicts(rows) -> list:
    return [{"name": r.name, "tag": r.tag, "agent_image": r.agent_image} for r in rows]


@dataclass
class Encounters:
    matches_analysed: int = 0
    opponents: list = field(default_factory=list)
    teammates: list = field(default_factory=list)
    enemy_parties: list = field(default_factory=list)  # duos/trios/stacks faced
    ally_parties: list = field(default_factory=list)  # duos/trios/stacks on our own team


def build_encounters(subject_puuid: str, *, min_games: int = 2, top_n: int = 25) -> Encounters:
    subject_rows = list(
        EncounterPlayer.objects.filter(puuid=subject_puuid).select_related("match")
    )
    if not subject_rows:
        return Encounters()

    match_pks = [r.match_id for r in subject_rows]  # EncounterMatch's internal PK (FK column)
    subject_team_by_pk = {r.match_id: r.team_id for r in subject_rows}
    match_meta_by_pk = {r.match_id: r.match for r in subject_rows}

    all_rows = EncounterPlayer.objects.filter(match_id__in=match_pks).select_related("match")
    by_match = defaultdict(list)
    for row in all_rows:
        by_match[row.match_id].append(row)

    opponents: dict[str, EncounteredPlayer] = {}
    teammates: dict[str, EncounteredPlayer] = {}
    enemy_groups: dict[tuple, PartyGroup] = {}
    ally_groups: dict[tuple, PartyGroup] = {}

    for pk, rows in by_match.items():
        match = match_meta_by_pk[pk]
        subject_team = subject_team_by_pk[pk]
        act = match.season_name or "Unknown act"
        started_at = match.started_at.isoformat() if match.started_at else ""
        subject_won = next((r.won for r in rows if r.puuid == subject_puuid), None)

        # Per-player lifetime tallies (excluding the subject's own row).
        for row in rows:
            if row.puuid == subject_puuid:
                continue
            bucket = teammates if row.team_id == subject_team else opponents
            entry = bucket.setdefault(
                row.puuid, EncounteredPlayer(row.puuid, row.name, row.tag, row.agent_image)
            )
            entry.games += 1
            entry.acts.add(act)
            if not entry.last_seen or started_at > entry.last_seen:
                entry.last_seen = started_at
                entry.name, entry.tag, entry.agent_image = row.name, row.tag, row.agent_image
            if started_at and (not entry.first_seen or started_at < entry.first_seen):
                entry.first_seen = started_at
                entry.first_seen_act = act
            if subject_won is True:
                entry.wins += 1
            elif subject_won is False:
                entry.losses += 1

        # Party-group sightings: group each team's roster by party_id, key by
        # the sorted set of member puuids so the same friend-group is
        # recognised across matches even though party_id itself changes.
        by_team = defaultdict(list)
        for row in rows:
            by_team[row.team_id].append(row)

        for team_id, team_rows in by_team.items():
            by_party = defaultdict(list)
            for row in team_rows:
                if row.party_id:
                    by_party[row.party_id].append(row)
            for members in by_party.values():
                if len(members) < 2:
                    continue
                side = "ally" if team_id == subject_team else "enemy"
                key_members = sorted(members, key=lambda r: r.puuid)
                key = tuple(m.puuid for m in key_members)
                groups = ally_groups if side == "ally" else enemy_groups
                grp = groups.setdefault(
                    key,
                    PartyGroup(
                        puuids=key,
                        names=_member_dicts(key_members),
                        size=len(key_members),
                        side=side,
                    ),
                )
                grp.games += 1
                grp.acts.add(act)
                if not grp.last_seen or started_at > grp.last_seen:
                    grp.last_seen = started_at
                    grp.names = _member_dicts(key_members)
                if started_at and (not grp.first_seen or started_at < grp.first_seen):
                    grp.first_seen = started_at
                    grp.first_seen_act = act

    result = Encounters()
    result.matches_analysed = len(by_match)
    result.opponents = sorted(
        (p for p in opponents.values() if p.games >= min_games), key=lambda p: -p.games
    )[:top_n]
    result.teammates = sorted(
        (p for p in teammates.values() if p.games >= min_games), key=lambda p: -p.games
    )[:top_n]
    result.enemy_parties = sorted(
        (g for g in enemy_groups.values() if g.games >= min_games),
        key=lambda g: (-g.games, -g.size),
    )[:top_n]
    result.ally_parties = sorted(
        (g for g in ally_groups.values() if g.games >= min_games),
        key=lambda g: (-g.games, -g.size),
    )[:top_n]
    return result
