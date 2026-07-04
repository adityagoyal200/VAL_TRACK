from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.pagination import ListingCursorPagination
from apps.realtime.events import notify_queue_changed, notify_user

from .filters import PartyListingFilter
from .models import JoinRequest, ListingMember, PartyListing
from .serializers import (
    JoinRequestCreateSerializer,
    JoinRequestSerializer,
    MyJoinRequestSerializer,
    PartyListingCreateSerializer,
    PartyListingSerializer,
    PartyListingUpdateSerializer,
)


def listing_queryset():
    """Base queryset with everything the read serializer touches prefetched,
    so serializing a page of listings stays a fixed handful of queries."""
    return PartyListing.objects.select_related("host").prefetch_related(
        "members__user__social_accounts",
        "join_requests__requester",
    )


def read_listing(pk, request, status_code=status.HTTP_200_OK) -> Response:
    listing = get_object_or_404(listing_queryset(), pk=pk)
    return Response(
        PartyListingSerializer(listing, context={"request": request}).data,
        status=status_code,
    )


class ListingListCreateView(generics.ListCreateAPIView):
    """GET the open live-queue feed (filtered, cursor-paginated); POST a new listing."""

    serializer_class = PartyListingSerializer
    pagination_class = ListingCursorPagination
    filterset_class = PartyListingFilter

    def get_queryset(self):
        return listing_queryset().filter(
            status=PartyListing.Status.OPEN, expires_at__gt=timezone.now()
        )

    def create(self, request, *args, **kwargs):
        write = PartyListingCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        with transaction.atomic():
            listing = write.save(host=request.user, party_size_current=1)
            ListingMember.objects.create(listing=listing, user=request.user, is_host=True)
        notify_queue_changed()
        return read_listing(listing.pk, request, status.HTTP_201_CREATED)


