from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import RiotAccountLink
from .serializers import (
    ManualReviewSerializer,
    RiotLinkCreateSerializer,
    RiotLinkStatusSerializer,
)
from .services import henrikdev_client
from .tasks import apply_mmr, poll_riot_verification

VERIFICATION_WINDOW = timedelta(minutes=10)
RANK_REFRESH_COOLDOWN = timedelta(hours=1)


def _provider_error_response(exc: henrikdev_client.ProviderError) -> Response:
    code = status.HTTP_404_NOT_FOUND if exc.not_found else status.HTTP_502_BAD_GATEWAY
    return Response({"detail": str(exc)}, status=code)


class RiotLinkView(APIView):
    def post(self, request):
        serializer = RiotLinkCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        name = serializer.validated_data["riot_game_name"]
        tag = serializer.validated_data["riot_tag_line"]

        existing = RiotAccountLink.objects.filter(user=request.user).first()
        if existing and existing.status == RiotAccountLink.Status.VERIFIED:
            return Response(
                {"detail": "You already have a verified Riot account. Unlink it first."},
                status=status.HTTP_409_CONFLICT,
            )
        if (
            RiotAccountLink.objects.filter(
                riot_game_name__iexact=name,
                riot_tag_line__iexact=tag,
                status=RiotAccountLink.Status.VERIFIED,
            )
            .exclude(user=request.user)
            .exists()
        ):
            return Response(
                {"detail": "That Riot ID is already verified by another user."},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            account = henrikdev_client.get_account(name, tag)
        except henrikdev_client.ProviderError as exc:
            return _provider_error_response(exc)

        now = timezone.now()
        defaults = {
            "riot_game_name": name,
            "riot_tag_line": tag,
            "puuid": account.puuid,
            "region": account.region,
            "account_level": account.account_level,
            "status": RiotAccountLink.Status.PENDING,
            "verification_window_start": now,
            "verification_window_end": now + VERIFICATION_WINDOW,
            "verification_match_id": "",
        }
        link, _ = RiotAccountLink.objects.update_or_create(
            user=request.user, defaults=defaults
        )
        poll_riot_verification.apply_async(args=[link.pk], countdown=20)
        return Response(RiotLinkStatusSerializer(link).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        deleted, _ = RiotAccountLink.objects.filter(user=request.user).delete()
        if not deleted:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RiotLinkStatusView(APIView):
    def get(self, request):
        link = RiotAccountLink.objects.filter(user=request.user).first()
        if link is None:
            return Response({"status": "none"})
        return Response(RiotLinkStatusSerializer(link).data)


class ManualReviewView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        link = RiotAccountLink.objects.filter(user=request.user).first()
        if link is None:
            return Response(
                {"detail": "Link a Riot ID first."}, status=status.HTTP_400_BAD_REQUEST
            )
        if link.status == RiotAccountLink.Status.VERIFIED:
            return Response(
                {"detail": "Already verified."}, status=status.HTTP_409_CONFLICT
            )
        serializer = ManualReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        link.manual_review_screenshot = serializer.validated_data["screenshot"]
        link.status = RiotAccountLink.Status.MANUAL_REVIEW
        link.save(update_fields=["manual_review_screenshot", "status", "updated_at"])
        return Response(RiotLinkStatusSerializer(link).data)


class RefreshRankView(APIView):
    def post(self, request):
        link = RiotAccountLink.objects.filter(
            user=request.user, status=RiotAccountLink.Status.VERIFIED
        ).first()
        if link is None:
            return Response(
                {"detail": "No verified Riot account."}, status=status.HTTP_404_NOT_FOUND
            )
        if (
            link.last_rank_refresh_at
            and timezone.now() - link.last_rank_refresh_at < RANK_REFRESH_COOLDOWN
        ):
            return Response(
                {"detail": "Rank was refreshed recently; try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        try:
            apply_mmr(link)
        except henrikdev_client.ProviderError as exc:
            return _provider_error_response(exc)
        link.save()
        return Response(RiotLinkStatusSerializer(link).data)
