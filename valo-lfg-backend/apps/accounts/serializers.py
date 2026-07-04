from rest_framework import serializers

from .models import SocialAccount, User


class SocialAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = SocialAccount
        fields = ["provider", "discord_username", "discord_avatar_hash"]


class UserSerializer(serializers.ModelSerializer):
    social_accounts = SocialAccountSerializer(many=True, read_only=True)
    onboarding_completed = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "username",
            "date_joined",
            "social_accounts",
            "onboarding_completed",
        ]
        read_only_fields = ["id", "email", "date_joined"]

    def get_onboarding_completed(self, obj) -> bool:
        profile = getattr(obj, "profile", None)
        return bool(profile and profile.onboarding_completed_at)


class GoogleCallbackSerializer(serializers.Serializer):
    code = serializers.CharField()
    redirect_uri = serializers.URLField()
    code_verifier = serializers.CharField()


class DiscordCallbackSerializer(serializers.Serializer):
    code = serializers.CharField()
    redirect_uri = serializers.URLField()
