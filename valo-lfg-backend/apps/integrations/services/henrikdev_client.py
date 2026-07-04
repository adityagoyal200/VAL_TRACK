"""The single seam for Valorant data.

Everything the platform knows about Riot accounts flows through this module,
so swapping HenrikDev for the official Riot API (post-approval) or a
self-hosted fork touches only this file.

Results are cached in Redis: account metadata rarely changes, and rank
doesn't need to be fresher than ~15 minutes.
"""
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone as dt_timezone

import httpx
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

BASE_URL = "https://api.henrikdev.xyz"
ACCOUNT_CACHE_TTL = 60 * 60  # 1 hour
MMR_CACHE_TTL = 60 * 15  # 15 minutes

# HenrikDev tier names come with a division suffix ("Ascendant 2");
# the platform stores the base tier only.
_TIERS = {
    "iron", "bronze", "silver", "gold", "platinum",
    "diamond", "ascendant", "immortal", "radiant",
}


class ProviderError(Exception):
    """The data provider is unavailable, rejected the request, or the
    account was not found. `.not_found` distinguishes the latter."""

    def __init__(self, message: str, *, not_found: bool = False):
        super().__init__(message)
        self.not_found = not_found


@dataclass
class RiotAccount:
    puuid: str
    region: str
    account_level: int | None


@dataclass
class RiotMMR:
    current_tier: str  # "" when unranked
    current_rr: int | None
    peak_tier: str
    current_division: int | None = None  # 1-3 within a tier; None for Radiant/unranked
    peak_division: int | None = None


def _headers() -> dict:
    if not settings.HENRIKDEV_API_KEY:
        raise ProviderError("Riot data provider is not configured (missing API key).")
    return {"Authorization": settings.HENRIKDEV_API_KEY}


def _get(path: str) -> dict:
    try:
        resp = httpx.get(f"{BASE_URL}{path}", headers=_headers(), timeout=15)
    except httpx.HTTPError as exc:
        raise ProviderError(f"Riot data provider unreachable: {exc}") from exc
    if resp.status_code == 404:
        raise ProviderError("Riot account not found.", not_found=True)
    if resp.status_code == 429:
        raise ProviderError("Riot data provider rate limit hit; try again shortly.")
    if resp.status_code != 200:
        logger.warning("HenrikDev %s -> %s: %s", path, resp.status_code, resp.text[:300])
        raise ProviderError("Riot data provider returned an error.")
    return resp.json().get("data", {})


def _parse_tier(name: str | None) -> str:
    if not name:
        return ""
    base = name.split()[0].lower()
    return base if base in _TIERS else ""


def _parse_division(name: str | None) -> int | None:
    """Division number from a tier name ("Diamond 2" -> 2). Tiers without
    divisions (Radiant) or unranked return None."""
    if not name:
        return None
    parts = name.split()
    if len(parts) >= 2 and parts[-1].isdigit():
        return int(parts[-1])
    return None


def get_account(game_name: str, tag_line: str) -> RiotAccount:
    cache_key = f"riot:account:{game_name.lower()}#{tag_line.lower()}"
    cached = cache.get(cache_key)
    if cached:
        return RiotAccount(**cached)

    data = _get(f"/valorant/v2/account/{game_name}/{tag_line}")
    account = RiotAccount(
        puuid=data.get("puuid", ""),
        region=data.get("region", ""),
        account_level=data.get("account_level"),
    )
    if not account.puuid:
        raise ProviderError("Riot account lookup returned no puuid.")
    cache.set(cache_key, account.__dict__, ACCOUNT_CACHE_TTL)
    return account


def get_mmr(region: str, puuid: str) -> RiotMMR:
    cache_key = f"riot:mmr:v2:{puuid}"  # v2: payload now includes division
    cached = cache.get(cache_key)
    if cached:
        return RiotMMR(**cached)

    data = _get(f"/valorant/v3/by-puuid/mmr/{region}/pc/{puuid}")
    current = data.get("current") or {}
    peak = data.get("peak") or {}
    current_name = (current.get("tier") or {}).get("name")
    peak_name = (peak.get("tier") or {}).get("name")
    mmr = RiotMMR(
        current_tier=_parse_tier(current_name),
        current_rr=current.get("rr"),
        peak_tier=_parse_tier(peak_name),
        current_division=_parse_division(current_name),
        peak_division=_parse_division(peak_name),
    )
    cache.set(cache_key, mmr.__dict__, MMR_CACHE_TTL)
    return mmr


# A match started slightly before the recorded window start still counts —
# absorbs clock skew between the client, Riot's servers, and our own clock.
VERIFY_CLOCK_SKEW = timedelta(seconds=120)


def _parse_match_start(meta: dict) -> datetime | None:
    """Match start time from v4 metadata (ISO `started_at`), falling back to
    the older unix `game_start` shape, as a tz-aware UTC datetime."""
    raw = meta.get("started_at") or meta.get("game_start_iso")
    if raw:
        try:
            started = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            return started if started.tzinfo else started.replace(tzinfo=dt_timezone.utc)
        except ValueError:
            pass
    unix = meta.get("game_start")
    if isinstance(unix, (int, float)):
        return datetime.fromtimestamp(unix, tz=dt_timezone.utc)
    return None


def get_latest_match_after(region: str, puuid: str, after: datetime) -> str | None:
    """Returns the id of a recent match that STARTED at/after `after` (minus a
    small skew tolerance), or None. Uncached — drives live verification polling."""
    data = _get(f"/valorant/v4/by-puuid/matches/{region}/pc/{puuid}?size=5")
    matches = data if isinstance(data, list) else []
    threshold = after - VERIFY_CLOCK_SKEW

    newest_seen = None
    for match in matches:
        meta = match.get("metadata") or {}
        started = _parse_match_start(meta)
        if started is None:
            continue
        if newest_seen is None or started > newest_seen:
            newest_seen = started
        if started >= threshold:
            match_id = meta.get("match_id") or "unknown"
            logger.info("verification: match %s started %s (>= %s)", match_id, started, threshold)
            return match_id

    if newest_seen is not None:
        logger.info(
            "verification: no qualifying match; newest started %s, need >= %s",
            newest_seen, threshold,
        )
    else:
        logger.info("verification: no parseable matches returned for %s", puuid)
    return None
