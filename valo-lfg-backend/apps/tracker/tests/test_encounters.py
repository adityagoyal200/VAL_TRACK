"""Encounter persistence + lifetime duo/trio/stack aggregation, and the
backfill trigger/status endpoints (the celery task itself is mocked)."""
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.integrations.models import RiotAccountLink
from apps.integrations.services.henrikdev_client import Match, MatchPlayer, MatchTeam
from apps.tracker.models import EncounterBackfillJob, EncounterMatch, EncounterPlayer
from apps.tracker.services.encounters import build_encounters
from apps.tracker.services.ingest import ingest_match, ingest_matches


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(email="ada@example.com", username="ada")
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    client.user = user
    return client


def _linked(user):
    return RiotAccountLink.objects.create(
        user=user,
        riot_game_name="Akaari",
        riot_tag_line="001",
        puuid="subject",
        region="na",
        account_level=120,
        status=RiotAccountLink.Status.VERIFIED,
    )


def _player(puuid, team, party="", **overrides):
    base = dict(
        puuid=puuid, name=puuid, tag="tag", team_id=team, agent="Jett", agent_id="jett",
        agent_image="img", tier_name="", score=200, kills=10, deaths=10, assists=2,
        headshots=1, bodyshots=1, legshots=1, damage_dealt=1000, acs=200, kd=1.0,
        hs_percent=10.0, party_id=party,
    )
    base.update(overrides)
    return MatchPlayer(**base)


def _match(match_id, *, subject_won=True, party_a="party-a", party_enemy="party-e"):
    players = [
        _player("subject", "Red", party=party_a, is_subject=True),
        _player("friend", "Red", party=party_a),
        _player("solo_mate", "Red"),
        _player("enemy1", "Blue", party=party_enemy),
        _player("enemy2", "Blue", party=party_enemy),
    ]
    return Match(
        match_id=match_id, map_name="Ascent", map_id="mid", map_image="img", mode="Competitive",
        started_at="2026-07-04T18:30:00+00:00", game_length_seconds=2100,
        teams=[MatchTeam("Red", subject_won, 13, 9), MatchTeam("Blue", not subject_won, 9, 13)],
        players=players, season_name="V26 · Act IV", subject_won=subject_won,
    )


def test_ingest_match_persists_full_roster(db):
    assert ingest_match(_match("m1")) is True
    assert EncounterMatch.objects.filter(match_id="m1").count() == 1
    assert EncounterPlayer.objects.filter(match__match_id="m1").count() == 5


def test_ingest_match_idempotent(db):
    ingest_match(_match("m1"))
    assert ingest_match(_match("m1")) is False
    assert EncounterMatch.objects.count() == 1


def test_ingest_matches_counts_only_new(db):
    ingest_match(_match("m1"))
    n = ingest_matches([_match("m1"), _match("m2")])
    assert n == 1


def test_build_encounters_finds_teammates_opponents_and_groups(db):
    # Two matches so the min_games=2 threshold surfaces recurring entities.
    ingest_matches([_match("m1"), _match("m2")])

    e = build_encounters("subject")
    assert e.matches_analysed == 2

    teammate_puuids = {t.puuid for t in e.teammates}
    assert "friend" in teammate_puuids
    assert "solo_mate" in teammate_puuids

    opponent_puuids = {o.puuid for o in e.opponents}
    assert opponent_puuids == {"enemy1", "enemy2"}
    enemy1 = next(o for o in e.opponents if o.puuid == "enemy1")
    assert enemy1.games == 2
    assert enemy1.wins == 2  # subject_won=True both matches
    assert enemy1.win_rate == 100.0

    # subject+friend recur as a duo every match -> ally party.
    ally_sizes = {g.size for g in e.ally_parties}
    assert 2 in ally_sizes
    ally_duo = next(g for g in e.ally_parties if g.size == 2)
    assert ally_duo.games == 2
    assert ally_duo.side == "ally"

    # enemy1+enemy2 recur as a duo every match -> enemy party.
    assert len(e.enemy_parties) == 1
    enemy_duo = e.enemy_parties[0]
    assert enemy_duo.size == 2
    assert enemy_duo.side == "enemy"
    assert enemy_duo.games == 2
    assert enemy_duo.label == "Duo"


def test_build_encounters_no_history(db):
    e = build_encounters("nobody")
    assert e.matches_analysed == 0
    assert e.opponents == []


def test_encounters_endpoint(auth_client, monkeypatch):
    _linked(auth_client.user)
    monkeypatch.setattr(
        "apps.tracker.views.build_encounters",
        lambda puuid: build_encounters(puuid),
    )
    ingest_matches([_match("m1"), _match("m2")])
    # subject puuid in the linked account is "subject" (matches _linked above).
    resp = auth_client.get("/api/tracker/me/encounters/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["matches_analysed"] == 2
    assert len(body["enemy_parties"]) == 1


def test_backfill_trigger_and_status(auth_client, monkeypatch):
    _linked(auth_client.user)
    monkeypatch.setattr(
        "apps.tracker.views.backfill_encounter_history.delay", lambda job_id: None
    )

    resp = auth_client.post("/api/tracker/me/encounters/backfill/")
    assert resp.status_code == 202
    job_id = resp.json()["id"]
    assert resp.json()["status"] == "pending"

    # A second trigger while pending reuses the same job (no duplicate spam).
    resp2 = auth_client.post("/api/tracker/me/encounters/backfill/")
    assert resp2.json()["id"] == job_id

    status_resp = auth_client.get("/api/tracker/me/encounters/backfill/status/")
    assert status_resp.status_code == 200
    assert status_resp.json()["job"]["id"] == job_id


def test_backfill_requires_link(auth_client):
    resp = auth_client.post("/api/tracker/me/encounters/backfill/")
    assert resp.status_code == 409


def test_backfill_status_none_when_never_run(auth_client):
    _linked(auth_client.user)
    resp = auth_client.get("/api/tracker/me/encounters/backfill/status/")
    assert resp.status_code == 200
    assert resp.json() == {"job": None}
