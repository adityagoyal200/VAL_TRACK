from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from . import services
from .models import SocialAccount
from .serializers import (
    DiscordCallbackSerializer,
    GoogleCallbackSerializer,
    UserSerializer,
)


def _set_refresh_cookie(response: Response, refresh: str) -> None:
    response.set_cookie(
        settings.AUTH_COOKIE_NAME,
        refresh,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path=settings.AUTH_COOKIE_PATH,
    )


def _issue_tokens(user) -> tuple[str, str]:
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


class _SocialCallbackView(APIView):
    permission_classes = [AllowAny]
    provider: str
    callback_serializer_class: type

    def exchange(self, data: dict) -> dict:
        raise NotImplementedError

    def post(self, request):
        serializer = self.callback_serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            info = self.exchange(serializer.validated_data)
        except services.OAuthError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        user = services.login_social_user(self.provider, info)
        access, refresh = _issue_tokens(user)
        response = Response({"access": access, "user": UserSerializer(user).data})
        _set_refresh_cookie(response, refresh)
        return response


class GoogleCallbackView(_SocialCallbackView):
    provider = SocialAccount.Provider.GOOGLE
    callback_serializer_class = GoogleCallbackSerializer

    def exchange(self, data):
        return services.exchange_google_code(
            data["code"], data["redirect_uri"], data["code_verifier"]
        )


class DiscordCallbackView(_SocialCallbackView):
    provider = SocialAccount.Provider.DISCORD
    callback_serializer_class = DiscordCallbackSerializer

    def exchange(self, data):
        return services.exchange_discord_code(data["code"], data["redirect_uri"])


class CookieTokenRefreshView(APIView):
    """Reads the refresh token from the httpOnly cookie, rotates it, and
    returns a fresh access token. The SPA never touches the refresh token."""

    permission_classes = [AllowAny]

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
        if not raw_refresh:
            return Response(
                {"detail": "No refresh token."}, status=status.HTTP_401_UNAUTHORIZED
            )
        serializer = TokenRefreshSerializer(data={"refresh": raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError:
            return Response(
                {"detail": "Invalid or expired refresh token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        data = serializer.validated_data
        response = Response({"access": data["access"]})
        # ROTATE_REFRESH_TOKENS=True means a new refresh token is issued
        if data.get("refresh"):
            _set_refresh_cookie(response, data["refresh"])
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass
        response = Response(status=status.HTTP_205_RESET_CONTENT)
        response.delete_cookie(settings.AUTH_COOKIE_NAME, path=settings.AUTH_COOKIE_PATH)
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)
