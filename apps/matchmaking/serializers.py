from rest_framework import serializers

from apps.profiles.models import RoleTag

from .models import (
    CommPreference,
    JoinRequest,
    ListingMember,
    PartyListing,
    Region,
    Tier,
)

# Ascending rank order, used to validate rank_min <= rank_max.
TIER_ORDER = {tier.value: index for index, tier in enumerate(Tier)}


def discord_username(user) -> str:
    """Discord handle for a user, or "" — reads prefetched social_accounts."""
    for account in user.social_accounts.all():
        if account.provider == "discord":
            return account.discord_username
    return ""


class MemberSerializer(serializers.Serializer):
    """A confirmed party member. Discord handle is revealed only when the
    viewer is inside the party (set via `reveal_contact` in context)."""

    user_id = serializers.UUIDField(source="user.id")
    username = serializers.CharField(source="user.username")
    is_host = serializers.BooleanField()
    discord_username = serializers.SerializerMethodField()

    def get_discord_username(self, obj) -> str:
        if not self.context.get("reveal_contact"):
            return ""
        return discord_username(obj.user)


class JoinRequestSerializer(serializers.ModelSerializer):
    requester_id = serializers.UUIDField(source="requester.id", read_only=True)
    requester_username = serializers.CharField(source="requester.username", read_only=True)

    class Meta:
        model = JoinRequest
        fields = [
            "id",
            "requester_id",
            "requester_username",
            "message",
            "status",
            "created_at",
            "responded_at",
        ]


class PartyListingSerializer(serializers.ModelSerializer):
    host_id = serializers.UUIDField(source="host.id", read_only=True)
    host_username = serializers.CharField(source="host.username", read_only=True)
    members = serializers.SerializerMethodField()
    join_requests = serializers.SerializerMethodField()
    seats_open = serializers.IntegerField(read_only=True)
    is_full = serializers.BooleanField(read_only=True)
    viewer_is_host = serializers.SerializerMethodField()
    viewer_is_member = serializers.SerializerMethodField()
    viewer_request_status = serializers.SerializerMethodField()

    class Meta:
        model = PartyListing
        fields = [
            "id",
            "host_id",
            "host_username",
            "listing_type",
            "region",
            "party_size_current",
            "party_size_target",
            "rank_min",
            "rank_max",
            "roles_needed",
            "comm_preference",
            "note",
            "status",
            "expires_at",
            "filled_at",
            "created_at",
            "seats_open",
            "is_full",
            "members",
            "join_requests",
            "viewer_is_host",
            "viewer_is_member",
            "viewer_request_status",
        ]

    def _viewer(self):
        request = self.context.get("request")
        return request.user if request else None

    def get_viewer_is_host(self, obj) -> bool:
        viewer = self._viewer()
        return bool(viewer) and obj.host_id == viewer.id

    def get_viewer_is_member(self, obj) -> bool:
        viewer = self._viewer()
        if not viewer:
            return False
        return any(m.user_id == viewer.id for m in obj.members.all())

    def get_members(self, obj):
        reveal = self.get_viewer_is_member(obj)
        return MemberSerializer(
            obj.members.all(), many=True, context={"reveal_contact": reveal}
        ).data

    def get_join_requests(self, obj):
        # Incoming requests are host-only; everyone else sees an empty list.
        if not self.get_viewer_is_host(obj):
            return []
        pending = [r for r in obj.join_requests.all() if r.status == JoinRequest.Status.PENDING]
        return JoinRequestSerializer(pending, many=True).data

    def get_viewer_request_status(self, obj):
        viewer = self._viewer()
        if not viewer:
            return None
        # Latest request by this viewer, if any (join_requests prefetched -created_at).
        for r in obj.join_requests.all():
            if r.requester_id == viewer.id:
                return r.status
        return None


class PartyListingCreateSerializer(serializers.ModelSerializer):
    roles_needed = serializers.ListField(
        child=serializers.ChoiceField(choices=RoleTag.choices),
        required=False,
        default=list,
    )

    class Meta:
        model = PartyListing
        fields = [
            "listing_type",
            "region",
            "party_size_target",
            "rank_min",
            "rank_max",
            "roles_needed",
            "comm_preference",
            "note",
        ]

    def validate_party_size_target(self, value):
        if not 2 <= value <= 5:
            raise serializers.ValidationError("Party size must be between 2 and 5.")
        return value

    def validate_roles_needed(self, value):
        return list(dict.fromkeys(value))  # dedupe, keep order

    def validate(self, attrs):
        rank_min = attrs.get("rank_min")
        rank_max = attrs.get("rank_max")
        if rank_min and rank_max and TIER_ORDER[rank_min] > TIER_ORDER[rank_max]:
            raise serializers.ValidationError(
                {"rank_max": "Maximum rank cannot be below the minimum rank."}
            )
        return attrs


class PartyListingUpdateSerializer(serializers.ModelSerializer):
    """Fields a host may edit while the listing is still open."""

    roles_needed = serializers.ListField(
        child=serializers.ChoiceField(choices=RoleTag.choices), required=False
    )

    class Meta:
        model = PartyListing
        fields = [
            "party_size_target",
            "rank_min",
            "rank_max",
            "roles_needed",
            "comm_preference",
            "note",
        ]

    def validate_party_size_target(self, value):
        if not 2 <= value <= 5:
            raise serializers.ValidationError("Party size must be between 2 and 5.")
        if value < self.instance.party_size_current:
            raise serializers.ValidationError(
                "Target can't be below the number of players already in the party."
            )
        return value

    def validate_roles_needed(self, value):
        return list(dict.fromkeys(value))

    def validate(self, attrs):
        rank_min = attrs.get("rank_min", self.instance.rank_min)
        rank_max = attrs.get("rank_max", self.instance.rank_max)
        if rank_min and rank_max and TIER_ORDER[rank_min] > TIER_ORDER[rank_max]:
            raise serializers.ValidationError(
                {"rank_max": "Maximum rank cannot be below the minimum rank."}
            )
        return attrs


class JoinRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = JoinRequest
        fields = ["message"]


class ListingSummarySerializer(serializers.ModelSerializer):
    """Compact listing shown alongside a requester's own join requests."""

    host_username = serializers.CharField(source="host.username", read_only=True)

    class Meta:
        model = PartyListing
        fields = [
            "id",
            "host_username",
            "listing_type",
            "region",
            "party_size_current",
            "party_size_target",
            "status",
        ]


class MyJoinRequestSerializer(serializers.ModelSerializer):
    listing = ListingSummarySerializer(read_only=True)

    class Meta:
        model = JoinRequest
        fields = ["id", "listing", "message", "status", "created_at", "responded_at"]


__all__ = [
    "CommPreference",
    "JoinRequestCreateSerializer",
    "JoinRequestSerializer",
    "MemberSerializer",
    "PartyListingCreateSerializer",
    "PartyListingSerializer",
    "PartyListingUpdateSerializer",
    "Region",
    "Tier",
]
