from django.contrib import admin

from .models import RiotAccountLink
from .services import henrikdev_client
from .tasks import apply_mmr


@admin.register(RiotAccountLink)
class RiotAccountLinkAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "riot_game_name",
        "riot_tag_line",
        "region",
        "status",
        "current_tier",
        "created_at",
    )
    list_filter = ("status", "region", "current_tier")
    search_fields = ("user__email", "user__username", "riot_game_name")
    readonly_fields = ("puuid", "verification_match_id", "screenshot_preview")
    actions = ["approve_manual_review", "reject_manual_review"]

    @admin.display(description="Screenshot")
    def screenshot_preview(self, obj):
        if not obj.manual_review_screenshot:
            return "—"
        from django.utils.html import format_html

        return format_html(
            '<a href="{0}" target="_blank"><img src="{0}" style="max-width:400px" /></a>',
            obj.manual_review_screenshot.url,
        )

    @admin.action(description="Approve manual review (mark verified + pull rank)")
    def approve_manual_review(self, request, queryset):
        for link in queryset.filter(status=RiotAccountLink.Status.MANUAL_REVIEW):
            link.status = RiotAccountLink.Status.VERIFIED
            try:
                apply_mmr(link)
            except henrikdev_client.ProviderError:
                pass
            link.save()

    @admin.action(description="Reject manual review")
    def reject_manual_review(self, request, queryset):
        queryset.filter(status=RiotAccountLink.Status.MANUAL_REVIEW).update(
            status=RiotAccountLink.Status.REJECTED
        )
