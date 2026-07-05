from django.conf import settings
from django.db import models


class SkinCollection(models.Model):
    """Owned weapon-skin levels, synced from the desktop app (the local Riot
    client is the only source that knows ownership). Stored as raw skin-level
    uuids; the web client resolves names/art from valorant-api.com."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="skin_collection"
    )
    skin_levels = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user} · {len(self.skin_levels)} skins"
