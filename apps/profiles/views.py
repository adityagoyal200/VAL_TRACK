from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PlayerProfile, ProfileRoleTag, ScheduleBlock
from .serializers import (
    PlayerProfileSerializer,
    ProfileUpdateSerializer,
    PublicUserSerializer,
    RoleTagsUpdateSerializer,
    ScheduleUpdateSerializer,
)

User = get_user_model()


def _get_profile(user) -> PlayerProfile:
    profile, _ = PlayerProfile.objects.get_or_create(user=user)
    return profile


class ProfileView(APIView):
    def get(self, request):
        return Response(PlayerProfileSerializer(_get_profile(request.user)).data)

    def patch(self, request):
        profile = _get_profile(request.user)
        serializer = ProfileUpdateSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(PlayerProfileSerializer(profile).data)


class RoleTagsView(APIView):
    def put(self, request):
        profile = _get_profile(request.user)
        serializer = RoleTagsUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        roles = serializer.validated_data["roles"]

        profile.role_tags.all().delete()
        ProfileRoleTag.objects.bulk_create(
            ProfileRoleTag(profile=profile, role=role) for role in roles
        )
        return Response(PlayerProfileSerializer(profile).data)


class ScheduleView(APIView):
    def get(self, request):
        profile = _get_profile(request.user)
        return Response(PlayerProfileSerializer(profile).data["schedule_blocks"])

    def put(self, request):
        profile = _get_profile(request.user)
        serializer = ScheduleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        blocks = serializer.validated_data["blocks"]

        profile.schedule_blocks.all().delete()
        ScheduleBlock.objects.bulk_create(
            ScheduleBlock(profile=profile, **block) for block in blocks
        )
        return Response(PlayerProfileSerializer(profile).data)


class CompleteOnboardingView(APIView):
    def post(self, request):
        profile = _get_profile(request.user)
        missing = [
            field
            for field in ("region", "language", "comm_preference")
            if not getattr(profile, field)
        ]
        if not profile.role_tags.exists():
            missing.append("role_tags")
        if missing:
            return Response(
                {"detail": "Complete your profile first.", "missing": missing},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if profile.onboarding_completed_at is None:
            profile.onboarding_completed_at = timezone.now()
            profile.save(update_fields=["onboarding_completed_at"])
        return Response(PlayerProfileSerializer(profile).data)


class PublicUserView(APIView):
    def get(self, request, user_id):
        user = get_object_or_404(User, pk=user_id, is_active=True)
        profile = _get_profile(user)
        data = PublicUserSerializer(
            {"id": user.id, "username": user.username, "profile": profile}
        ).data
        return Response(data)
