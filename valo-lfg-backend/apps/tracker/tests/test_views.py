"""Tracker endpoint wiring — the provider seam is mocked, so no network."""
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.integrations.models import RiotAccountLink
from apps.integrations.services import henrikdev_client as riot
from apps.integrations.services.henrikdev_client import Match, MatchPlayer, MatchTeam, RiotMMR
from apps.tracker.models import SkinCollection


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
        puuid="puuid-1",
        region="na",
        account_level=120,
        status=RiotAccountLink.Status.VERIFIED,
    )


def _sample_match():
    subject = MatchPlayer(
        puuid="puuid-1", name="Akaari", tag="001", team_id="Red", agent="Jett",
        agent_id="jett-uuid", agent_image="img", tier_name="Diamond 2", score=6300,
        kills=24, deaths=15, assists=5, headshots=40, bodyshots=55, legshots=5,
        damage_dealt=4200, acs=286, kd=1.6, hs_percent=40.0, is_subject=True,
    )
    return Match(
        match_id="m1", map_name="Ascent", map_id="mid", map_image="img", mode="Competitive",
        started_at="2026-07-04T18:30:00+00:00", game_length_seconds=2100,
        teams=[MatchTeam("Red", True, 13, 9), MatchTeam("Blue", False, 9, 13)],
        players=[subject],
        subject_won=True, subject_agent="Jett", subject_kills=24, subject_deaths=15,
        subject_assists=5, subject_acs=286, subject_hs_percent=40.0, subject_score_line="13 - 9",
    )


@pytest.fixture
def mock_seam(monkeypatch):
    monkeypatch.setattr(riot, "get_matches", lambda *a, **k: [_sample_match()])
    monkeypatch.setattr(riot, "get_mmr_history", lambda *a, **k: [])
    monkeypatch.setattr(
        riot, "get_mmr",
        lambda *a, **k: RiotMMR(current_tier="diamond", current_rr=44, peak_tier="ascendant",
                                current_division=2, peak_division=1),
    )


def test_overview_requires_link(auth_client):
    resp = auth_client.get("/api/tracker/me/overview/")
    assert resp.status_code == 409


def test_overview_returns_envelope(auth_client, mock_seam):
    _linked(auth_client.user)
    resp = auth_client.get("/api/tracker/me/overview/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["profile"]["riot_game_name"] == "Akaari"
    assert body["profile"]["current_tier"] == "diamond"
    assert body["stats"]["wins"] == 1
    assert body["stats"]["win_rate"] == 100.0
    assert len(body["recent_matches"]) == 1
    assert body["recent_matches"][0]["subject_score_line"] == "13 - 9"


def test_matches_list(auth_client, mock_seam):
    _linked(auth_client.user)
    resp = auth_client.get("/api/tracker/me/matches/?mode=competitive&size=5")
    assert resp.status_code == 200
    assert resp.json()["matches"][0]["match_id"] == "m1"


def test_match_detail_found_in_recent(auth_client, mock_seam):
    _linked(auth_client.user)
    resp = auth_client.get("/api/tracker/me/matches/m1/")
    assert resp.status_code == 200
    assert resp.json()["match_id"] == "m1"
    assert "players" in resp.json() and "teams" in resp.json()


def test_match_detail_requires_link(auth_client):
    resp = auth_client.get("/api/tracker/me/matches/whatever/")
    assert resp.status_code == 409


# --- skin collection sync ---------------------------------------------------

def test_skin_sync_roundtrip(auth_client):
    # 1. signed-in user mints a pairing code
    resp = auth_client.post("/api/tracker/collection/code/")
    assert resp.status_code == 200
    code = resp.json()["code"]

    # 2. the (unauthenticated) desktop app pushes with that code
    anon = APIClient()
    resp = anon.post(
        "/api/tracker/collection/upload/",
        {"code": code, "skin_levels": ["level-a", "level-b"]},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["count"] == 2

    # 3. code is single-use
    resp = anon.post(
        "/api/tracker/collection/upload/",
        {"code": code, "skin_levels": ["level-a"]},
        format="json",
    )
    assert resp.status_code == 403

    # 4. the web app reads the collection back
    resp = auth_client.get("/api/tracker/me/skins/")
    assert resp.status_code == 200
    assert resp.json()["skin_levels"] == ["level-a", "level-b"]
    assert SkinCollection.objects.filter(user=auth_client.user).exists()


def test_skin_upload_rejects_bad_code(auth_client):
    anon = APIClient()
    resp = anon.post(
        "/api/tracker/collection/upload/",
        {"code": "NOPE1234", "skin_levels": ["x"]},
        format="json",
    )
    assert resp.status_code == 403


def test_skins_empty_before_sync(auth_client):
    resp = auth_client.get("/api/tracker/me/skins/")
    assert resp.status_code == 200
    assert resp.json() == {"skin_levels": [], "updated_at": None}
