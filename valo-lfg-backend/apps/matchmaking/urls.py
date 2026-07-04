from django.urls import path

from . import views

urlpatterns = [
    path("listings/", views.ListingListCreateView.as_view(), name="listings"),
    path("listings/mine/", views.MyListingsView.as_view(), name="listings-mine"),
    path("listings/<uuid:pk>/", views.ListingDetailView.as_view(), name="listing-detail"),
    path(
        "listings/<uuid:pk>/cancel/",
        views.ListingCancelView.as_view(),
        name="listing-cancel",
    ),
    path(
        "listings/<uuid:pk>/join-requests/",
        views.ListingJoinRequestsView.as_view(),
        name="listing-join-requests",
    ),
    path(
        "join-requests/mine/",
        views.MyJoinRequestsView.as_view(),
        name="join-requests-mine",
    ),
    path(
        "join-requests/<uuid:pk>/accept/",
        views.JoinRequestAcceptView.as_view(),
        name="join-request-accept",
    ),
    path(
        "join-requests/<uuid:pk>/decline/",
        views.JoinRequestDeclineView.as_view(),
        name="join-request-decline",
    ),
    path(
        "join-requests/<uuid:pk>/cancel/",
        views.JoinRequestCancelView.as_view(),
        name="join-request-cancel",
    ),
]
