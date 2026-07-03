from django.urls import path

from . import views

urlpatterns = [
    path("profile/", views.ProfileView.as_view(), name="profile"),
    path("profile/role-tags/", views.RoleTagsView.as_view(), name="profile-role-tags"),
    path("profile/schedule/", views.ScheduleView.as_view(), name="profile-schedule"),
    path(
        "profile/complete-onboarding/",
        views.CompleteOnboardingView.as_view(),
        name="profile-complete-onboarding",
    ),
    path("users/<uuid:user_id>/", views.PublicUserView.as_view(), name="public-user"),
]
