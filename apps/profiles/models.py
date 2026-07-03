from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class PlayerProfile(TimeStampedModel):
    class CommPreference(models.TextChoices):
        VOICE = "voice", "Voice only"
        TEXT = "text", "Text only"
        EITHER = "either", "Either"

    class Region(models.TextChoices):
        NA = "na", "North America"
        EU = "eu", "Europe"
        AP = "ap", "Asia Pacific"
        KR = "kr", "Korea"
        LATAM = "latam", "Latin America"
        BR = "br", "Brazil"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    region = models.CharField(max_length=8, choices=Region.choices, blank=True)
    language = models.CharField(max_length=8, blank=True)  # ISO 639-1, e.g. "en"
    comm_preference = models.CharField(
        max_length=8, choices=CommPreference.choices, blank=True
    )
    bio = models.CharField(max_length=280, blank=True)
    onboarding_completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"profile:{self.user.username}"


class RoleTag(models.TextChoices):
    IGL = "igl", "IGL"
    ENTRY = "entry", "Entry Fragger"
    SUPPORT = "support", "Support"
    DUELIST_MAIN = "duelist_main", "Duelist Main"
    CONTROLLER_MAIN = "controller_main", "Controller Main"
    INITIATOR_MAIN = "initiator_main", "Initiator Main"
    SENTINEL_MAIN = "sentinel_main", "Sentinel Main"
    FLEX = "flex", "Flex"


class ProfileRoleTag(models.Model):
    profile = models.ForeignKey(
        PlayerProfile, related_name="role_tags", on_delete=models.CASCADE
    )
    role = models.CharField(max_length=24, choices=RoleTag.choices)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["profile", "role"], name="uniq_profile_role")
        ]

    def __str__(self):
        return f"{self.profile_id}:{self.role}"


class DayOfWeek(models.IntegerChoices):
    MONDAY = 0, "Monday"
    TUESDAY = 1, "Tuesday"
    WEDNESDAY = 2, "Wednesday"
    THURSDAY = 3, "Thursday"
    FRIDAY = 4, "Friday"
    SATURDAY = 5, "Saturday"
    SUNDAY = 6, "Sunday"


class ScheduleBlock(models.Model):
    """A weekly availability window, stored in the user's declared timezone.
    A separate table (not JSON) so schedule-overlap matching can be a real
    SQL query later without a migration."""

    profile = models.ForeignKey(
        PlayerProfile, related_name="schedule_blocks", on_delete=models.CASCADE
    )
    day_of_week = models.IntegerField(choices=DayOfWeek.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    timezone = models.CharField(max_length=64, default="UTC")  # IANA name

    def __str__(self):
        return f"{self.profile_id}:{self.get_day_of_week_display()} {self.start_time}-{self.end_time}"
