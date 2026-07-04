from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class RiotAccountLink(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending verification"
        VERIFIED = "verified", "Verified"
        MANUAL_REVIEW = "manual_review", "Manual review requested"
        REJECTED = "rejected", "Rejected"
        EXPIRED = "expired", "Verification window expired"

    class Tier(models.TextChoices):
        IRON = "iron", "Iron"
        BRONZE = "bronze", "Bronze"
        SILVER = "silver", "Silver"
        GOLD = "gold", "Gold"
        PLATINUM = "platinum", "Platinum"
        DIAMOND = "diamond", "Diamond"
        ASCENDANT = "ascendant", "Ascendant"
        IMMORTAL = "immortal", "Immortal"
        RADIANT = "radiant", "Radiant"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="riot_link"
    )
    riot_game_name = models.CharField(max_length=16)
    riot_tag_line = models.CharField(max_length=8)
    puuid = models.CharField(max_length=128, blank=True)
    region = models.CharField(max_length=8, blank=True)  # detected by account lookup
    account_level = models.IntegerField(null=True, blank=True)
    current_tier = models.CharField(max_length=16, choices=Tier.choices, blank=True)
    current_division = models.PositiveSmallIntegerField(null=True, blank=True)  # 1-3
    current_rr = models.IntegerField(null=True, blank=True)  # 0-100 within tier
    peak_tier = models.CharField(max_length=16, choices=Tier.choices, blank=True)
    peak_division = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    verification_window_start = models.DateTimeField(null=True, blank=True)
    verification_window_end = models.DateTimeField(null=True, blank=True)
    verification_match_id = models.CharField(max_length=64, blank=True)
    manual_review_screenshot = models.FileField(
        upload_to="riot-verification/", blank=True
    )
    last_rank_refresh_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            # Two platform users can't both hold a VERIFIED claim on one Riot ID
            models.UniqueConstraint(
                fields=["riot_game_name", "riot_tag_line"],
                condition=models.Q(status="verified"),
                name="uniq_verified_riot_id",
            ),
        ]

    def __str__(self):
        return f"{self.riot_game_name}#{self.riot_tag_line} ({self.status})"
