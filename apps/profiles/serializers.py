from zoneinfo import available_timezones

from rest_framework import serializers

from .models import DayOfWeek, PlayerProfile, RoleTag, ScheduleBlock

VALID_TIMEZONES = available_timezones()


class ScheduleBlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduleBlock
        fields = ["day_of_week", "start_time", "end_time", "timezone"]

    def validate_timezone(self, value):
        if value not in VALID_TIMEZONES:
            raise serializers.ValidationError("Unknown timezone.")
        return value

    def validate(self, attrs):
        if attrs["start_time"] >= attrs["end_time"]:
            raise serializers.ValidationError("start_time must be before end_time.")
        return attrs


class PlayerProfileSerializer(serializers.ModelSerializer):
    role_tags = serializers.SerializerMethodField()
    schedule_blocks = ScheduleBlockSerializer(many=True, read_only=True)
    onboarding_completed = serializers.SerializerMethodField()

    class Meta:
        model = PlayerProfile
        fields = [
            "region",
            "language",
            "comm_preference",
            "bio",
            "role_tags",
            "schedule_blocks",
            "onboarding_completed",
        ]

    def get_role_tags(self, obj):
        return list(obj.role_tags.values_list("role", flat=True))

    def get_onboarding_completed(self, obj):
        return obj.onboarding_completed_at is not None


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlayerProfile
        fields = ["region", "language", "comm_preference", "bio"]


class RoleTagsUpdateSerializer(serializers.Serializer):
    roles = serializers.ListField(
        child=serializers.ChoiceField(choices=RoleTag.choices),
        max_length=len(RoleTag.choices),
    )

    def validate_roles(self, value):
        return list(dict.fromkeys(value))  # dedupe, keep order


class ScheduleUpdateSerializer(serializers.Serializer):
    blocks = ScheduleBlockSerializer(many=True, max_length=7 * 4)


class PublicUserSerializer(serializers.Serializer):
    """Public subset shown to other players."""

    id = serializers.UUIDField()
    username = serializers.CharField()
    profile = PlayerProfileSerializer()


__all__ = [
    "DayOfWeek",
    "PlayerProfileSerializer",
    "ProfileUpdateSerializer",
    "PublicUserSerializer",
    "RoleTagsUpdateSerializer",
    "ScheduleBlockSerializer",
    "ScheduleUpdateSerializer",
]
