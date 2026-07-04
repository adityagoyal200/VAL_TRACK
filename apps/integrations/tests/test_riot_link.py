from datetime import timedelta
from io import BytesIO

import pytest
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.integrations.models import RiotAccountLink
from apps.integrations.services.henrikdev_client import (
    ProviderError,
    RiotAccount,
    RiotMMR,
)
from apps.integrations.tasks import poll_riot_verification

ACCOUNT = RiotAccount(puuid="puuid-1", region="eu", account_level=120)
MMR = RiotMMR(current_tier="ascendant", current_rr=44, peak_tier="immortal")


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(email="ada@example.com", username="ada")
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}"
    )
    client.user = user
    return client


@pytest.fixture
def mock_provider(monkeypatch):
    """Patches the provider seam; tests tweak attributes to change behavior."""

    class Provider:
        account = ACCOUNT
        mmr = MMR
        match_id = None
        account_error = None

        def get_account(self, name, tag):
            if self.account_error:
                raise self.account_error
            return self.account

        def get_mmr(self, region, puuid):
            return self.mmr

        def get_latest_match_after(self, region, puuid, after):
            return self.match_id

    provider = Provider()
    for module in ("apps.integrations.views", "apps.integrations.tasks"):
        monkeypatch.setattr(f"{module}.henrikdev_client.get_account", provider.get_account, raising=False)
        monkeypatch.setattr(f"{module}.henrikdev_client.get_mmr", provider.get_mmr, raising=False)
        monkeypatch.setattr(
            f"{module}.henrikdev_client.get_latest_match_after",
            provider.get_latest_match_after,
            raising=False,
        )
    return provider


@pytest.fixture
def celery_eager(monkeypatch):
    """Keep the poll task from actually being enqueued during view tests."""
    monkeypatch.setattr(
        "apps.integrations.views.poll_riot_verification.apply_async",
        lambda *a, **kw: None,
    )


def png_file():
    buf = BytesIO()
    Image.new("RGB", (10, 10)).save(buf, format="PNG")
    buf.seek(0)
    buf.name = "career.png"
    return buf


class TestRiotLinkCreate:
    def test_creates_pending_link_with_window(self, auth_client, mock_provider, celery_eager):
        resp = auth_client.post(
            "/api/riot-link/", {"riot_game_name": "Ada", "riot_tag_line": "EUW"}
        )
        assert resp.status_code == 201
        assert resp.data["status"] == "pending"
        assert 0 < resp.data["verification_seconds_remaining"] <= 600
        link = RiotAccountLink.objects.get(user=auth_client.user)
        assert link.puuid == "puuid-1"
        assert link.region == "eu"

    def test_unknown_account_is_404(self, auth_client, mock_provider, celery_eager):
        mock_provider.account_error = ProviderError("not found", not_found=True)
        resp = auth_client.post(
            "/api/riot-link/", {"riot_game_name": "Ghost", "riot_tag_line": "NOPE"}
        )
        assert resp.status_code == 404

    def test_provider_down_is_502(self, auth_client, mock_provider, celery_eager):
        mock_provider.account_error = ProviderError("down")
        resp = auth_client.post(
            "/api/riot-link/", {"riot_game_name": "Ada", "riot_tag_line": "EUW"}
        )
        assert resp.status_code == 502

    def test_riot_id_verified_by_other_user_conflicts(
        self, auth_client, mock_provider, celery_eager
    ):
        other = User.objects.create_user(email="o@example.com", username="other")
        RiotAccountLink.objects.create(
            user=other,
            riot_game_name="Ada",
            riot_tag_line="EUW",
            status=RiotAccountLink.Status.VERIFIED,
        )
        resp = auth_client.post(
            "/api/riot-link/", {"riot_game_name": "ada", "riot_tag_line": "euw"}
        )
        assert resp.status_code == 409

    def test_retry_after_expiry_restarts_window(self, auth_client, mock_provider, celery_eager):
        auth_client.post("/api/riot-link/", {"riot_game_name": "Ada", "riot_tag_line": "EUW"})
        RiotAccountLink.objects.filter(user=auth_client.user).update(
            status=RiotAccountLink.Status.EXPIRED
        )
        resp = auth_client.post(
            "/api/riot-link/", {"riot_game_name": "Ada", "riot_tag_line": "EUW"}
        )
        assert resp.status_code == 201
        assert resp.data["status"] == "pending"


