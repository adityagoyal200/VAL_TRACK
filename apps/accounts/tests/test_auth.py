import pytest
from django.conf import settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import SocialAccount, User
from apps.accounts.services import login_social_user

GOOGLE_INFO = {"uid": "g-123", "email": "ada@example.com", "name": "Ada Lovelace"}
DISCORD_INFO = {
    "uid": "d-456",
    "email": "ada@example.com",
    "username": "ada_ll",
    "avatar": "abc123",
    "access_token": "at",
    "refresh_token": "rt",
    "expires_in": 3600,
}


@pytest.mark.django_db
class TestLoginSocialUser:
    def test_creates_user_and_social_account(self):
        user = login_social_user("google", GOOGLE_INFO)
        assert user.email == "ada@example.com"
        assert user.social_accounts.get().provider == "google"

    def test_same_provider_uid_returns_same_user(self):
        first = login_social_user("google", GOOGLE_INFO)
        second = login_social_user("google", GOOGLE_INFO)
        assert first == second
        assert User.objects.count() == 1

    def test_matching_email_links_second_provider(self):
        first = login_social_user("google", GOOGLE_INFO)
        second = login_social_user("discord", DISCORD_INFO)
        assert first == second
        assert set(
            SocialAccount.objects.filter(user=first).values_list("provider", flat=True)
        ) == {"google", "discord"}

    def test_discord_fields_stored(self):
        user = login_social_user("discord", DISCORD_INFO)
        account = user.social_accounts.get()
        assert account.discord_username == "ada_ll"
        assert account.discord_avatar_hash == "abc123"

    def test_username_collision_gets_suffix(self):
        User.objects.create_user(email="other@example.com", username="ada_ll")
        user = login_social_user("discord", DISCORD_INFO)
        assert user.username != "ada_ll"
        assert user.username.startswith("ada_ll")


@pytest.mark.django_db
class TestAuthEndpoints:
    def setup_method(self):
        self.client = APIClient()

    def _login(self):
        user = login_social_user("google", GOOGLE_INFO)
        refresh = RefreshToken.for_user(user)
        return user, refresh

    def test_me_requires_auth(self):
        assert self.client.get("/api/auth/me/").status_code == 401

    def test_me_returns_user(self):
        user, refresh = self._login()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        resp = self.client.get("/api/auth/me/")
        assert resp.status_code == 200
        assert resp.data["email"] == user.email
        assert resp.data["social_accounts"][0]["provider"] == "google"

    def test_refresh_without_cookie_is_401(self):
        assert self.client.post("/api/auth/token/refresh/").status_code == 401

    def test_refresh_with_cookie_rotates(self):
        _, refresh = self._login()
        self.client.cookies[settings.AUTH_COOKIE_NAME] = str(refresh)
        resp = self.client.post("/api/auth/token/refresh/")
        assert resp.status_code == 200
        assert "access" in resp.data
        new_cookie = resp.cookies[settings.AUTH_COOKIE_NAME].value
        assert new_cookie and new_cookie != str(refresh)

    def test_logout_blacklists_refresh(self):
        _, refresh = self._login()
        self.client.cookies[settings.AUTH_COOKIE_NAME] = str(refresh)
        assert self.client.post("/api/auth/logout/").status_code == 205
        # the blacklisted token can no longer refresh
        self.client.cookies[settings.AUTH_COOKIE_NAME] = str(refresh)
        assert self.client.post("/api/auth/token/refresh/").status_code == 401

    def test_google_callback_validates_body(self):
        resp = self.client.post("/api/auth/google/callback/", {})
        assert resp.status_code == 400
