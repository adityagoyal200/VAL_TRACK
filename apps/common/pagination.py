from rest_framework.pagination import CursorPagination


class ListingCursorPagination(CursorPagination):
    """Stable newest-first paging for the live-queue feed. Cursor (not offset)
    so listings shifting in/out under a scrolling client don't skip or dupe."""

    page_size = 20
    max_page_size = 50
    page_size_query_param = "page_size"
    ordering = "-created_at"
