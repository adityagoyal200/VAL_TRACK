from django.utils import timezone
from rest_framework import serializers

from .models import RiotAccountLink


class RiotLinkStatusSerializer(serializers.ModelSerializer):
    verification_seconds_remaining = serializers.SerializerMethodField()

    class Meta:
        model = RiotAccountLink
        fields = [
            "riot_game_name",
            "riot_tag_line",
            "region",
            "account_level",
            "current_tier",
            "current_rr",
            "peak_tier",
            "status",
            "verification_seconds_remaining",
            "last_rank_refresh_at",
        ]

    def get_verification_seconds_remaining(self, obj) -> int:
        if obj.status != RiotAccountLink.Status.PENDING or not obj.verification_window_end:
            return 0
        return max(0, int((obj.verification_window_end - timezone.now()).total_seconds()))


class RiotLinkCreateSerializer(serializers.Serializer):
    riot_game_name = serializers.CharField(max_length=16)
    riot_tag_line = serializers.CharField(max_length=8)


class ManualReviewSerializer(serializers.Serializer):
    screenshot = serializers.ImageField(max_length=255)

    def validate_screenshot(self, value):
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Screenshot must be under 5 MB.")
        return value
