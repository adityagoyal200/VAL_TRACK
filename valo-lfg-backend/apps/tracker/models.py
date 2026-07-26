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


class EncounterMatch(models.Model):
    """A full match roster persisted once (idempotent by match_id) so lifetime
    encounter/premade history can be computed without re-fetching detail from
    HenrikDev every time. A match is a global fact regardless of which
    tracked player's history it was ingested from — rows are shared across
    every subject who appears in `players`."""

    match_id = models.CharField(max_length=64, unique=True, db_index=True)
    map_name = models.CharField(max_length=64, blank=True, default="")
    mode = models.CharField(max_length=32, blank=True, default="")
    season_name = models.CharField(max_length=64, blank=True, default="")
    started_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return self.match_id


class EncounterPlayer(models.Model):
    """One roster line on an `EncounterMatch` — enough to answer "who did we
    queue with / against, and were they partied" without hitting the API
    again. `party_id` groups players who queued together in that match; it is
    NOT a stable id across matches, so recurring duos/trios are detected by
    matching the *set* of puuids that keep sharing a party_id, not by the
    party_id value itself."""

    match = models.ForeignKey(EncounterMatch, related_name="players", on_delete=models.CASCADE)
    puuid = models.CharField(max_length=64, db_index=True)
    name = models.CharField(max_length=64, blank=True, default="")
    tag = models.CharField(max_length=16, blank=True, default="")
    # Usually "Red"/"Blue", but modes like deathmatch put a puuid-length value
    # here (the v4 payload's `team` fallback), so keep it puuid-wide.
    team_id = models.CharField(max_length=128, blank=True, default="")
    party_id = models.CharField(max_length=64, blank=True, default="")
    agent = models.CharField(max_length=32, blank=True, default="")
    agent_image = models.CharField(max_length=200, blank=True, default="")
    won = models.BooleanField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["match", "puuid"], name="unique_encounter_match_player")
        ]
        indexes = [models.Index(fields=["puuid", "team_id"])]

    def __str__(self):
        return f"{self.name}#{self.tag} @ {self.match_id}"


class EncounterBackfillJob(models.Model):
    """Tracks progress of the one-time full-history backfill for a subject
    (region/name/tag), so the frontend can poll a progress bar."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        DONE = "done", "Done"
        FAILED = "failed", "Failed"

    region = models.CharField(max_length=8)
    name = models.CharField(max_length=64)
    tag = models.CharField(max_length=16)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    total = models.IntegerField(default=0)
    done = models.IntegerField(default=0)
    ingested = models.IntegerField(default=0)  # newly persisted (vs already-seen) matches
    error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name}#{self.tag} · {self.status} ({self.done}/{self.total})"