class ListingDetailView(APIView):
    def get(self, request, pk):
        return read_listing(pk, request)

    def patch(self, request, pk):
        listing = get_object_or_404(PartyListing, pk=pk)
        if listing.host_id != request.user.id:
            return Response(
                {"detail": "Only the host can edit this listing."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if listing.status != PartyListing.Status.OPEN:
            return Response(
                {"detail": "Only open listings can be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = PartyListingUpdateSerializer(listing, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        notify_queue_changed()
        return read_listing(pk, request)


class MyListingsView(generics.ListAPIView):
    """The current user's own listings, any status, newest first."""

    serializer_class = PartyListingSerializer
    pagination_class = ListingCursorPagination

    def get_queryset(self):
        return listing_queryset().filter(host=self.request.user)


class ListingCancelView(APIView):
    def post(self, request, pk):
        listing = get_object_or_404(PartyListing, pk=pk)
        if listing.host_id != request.user.id:
            return Response(
                {"detail": "Only the host can cancel this listing."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if listing.status not in (PartyListing.Status.OPEN, PartyListing.Status.FILLED):
            return Response(
                {"detail": "This listing can no longer be cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        listing.status = PartyListing.Status.CANCELLED
        listing.save(update_fields=["status", "updated_at"])
        notify_queue_changed()
        return read_listing(pk, request)


class ListingJoinRequestsView(APIView):
    """GET: host sees pending requests. POST: a non-member asks to join."""

    def get(self, request, pk):
        listing = get_object_or_404(PartyListing, pk=pk)
        if listing.host_id != request.user.id:
            return Response(
                {"detail": "Only the host can see join requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        requests = listing.join_requests.filter(
            status=JoinRequest.Status.PENDING
        ).select_related("requester")
        return Response(JoinRequestSerializer(requests, many=True).data)

    def post(self, request, pk):
        listing = get_object_or_404(listing_queryset(), pk=pk)
        error = self._join_blocked_reason(listing, request.user)
        if error:
            detail, code = error
            return Response({"detail": detail}, status=code)

        write = JoinRequestCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        join_request = JoinRequest.objects.create(
            listing=listing,
            requester=request.user,
            message=write.validated_data.get("message", ""),
        )
        notify_user(listing.host_id, "request.received", listing_id=str(listing.id))
        return Response(
            JoinRequestSerializer(join_request).data, status=status.HTTP_201_CREATED
        )

    @staticmethod
    def _join_blocked_reason(listing, user):
        if listing.host_id == user.id:
            return "You can't request to join your own listing.", status.HTTP_400_BAD_REQUEST
        if listing.status != PartyListing.Status.OPEN:
            return "This listing isn't open.", status.HTTP_400_BAD_REQUEST
        if listing.expires_at <= timezone.now():
            return "This listing has expired.", status.HTTP_400_BAD_REQUEST
        if listing.is_full:
            return "This party is already full.", status.HTTP_400_BAD_REQUEST
        if any(m.user_id == user.id for m in listing.members.all()):
            return "You're already in this party.", status.HTTP_400_BAD_REQUEST
        already_pending = any(
            r.requester_id == user.id and r.status == JoinRequest.Status.PENDING
            for r in listing.join_requests.all()
        )
        if already_pending:
            return "You already have a pending request.", status.HTTP_409_CONFLICT
        return None


class MyJoinRequestsView(generics.ListAPIView):
    serializer_class = MyJoinRequestSerializer
    pagination_class = ListingCursorPagination

    def get_queryset(self):
        return (
            JoinRequest.objects.filter(requester=self.request.user)
            .select_related("listing", "listing__host")
        )


class JoinRequestAcceptView(APIView):
    def post(self, request, pk):
        join_request = get_object_or_404(
            JoinRequest.objects.select_related("listing"), pk=pk
        )
        if join_request.listing.host_id != request.user.id:
            return Response(
                {"detail": "Only the host can accept requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if join_request.status != JoinRequest.Status.PENDING:
            return Response(
                {"detail": "This request has already been resolved."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        with transaction.atomic():
            listing = PartyListing.objects.select_for_update().get(
                pk=join_request.listing_id
            )
            if listing.status != PartyListing.Status.OPEN:
                return Response(
                    {"detail": "This listing isn't open."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if listing.is_full:
                return Response(
                    {"detail": "This party is already full."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            _, created = ListingMember.objects.get_or_create(
                listing=listing, user=join_request.requester, defaults={"is_host": False}
            )
            if created:
                listing.party_size_current += 1
            join_request.status = JoinRequest.Status.ACCEPTED
            join_request.responded_at = now
            join_request.save(update_fields=["status", "responded_at", "updated_at"])

            update_fields = ["party_size_current", "updated_at"]
            if listing.party_size_current >= listing.party_size_target:
                listing.status = PartyListing.Status.FILLED
                listing.filled_at = now
                update_fields += ["status", "filled_at"]
            listing.save(update_fields=update_fields)

        notify_queue_changed()
        notify_user(
            join_request.requester_id,
            "request.accepted",
            listing_id=str(join_request.listing_id),
        )
        return read_listing(join_request.listing_id, request)


class JoinRequestDeclineView(APIView):
    def post(self, request, pk):
        join_request = get_object_or_404(
            JoinRequest.objects.select_related("listing"), pk=pk
        )
        if join_request.listing.host_id != request.user.id:
            return Response(
                {"detail": "Only the host can decline requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if join_request.status != JoinRequest.Status.PENDING:
            return Response(
                {"detail": "This request has already been resolved."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        join_request.status = JoinRequest.Status.DECLINED
        join_request.responded_at = timezone.now()
        join_request.save(update_fields=["status", "responded_at", "updated_at"])
        notify_user(
            join_request.requester_id,
            "request.declined",
            listing_id=str(join_request.listing_id),
        )
        return Response(JoinRequestSerializer(join_request).data)


class JoinRequestCancelView(APIView):
    def post(self, request, pk):
        join_request = get_object_or_404(
            JoinRequest.objects.select_related("listing"), pk=pk, requester=request.user
        )
        if join_request.status != JoinRequest.Status.PENDING:
            return Response(
                {"detail": "This request can no longer be cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        join_request.status = JoinRequest.Status.CANCELLED
        join_request.responded_at = timezone.now()
        join_request.save(update_fields=["status", "responded_at", "updated_at"])
        notify_user(
            join_request.listing.host_id,
            "request.withdrawn",
            listing_id=str(join_request.listing_id),
        )
        return Response(JoinRequestSerializer(join_request).data)
