from django.urls import path

from . import views

urlpatterns = [
    path("tracker/me/overview/", views.TrackerOverviewView.as_view(), name="tracker-overview"),
    path("tracker/me/matches/", views.TrackerMatchesView.as_view(), name="tracker-matches"),
    path(
        "tracker/me/matches/<str:match_id>/",
        views.TrackerMatchDetailView.as_view(),
        name="tracker-match-detail",
    ),
    path("tracker/me/career/", views.TrackerCareerView.as_view(), name="tracker-career"),
    path("tracker/me/squad/", views.TrackerSquadView.as_view(), name="tracker-squad"),
    path("tracker/me/skins/", views.MySkinsView.as_view(), name="tracker-my-skins"),
    path(
        "tracker/collection/code/",
        views.CollectionCodeView.as_view(),
        name="tracker-collection-code",
    ),
    path(
        "tracker/collection/upload/",
        views.CollectionUploadView.as_view(),
        name="tracker-collection-upload",
    ),
    # Public "search any Riot ID" routes. Listed last so the specific /me/ and
    # /collection/ paths above always win; name#tag are single path segments.
    path(
        "tracker/<str:name>/<str:tag>/overview/",
        views.PublicOverviewView.as_view(),
        name="tracker-public-overview",
    ),
    path(
        "tracker/<str:name>/<str:tag>/matches/<str:match_id>/",
        views.PublicMatchDetailView.as_view(),
        name="tracker-public-match-detail",
    ),
    path(
        "tracker/<str:name>/<str:tag>/matches/",
        views.PublicMatchesView.as_view(),
        name="tracker-public-matches",
    ),
    path(
        "tracker/<str:name>/<str:tag>/career/",
        views.PublicCareerView.as_view(),
        name="tracker-public-career",
    ),
    path(
        "tracker/<str:name>/<str:tag>/squad/",
        views.PublicSquadView.as_view(),
        name="tracker-public-squad",
    ),
]
