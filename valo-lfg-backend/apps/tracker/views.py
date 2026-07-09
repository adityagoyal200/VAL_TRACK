"""Tracker read API.

v1 serves the signed-in user's own linked account (`/tracker/me/...`). The
resolver returns a plain identity tuple, so a future public route
(`/tracker/<name>/<tag>/...`) only has to swap how the subject is looked up.
"""
import secrets
from dataclasses import dataclass

from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations.models import RiotAccountLink
from apps.integrations.services import henrikdev_client as riot
from apps.tracker.models import EncounterBackfillJob, SkinCollection
from apps.tracker.serializers import (
    CareerSerializer,
    EncounterBackfillJobSerializer,
    EncountersSerializer,
    MMRHistoryEntrySerializer,
    MatchDetailSerializer,
    MatchSummarySerializer,
    OverviewStatsSerializer,
    ProfileHeaderSerializer,
    SquadSerializer,
)
from apps.tracker.services.aggregate import build_overview
from apps.tracker.services.career import build_career
from apps.tracker.services.encounters import build_encounters
from apps.tracker.services.ingest import ingest_match, ingest_matches
from apps.tracker.services.squad import build_squad
from apps.tracker.tasks import backfill_encounter_history

OVERVIEW_SAMPLE = 20  # matches aggregated for the top-line stats
RECENT_ON_OVERVIEW = 5
SQUAD_SAMPLE = 20  # detailed matches scanned for party / duo / duel analysis
CAREER_MAX_PAGES = 50  # full lifetime history, not just the last 500 games


@dataclass
class Subject:
    puuid: str
    region: str
    game_name: str
    tag_line: str
    account_level: int | None


def _provider_error_response(exc: riot.ProviderError) -> Response:
    code = status.HTTP_404_NOT_FOUND if exc.not_found else status.HTTP_502_BAD_GATEWAY
    return Response({"detail": str(exc)}, status=code)


def _ingest_quiet(fn, *args) -> None:
    """Persisting rosters for the encounters feature is opportunistic — never
    let a DB hiccup break an otherwise-successful tracker response."""
    try:
        fn(*args)
    except Exception:
        pass


def _self_subject(request) -> Subject | None:
    """Resolve the tracked account from the caller's Riot link. Returns None
    when the user has not linked (or the link has no puuid/region yet)."""
    link = RiotAccountLink.objects.filter(user=request.user).first()
    if link is None or not link.puuid or not link.region:
        return None
    return Subject(
        puuid=link.puuid,
        region=link.region,
        game_name=link.riot_game_name,
        tag_line=link.riot_tag_line,
        account_level=link.account_level,
    )


_NO_LINK = Response(
    {"detail": "Link and verify a Riot account to see tracker stats."},
    status=status.HTTP_409_CONFLICT,
)


def _profile_header(subject: Subject) -> dict:
    """Identity + a live rank read (get_mmr / get_account are Redis-cached)."""
    tier = division = peak_tier = ""
    rr = current_division = peak_division = None
    last_change = elo = leaderboard_rank = None
    seasons: list = []
    try:
        mmr = riot.get_mmr(subject.region, subject.puuid)
        tier, rr = mmr.current_tier, mmr.current_rr
        current_division, peak_tier = mmr.current_division, mmr.peak_tier
        peak_division = mmr.peak_division
        last_change, elo = mmr.last_change, mmr.elo
        leaderboard_rank, seasons = mmr.leaderboard_rank, mmr.seasons
    except riot.ProviderError:
        pass  # header still renders identity without a fresh rank

    card_wide = card_small = title = ""
    account_level = subject.account_level
    try:
        account = riot.get_account(subject.game_name, subject.tag_line)
        card_wide, card_small = account.card_wide, account.card_small
        title = account.title
        if account.account_level is not None:
            account_level = account.account_level
    except riot.ProviderError:
        pass

    return {
        "riot_game_name": subject.game_name,
        "riot_tag_line": subject.tag_line,
        "region": subject.region,
        "account_level": account_level,
        "card_wide": card_wide,
        "card_small": card_small,
        "title": title,
        "current_tier": tier,
        "current_division": current_division,
        "current_rr": rr,
        "last_change": last_change,
        "elo": elo,
        "leaderboard_rank": leaderboard_rank,
        "peak_tier": peak_tier,
        "peak_division": peak_division,
        "seasons": seasons,
    }


# ---------------------------------------------------------------------------
# Tracker views. Each stat has a *payload mixin* (the actual work, given a
# resolved Subject) plus two thin bases that differ only in how the subject is
# resolved: `_SelfTrackerView` from the caller's Riot link (auth required),
# `_PublicTrackerView` from a <name>/<tag> in the URL (AllowAny). Combining a
# payload mixin with a base yields the concrete self/public view pair.
# ---------------------------------------------------------------------------


