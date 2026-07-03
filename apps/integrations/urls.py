from django.urls import path

from . import views

urlpatterns = [
    path("riot-link/", views.RiotLinkView.as_view(), name="riot-link"),
    path("riot-link/status/", views.RiotLinkStatusView.as_view(), name="riot-link-status"),
    path(
        "riot-link/manual-review/",
        views.ManualReviewView.as_view(),
        name="riot-link-manual-review",
    ),
    path(
        "riot-link/refresh-rank/",
        views.RefreshRankView.as_view(),
        name="riot-link-refresh-rank",
    ),
]
