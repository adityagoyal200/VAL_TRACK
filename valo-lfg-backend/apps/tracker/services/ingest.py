"""Persists full match rosters (teammates + opponents + party_id) into the DB
so lifetime encounter/premade history survives beyond HenrikDev's cached
recent-match window. Matches are immutable historical facts once played, so
ingestion is a cheap "insert once, skip forever after" — called for free
every time the tracker already fetches a full v4 match (recent window, match
detail) and also driven explicitly by the full-history backfill task.
"""
from datetime import datetime, timezone as dt_timezone

from django.db import transaction

from apps.integrations.services.henrikdev_client import Match
from apps.tracker.models import EncounterMatch, EncounterPlayer


def _parse_started_at(value: str):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=dt_timezone.utc)
    except ValueError:
        return None


def ingest_match(match: Match) -> bool:
    """Stores `match`'s full roster if not already known. Returns True if this
    call actually persisted a new match (False when already-ingested)."""
    if not match.match_id or not match.players:
        return False
    if EncounterMatch.objects.filter(match_id=match.match_id).exists():
        return False

    won_by_team = {t.team_id: t.won for t in match.teams}

    with transaction.atomic():
        row = EncounterMatch.objects.create(
            match_id=match.match_id,
            map_name=match.map_name,
            mode=match.mode,
            season_name=match.season_name,
            started_at=_parse_started_at(match.started_at),
        )
        EncounterPlayer.objects.bulk_create(
            EncounterPlayer(
                match=row,
                puuid=p.puuid,
                name=p.name,
                tag=p.tag,
                team_id=p.team_id,
                party_id=p.party_id,
                agent=p.agent,
                agent_image=p.agent_image,
                won=won_by_team.get(p.team_id),
            )
            for p in match.players
            if p.puuid
        )
    return True


def ingest_matches(matches: list[Match]) -> int:
    """Ingests each match, returning how many were newly persisted."""
    return sum(1 for m in matches if ingest_match(m))
