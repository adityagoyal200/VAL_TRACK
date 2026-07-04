"""Live-queue websocket consumer.

Every authenticated client joins two channel-layer groups:
  - ``queue``            — feed-wide changes (a listing posted, filled, cancelled).
  - ``user.<user_id>``   — events aimed at one person (a join request on your
                            listing, your request accepted/declined).

The consumer is a thin relay: it forwards a small JSON frame telling the client
*what kind* of thing changed, and the client refetches the affected queries.
"""

from channels.generic.websocket import AsyncJsonWebsocketConsumer

QUEUE_GROUP = "queue"


def user_group(user_id) -> str:
    return f"user.{user_id}"


class QueueConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close(code=4401)  # unauthorized
            return

        self.groups_joined = [QUEUE_GROUP, user_group(user.id)]
        for group in self.groups_joined:
            await self.channel_layer.group_add(group, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connected"})

    async def disconnect(self, code):
        for group in getattr(self, "groups_joined", []):
            await self.channel_layer.group_discard(group, self.channel_name)

    # --- channel-layer event handlers (type: "queue.changed" -> queue_changed) ---

    async def queue_changed(self, event):
        await self.send_json({"type": "queue.changed"})

    async def user_event(self, event):
        await self.send_json(event["payload"])
