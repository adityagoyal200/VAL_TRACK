"""OAuth code exchange and user provisioning.

Both providers follow the same shape: the SPA obtains an authorization code
on its own callback route and POSTs it here; we exchange it server-side
(client secret never leaves the backend), fetch the provider's userinfo,
and get-or-create the platform User + SocialAccount.
"""
import logging
import re
import secrets
from datetime import timedelta

import httpx
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import SocialAccount, User

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token"
DISCORD_USER_URL = "https://discord.com/api/users/@me"


class OAuthError(Exception):
    """Raised when the provider rejects the exchange or returns bad data."""


def exchange_google_code(code: str, redirect_uri: str, code_verifier: str) -> dict:
    """Returns {"uid", "email", "name"} for the Google account."""
    token_resp = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "code_verifier": code_verifier,
        },
        timeout=10,
    )
    if token_resp.status_code != 200:
        logger.warning("Google token exchange failed: %s", token_resp.text[:500])
        raise OAuthError("Google rejected the authorization code.")
    access_token = token_resp.json().get("access_token")

    userinfo_resp = httpx.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if userinfo_resp.status_code != 200:
        raise OAuthError("Could not fetch Google user info.")
    info = userinfo_resp.json()
    if not info.get("email"):
        raise OAuthError("Google account has no email.")
    return {"uid": info["sub"], "email": info["email"], "name": info.get("name", "")}


def exchange_discord_code(code: str, redirect_uri: str) -> dict:
    """Returns {"uid", "email", "username", "avatar", tokens...} for the Discord account."""
    token_resp = httpx.post(
        DISCORD_TOKEN_URL,
        data={
            "client_id": settings.DISCORD_OAUTH_CLIENT_ID,
            "client_secret": settings.DISCORD_OAUTH_CLIENT_SECRET,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    if token_resp.status_code != 200:
        logger.warning("Discord token exchange failed: %s", token_resp.text[:500])
        raise OAuthError("Discord rejected the authorization code.")
    tokens = token_resp.json()

    user_resp = httpx.get(
        DISCORD_USER_URL,
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        timeout=10,
    )
    if user_resp.status_code != 200:
        raise OAuthError("Could not fetch Discord user info.")
    info = user_resp.json()
    if not info.get("email"):
        raise OAuthError("Discord account has no email; add one to your Discord account first.")
    return {
        "uid": info["id"],
        "email": info["email"],
        "username": info["username"],
        "avatar": info.get("avatar") or "",
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", ""),
        "expires_in": tokens.get("expires_in", 0),
    }


def _unique_username(base: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_]", "", base.replace(" ", "_"))[:24] or "player"
    candidate = base
    while User.objects.filter(username__iexact=candidate).exists():
        candidate = f"{base}_{secrets.token_hex(2)}"[:32]
    return candidate


@transaction.atomic
def login_social_user(provider: str, info: dict) -> User:
    """Find or create the User for a verified provider identity.

    Resolution order: existing SocialAccount -> existing User by email
    (links the new provider) -> brand-new User.
    """
    try:
        account = SocialAccount.objects.select_related("user").get(
            provider=provider, provider_uid=info["uid"]
        )
        user = account.user
    except SocialAccount.DoesNotExist:
        user = User.objects.filter(email__iexact=info["email"]).first()
        if user is None:
            display = info.get("username") or info.get("name") or info["email"].split("@")[0]
            user = User.objects.create_user(email=info["email"], username=_unique_username(display))
        account = SocialAccount(user=user, provider=provider, provider_uid=info["uid"])

    if provider == SocialAccount.Provider.DISCORD:
        account.discord_username = info["username"]
        account.discord_avatar_hash = info["avatar"]
        account.access_token = info["access_token"]
        account.refresh_token = info["refresh_token"]
        account.token_expires_at = timezone.now() + timedelta(seconds=info["expires_in"])
    account.save()

    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    return user
