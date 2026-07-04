"""Broadcast helpers the matchmaking app calls when queue state changes.

All sends are deferred to ``transaction.on_commit`` so clients never refetch and
race a transaction that hasn't landed yet. Outside an atomic block on_commit runs
immediately, so callers don't need to care whether they're in a transaction.
"""

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

from .consumers import QUEUE_GROUP, user_group


def _send(group: str, message: dict) -> None:
    layer = get_channel_layer()
    if layer is None:  # e.g. tests with no channel layer configured
        return
    async_to_sync(layer.group_send)(group, message)


def notify_queue_changed() -> None:
    """The public feed changed — a listing was posted, filled, or removed."""
    transaction.on_commit(lambda: _send(QUEUE_GROUP, {"type": "queue.changed"}))


def notify_user(user_id, kind: str, **data) -> None:
    """Send a targeted event to one user's group (e.g. request accepted)."""
    payload = {"type": kind, **data}
    transaction.on_commit(
        lambda: _send(user_group(user_id), {"type": "user.event", "payload": payload})
    )
