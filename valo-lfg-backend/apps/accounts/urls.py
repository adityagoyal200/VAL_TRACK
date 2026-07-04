from django.urls import path

from . import views

urlpatterns = [
    path("google/callback/", views.GoogleCallbackView.as_view(), name="google-callback"),
    path("discord/callback/", views.DiscordCallbackView.as_view(), name="discord-callback"),
    path("google/link/", views.GoogleLinkView.as_view(), name="google-link"),
    path("discord/link/", views.DiscordLinkView.as_view(), name="discord-link"),
    path("<str:provider>/unlink/", views.UnlinkView.as_view(), name="unlink"),
    path("token/refresh/", views.CookieTokenRefreshView.as_view(), name="token-refresh"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("me/", views.MeView.as_view(), name="me"),
]
