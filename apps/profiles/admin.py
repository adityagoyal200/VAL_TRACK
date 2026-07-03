from django.contrib import admin

from .models import PlayerProfile, ProfileRoleTag, ScheduleBlock


class ProfileRoleTagInline(admin.TabularInline):
    model = ProfileRoleTag
    extra = 0


class ScheduleBlockInline(admin.TabularInline):
    model = ScheduleBlock
    extra = 0


@admin.register(PlayerProfile)
class PlayerProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "region", "language", "comm_preference", "onboarding_completed_at")
    list_filter = ("region", "comm_preference")
    search_fields = ("user__email", "user__username")
    inlines = [ProfileRoleTagInline, ScheduleBlockInline]