class _SelfTrackerView(APIView):
    def get(self, request, **kwargs):
        subject = _self_subject(request)
        if subject is None:
            return _NO_LINK
        try:
            return Response(self.payload(request, subject, **kwargs))
        except riot.ProviderError as exc:
            return _provider_error_response(exc)


class _PublicTrackerView(APIView):
    """Anyone can look up any Riot ID; the name#tag resolves to a puuid+region
    via the (cached) account endpoint, then the same payload runs.

    NOTE: consent-gating (only showing members who signed in + linked their own
    account) is deferred until the Riot production application is submitted."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request, name, tag, **kwargs):
        try:
            account = riot.get_account(name, tag)
            subject = Subject(
                puuid=account.puuid,
                region=account.region,
                game_name=name,
                tag_line=tag,
                account_level=account.account_level,
            )
            return Response(self.payload(request, subject, **kwargs))
        except riot.ProviderError as exc:
            return _provider_error_response(exc)


class _OverviewPayload:
    """Top-line dashboard: identity, rank, RR timeline, aggregate stats, and the
    last few matches. `?mode=` filters the sample (default competitive)."""

    def payload(self, request, subject, **kwargs):
        mode = request.query_params.get("mode", "competitive") or None
        matches = riot.get_matches(subject.region, subject.puuid, mode=mode, size=OVERVIEW_SAMPLE)
        _ingest_quiet(ingest_matches, matches)
        rr_history = riot.get_mmr_history(subject.region, subject.puuid)
        overview = build_overview(matches)
        return {
            "profile": ProfileHeaderSerializer(_profile_header(subject)).data,
            "stats": OverviewStatsSerializer(overview).data,
            "rr_history": MMRHistoryEntrySerializer(rr_history, many=True).data,
            "recent_matches": MatchSummarySerializer(matches[:RECENT_ON_OVERVIEW], many=True).data,
        }


class _MatchesPayload:
    """Recent match history rows. `?mode=` and `?size=` (max 20)."""

    def payload(self, request, subject, **kwargs):
        mode = request.query_params.get("mode") or None
        try:
            size = int(request.query_params.get("size", 10))
        except ValueError:
            size = 10
        matches = riot.get_matches(subject.region, subject.puuid, mode=mode, size=size)
        _ingest_quiet(ingest_matches, matches)
        return {"matches": MatchSummarySerializer(matches, many=True).data}


class _MatchDetailPayload:
    """Full scoreboard for one match id."""

    def payload(self, request, subject, match_id, **kwargs):
        # Cheap path: the match is usually in the cached recent window.
        recent = riot.get_matches(subject.region, subject.puuid, size=20)
        match = next((m for m in recent if m.match_id == match_id), None)
        if match is None:
            match = riot.get_match(subject.region, match_id, subject.puuid)
        _ingest_quiet(ingest_match, match)
        return MatchDetailSerializer(match).data


class _CareerPayload:
    """Per-act career breakdown from lifetime stored matches, plus an aggregate
    'all acts' bucket. `?mode=` filters (default competitive)."""

    def payload(self, request, subject, **kwargs):
        mode = request.query_params.get("mode", "competitive") or None
        stored = riot.get_stored_matches(
            subject.region, subject.game_name, subject.tag_line,
            mode=mode, max_pages=CAREER_MAX_PAGES,
        )
        acts, lifetime = build_career(stored)
        return CareerSerializer({"acts": acts, "all": lifetime}).data


class _SquadPayload:
    """Party-size breakdown, most-played-with teammates, and kill-feed
    nemeses/victims from the recent detailed-match window."""

    def payload(self, request, subject, **kwargs):
        mode = request.query_params.get("mode", "competitive") or None
        matches = riot.get_matches(subject.region, subject.puuid, mode=mode, size=SQUAD_SAMPLE)
        _ingest_quiet(ingest_matches, matches)
        squad = build_squad(matches, subject.puuid)
        return SquadSerializer(squad).data


class _EncountersPayload:
    """Lifetime encounter/premade history from whatever has been persisted to
    `EncounterMatch`/`EncounterPlayer` so far — the recent window ingested for
    free on every view, plus anything the full-history backfill has pulled."""

    def payload(self, request, subject, **kwargs):
        encounters = build_encounters(subject.puuid)
        return EncountersSerializer(encounters).data


class TrackerOverviewView(_OverviewPayload, _SelfTrackerView):
    pass


class TrackerMatchesView(_MatchesPayload, _SelfTrackerView):
    pass


class TrackerMatchDetailView(_MatchDetailPayload, _SelfTrackerView):
    pass


class TrackerCareerView(_CareerPayload, _SelfTrackerView):
    pass


class TrackerSquadView(_SquadPayload, _SelfTrackerView):
    pass


class TrackerEncountersView(_EncountersPayload, _SelfTrackerView):
    pass


class PublicOverviewView(_OverviewPayload, _PublicTrackerView):
    pass


class PublicMatchesView(_MatchesPayload, _PublicTrackerView):
    pass


class PublicMatchDetailView(_MatchDetailPayload, _PublicTrackerView):
    pass


class PublicCareerView(_CareerPayload, _PublicTrackerView):
    pass


class PublicSquadView(_SquadPayload, _PublicTrackerView):
    pass


class PublicEncountersView(_EncountersPayload, _PublicTrackerView):
    pass


# ---------------------------------------------------------------------------
# Encounter history backfill: a one-time job (self only — it burns a chunk of
# the personal HenrikDev key's rate-limit budget) that walks every act on
# record and persists full rosters so Encounters covers a real lifetime, not
# just the recent detailed-match window.
# ---------------------------------------------------------------------------


class EncountersBackfillView(APIView):
    """POST -> enqueue (or return the already-running/most-recent) backfill
    job for the caller's linked account."""

    def post(self, request):
        subject = _self_subject(request)
        if subject is None:
            return _NO_LINK

        existing = (
            EncounterBackfillJob.objects.filter(
                region=subject.region, name=subject.game_name, tag=subject.tag_line
            )
            .exclude(status=EncounterBackfillJob.Status.FAILED)
            .first()
        )
        if existing and existing.status in (
            EncounterBackfillJob.Status.PENDING,
            EncounterBackfillJob.Status.RUNNING,
        ):
            return Response(EncounterBackfillJobSerializer(existing).data)

        job = EncounterBackfillJob.objects.create(
            region=subject.region, name=subject.game_name, tag=subject.tag_line
        )
        backfill_encounter_history.delay(job.id)
        return Response(EncounterBackfillJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class EncountersBackfillStatusView(APIView):
    """GET -> the most recent backfill job for the caller's linked account."""

    def get(self, request):
        subject = _self_subject(request)
        if subject is None:
            return _NO_LINK

        job = EncounterBackfillJob.objects.filter(
            region=subject.region, name=subject.game_name, tag=subject.tag_line
        ).first()
        # DRF's JSONRenderer emits an empty body (not the JSON literal `null`)
        # for `Response(None)`, which breaks a plain `resp.json()` on the
        # frontend — so wrap in an object instead of returning bare null.
        return Response({"job": EncounterBackfillJobSerializer(job).data if job else None})


# ---------------------------------------------------------------------------
# Skin collection sync (desktop app -> backend -> web showcase)
# ---------------------------------------------------------------------------

SYNC_CODE_TTL = 600  # seconds a pairing code stays valid
MAX_SKIN_LEVELS = 10_000


def _code_cache_key(code: str) -> str:
    return f"tracker:colcode:{code.upper()}"


class CollectionCodeView(APIView):
    """POST -> a short-lived one-time code the desktop app uses to push the
    caller's owned skins without needing its own login flow."""

    def post(self, request):
        code = secrets.token_hex(4).upper()  # 8 hex chars, easy to retype
        cache.set(_code_cache_key(code), request.user.id, SYNC_CODE_TTL)
        return Response({"code": code, "expires_in": SYNC_CODE_TTL})


class CollectionUploadView(APIView):
    """Unauthenticated push endpoint for the desktop app: a valid pairing code
    *is* the credential. Codes are single-use and expire in minutes."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        code = str(request.data.get("code") or "").strip()
        levels = request.data.get("skin_levels")
        if not code or not isinstance(levels, list):
            return Response(
                {"detail": "Expected `code` and a `skin_levels` list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(levels) > MAX_SKIN_LEVELS:
            return Response({"detail": "Too many items."}, status=status.HTTP_400_BAD_REQUEST)
        cleaned = [str(x)[:64] for x in levels if isinstance(x, str) and x]

        user_id = cache.get(_code_cache_key(code))
        if user_id is None:
            return Response(
                {"detail": "Invalid or expired sync code. Generate a new one on the website."},
                status=status.HTTP_403_FORBIDDEN,
            )
        cache.delete(_code_cache_key(code))

        collection, _ = SkinCollection.objects.update_or_create(
            user_id=user_id, defaults={"skin_levels": cleaned}
        )
        return Response({"count": len(collection.skin_levels)})


class MySkinsView(APIView):
    """The signed-in user's synced skin collection (raw skin-level uuids)."""

    def get(self, request):
        collection = SkinCollection.objects.filter(user=request.user).first()
        if collection is None:
            return Response({"skin_levels": [], "updated_at": None})
        return Response({
            "skin_levels": collection.skin_levels,
            "updated_at": collection.updated_at.isoformat(),
        })