class TestVerificationTask:
    def test_match_inside_window_verifies_and_pulls_rank(self, db, mock_provider):
        user = User.objects.create_user(email="a@example.com", username="a")
        now = timezone.now()
        link = RiotAccountLink.objects.create(
            user=user,
            riot_game_name="Ada",
            riot_tag_line="EUW",
            puuid="puuid-1",
            region="eu",
            verification_window_start=now,
            verification_window_end=now + timedelta(minutes=10),
        )
        mock_provider.match_id = "match-123"
        assert poll_riot_verification(link.pk) == "verified"
        link.refresh_from_db()
        assert link.status == RiotAccountLink.Status.VERIFIED
        assert link.verification_match_id == "match-123"
        assert link.current_tier == "ascendant"
        assert link.peak_tier == "immortal"

    def test_window_elapsed_expires(self, db, mock_provider):
        user = User.objects.create_user(email="b@example.com", username="b")
        now = timezone.now()
        # Past the window AND the propagation grace period -> expired.
        link = RiotAccountLink.objects.create(
            user=user,
            riot_game_name="Bob",
            riot_tag_line="EUW",
            puuid="puuid-2",
            region="eu",
            verification_window_start=now - timedelta(minutes=30),
            verification_window_end=now - timedelta(minutes=20),
        )
        assert poll_riot_verification(link.pk) == "expired"
        link.refresh_from_db()
        assert link.status == RiotAccountLink.Status.EXPIRED

    def test_keeps_polling_during_grace_then_verifies(self, db, mock_provider):
        """A match ingested a few minutes after the window closes still verifies,
        because polling continues through the propagation grace period."""
        from celery.exceptions import Retry

        user = User.objects.create_user(email="c@example.com", username="c")
        now = timezone.now()
        link = RiotAccountLink.objects.create(
            user=user,
            riot_game_name="Cid",
            riot_tag_line="EUW",
            puuid="puuid-3",
            region="eu",
            verification_window_start=now - timedelta(minutes=12),
            verification_window_end=now - timedelta(minutes=2),  # closed, but within grace
        )
        # Match not ingested yet -> still polling, not expired.
        with pytest.raises(Retry):
            poll_riot_verification(link.pk)
        link.refresh_from_db()
        assert link.status == RiotAccountLink.Status.PENDING

        # Match lands during grace -> verifies.
        mock_provider.match_id = "late-match"
        assert poll_riot_verification(link.pk) == "verified"
        link.refresh_from_db()
        assert link.status == RiotAccountLink.Status.VERIFIED


class TestManualReview:
    def test_upload_sets_manual_review(self, auth_client, mock_provider, celery_eager):
        auth_client.post("/api/riot-link/", {"riot_game_name": "Ada", "riot_tag_line": "EUW"})
        resp = auth_client.post(
            "/api/riot-link/manual-review/",
            {"screenshot": png_file()},
            format="multipart",
        )
        assert resp.status_code == 200
        assert resp.data["status"] == "manual_review"

    def test_upload_without_link_is_400(self, auth_client):
        resp = auth_client.post(
            "/api/riot-link/manual-review/",
            {"screenshot": png_file()},
            format="multipart",
        )
        assert resp.status_code == 400


class TestStatusAndRefresh:
    def test_status_none_without_link(self, auth_client):
        resp = auth_client.get("/api/riot-link/status/")
        assert resp.data["status"] == "none"

    def test_refresh_rank_cooldown(self, auth_client, mock_provider):
        RiotAccountLink.objects.create(
            user=auth_client.user,
            riot_game_name="Ada",
            riot_tag_line="EUW",
            puuid="puuid-1",
            region="eu",
            status=RiotAccountLink.Status.VERIFIED,
            last_rank_refresh_at=timezone.now(),
        )
        assert auth_client.post("/api/riot-link/refresh-rank/").status_code == 429

    def test_refresh_rank_updates_tier(self, auth_client, mock_provider):
        RiotAccountLink.objects.create(
            user=auth_client.user,
            riot_game_name="Ada",
            riot_tag_line="EUW",
            puuid="puuid-1",
            region="eu",
            status=RiotAccountLink.Status.VERIFIED,
        )
        resp = auth_client.post("/api/riot-link/refresh-rank/")
        assert resp.status_code == 200
        assert resp.data["current_tier"] == "ascendant"

    def test_delete_unlinks(self, auth_client, mock_provider, celery_eager):
        auth_client.post("/api/riot-link/", {"riot_game_name": "Ada", "riot_tag_line": "EUW"})
        assert auth_client.delete("/api/riot-link/").status_code == 204
        assert auth_client.get("/api/riot-link/status/").data["status"] == "none"
