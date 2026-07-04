import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel
from apps.profiles.models import RoleTag

LISTING_LIFETIME = timedelta(minutes=45)


def default_listing_expiry():
    return timezone.now() + LISTING_LIFETIME


class Tier(models.TextChoices):
    """Ranked tiers in ascending order. Mirrors integrations.RiotAccountLink.Tier;
    kept local so matchmaking doesn't import the integrations app for a vocabulary."""

    IRON = "iron", "Iron"
    BRONZE = "bronze", "Bronze"
    SILVER = "silver", "Silver"
    GOLD = "gold", "Gold"
    PLATINUM = "platinum", "Platinum"
    DIAMOND = "diamond", "Diamond"
    ASCENDANT = "ascendant", "Ascendant"
    IMMORTAL = "immortal", "Immortal"
    RADIANT = "radiant", "Radiant"


class Region(models.TextChoices):
    NA = "na", "North America"
    EU = "eu", "Europe"
    AP = "ap", "Asia Pacific"
    KR = "kr", "Korea"
    LATAM = "latam", "Latin America"
    BR = "br", "Brazil"


class CommPreference(models.TextChoices):
    VOICE = "voice", "Voice only"
    TEXT = "text", "Text only"
    EITHER = "either", "Either"


class PartyListing(TimeStampedModel):
    class ListingType(models.TextChoices):
        LF_FIFTH = "lf_fifth", "Looking for 5th"
        LF_DUO = "lf_duo", "Looking for duo"
        LF_STACK = "lf_stack", "Building a stack"
        LF_GROUP_TO_JOIN = "lf_group_to_join", "Looking to join a group"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        FILLED = "filled", "Filled"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    host = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="hosted_listings", on_delete=models.CASCADE
    )
    listing_type = models.CharField(max_length=24, choices=ListingType.choices)
    region = models.CharField(max_length=8, choices=Region.choices)
    party_size_current = models.PositiveSmallIntegerField(default=1)  # includes host
    party_size_target = models.PositiveSmallIntegerField()  # 2–5
    rank_min = models.CharField(max_length=16, choices=Tier.choices, blank=True)
    rank_max = models.CharField(max_length=16, choices=Tier.choices, blank=True)
    roles_needed = ArrayField(
        models.CharField(max_length=24, choices=RoleTag.choices),
        default=list,
        blank=True,
    )
    comm_preference = models.CharField(
        max_length=8, choices=CommPreference.choices, default=CommPreference.EITHER
    )
    note = models.CharField(max_length=280, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    expires_at = models.DateTimeField(default=default_listing_expiry)
    filled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            # The live-queue feed filters open listings by region, newest first.
            models.Index(fields=["status", "region", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.get_listing_type_display()} · {self.region} ({self.status})"

    @property
    def seats_open(self) -> int:
        return max(0, self.party_size_target - self.party_size_current)

    @property
    def is_full(self) -> bool:
        return self.party_size_current >= self.party_size_target


class ListingMember(TimeStampedModel):
    """A confirmed seat in a party. The host is seeded as a member on create.
    This is the v2 Review extension point — reviews will hang off member pairs."""

    listing = models.ForeignKey(
        PartyListing, related_name="members", on_delete=models.CASCADE
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="listing_memberships", on_delete=models.CASCADE
    )
    is_host = models.BooleanField(default=False)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["listing", "user"], name="uniq_listing_member")
        ]

    def __str__(self):
        return f"{self.user_id} in {self.listing_id}"


class JoinRequest(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    listing = models.ForeignKey(
        PartyListing, related_name="join_requests", on_delete=models.CASCADE
    )
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="join_requests", on_delete=models.CASCADE
    )
    message = models.CharField(max_length=280, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # At most one live (pending) request per user per listing; resolved
            # requests don't block a fresh attempt.
            models.UniqueConstraint(
                fields=["listing", "requester"],
                condition=models.Q(status="pending"),
                name="uniq_pending_join_request",
            )
        ]

    def __str__(self):
        return f"{self.requester_id} → {self.listing_id} ({self.status})"
