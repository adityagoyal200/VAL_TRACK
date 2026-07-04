import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(email="ada@example.com", username="ada")
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}"
    )
    client.user = user
    return client


BASICS = {"region": "eu", "language": "en", "comm_preference": "voice", "bio": "hi"}
SCHEDULE = {
    "blocks": [
        {"day_of_week": 0, "start_time": "20:00", "end_time": "23:00", "timezone": "Europe/Berlin"},
        {"day_of_week": 5, "start_time": "14:00", "end_time": "18:00", "timezone": "Europe/Berlin"},
    ]
}


class TestProfile:
    def test_get_creates_empty_profile(self, auth_client):
        resp = auth_client.get("/api/profile/")
        assert resp.status_code == 200
        assert resp.data["onboarding_completed"] is False

    def test_patch_basics(self, auth_client):
        resp = auth_client.patch("/api/profile/", BASICS)
        assert resp.status_code == 200
        assert resp.data["region"] == "eu"
        assert resp.data["comm_preference"] == "voice"

    def test_patch_rejects_bad_region(self, auth_client):
        resp = auth_client.patch("/api/profile/", {"region": "moon"})
        assert resp.status_code == 400

    def test_requires_auth(self):
        assert APIClient().get("/api/profile/").status_code == 401


class TestRoleTags:
    def test_put_replaces_set(self, auth_client):
        resp = auth_client.put("/api/profile/role-tags/", {"roles": ["igl", "entry"]})
        assert resp.status_code == 200
        assert set(resp.data["role_tags"]) == {"igl", "entry"}
        resp = auth_client.put("/api/profile/role-tags/", {"roles": ["flex"]})
        assert resp.data["role_tags"] == ["flex"]

    def test_rejects_unknown_role(self, auth_client):
        resp = auth_client.put("/api/profile/role-tags/", {"roles": ["camper"]})
        assert resp.status_code == 400

    def test_duplicates_are_deduped(self, auth_client):
        resp = auth_client.put("/api/profile/role-tags/", {"roles": ["igl", "igl"]})
        assert resp.status_code == 200
        assert resp.data["role_tags"] == ["igl"]


class TestSchedule:
    def test_put_replaces_blocks(self, auth_client):
        resp = auth_client.put("/api/profile/schedule/", SCHEDULE, format="json")
        assert resp.status_code == 200
        assert len(resp.data["schedule_blocks"]) == 2

    def test_rejects_inverted_times(self, auth_client):
        bad = {"blocks": [{"day_of_week": 0, "start_time": "23:00", "end_time": "20:00", "timezone": "UTC"}]}
        assert auth_client.put("/api/profile/schedule/", bad, format="json").status_code == 400

    def test_rejects_unknown_timezone(self, auth_client):
        bad = {"blocks": [{"day_of_week": 0, "start_time": "20:00", "end_time": "22:00", "timezone": "Mars/Olympus"}]}
        assert auth_client.put("/api/profile/schedule/", bad, format="json").status_code == 400


class TestCompleteOnboarding:
    def test_rejects_incomplete_profile(self, auth_client):
        resp = auth_client.post("/api/profile/complete-onboarding/")
        assert resp.status_code == 400
        assert "region" in resp.data["missing"]
        assert "role_tags" in resp.data["missing"]

    def test_completes_when_ready(self, auth_client):
        auth_client.patch("/api/profile/", BASICS)
        auth_client.put("/api/profile/role-tags/", {"roles": ["igl"]})
        resp = auth_client.post("/api/profile/complete-onboarding/")
        assert resp.status_code == 200
        assert resp.data["onboarding_completed"] is True
        # flag now shows up on /api/auth/me/
        me = auth_client.get("/api/auth/me/")
        assert me.data["onboarding_completed"] is True


class TestPublicUser:
    def test_shows_public_subset(self, auth_client):
        auth_client.patch("/api/profile/", BASICS)
        other = User.objects.create_user(email="o@example.com", username="other")
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(other).access_token}"
        )
        resp = client.get(f"/api/users/{auth_client.user.id}/")
        assert resp.status_code == 200
        assert resp.data["username"] == "ada"
        assert resp.data["profile"]["region"] == "eu"
        assert "email" not in resp.data
