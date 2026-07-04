from django.contrib import admin

from .models import JoinRequest, ListingMember, PartyListing


class ListingMemberInline(admin.TabularInline):
    model = ListingMember
    extra = 0


@admin.register(PartyListing)
class PartyListingAdmin(admin.ModelAdmin):
    list_display = ("id", "host", "listing_type", "region", "status", "expires_at")
    list_filter = ("status", "region", "listing_type")
    search_fields = ("host__username", "note")
    inlines = [ListingMemberInline]


@admin.register(JoinRequest)
class JoinRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "listing", "requester", "status", "responded_at")
    list_filter = ("status",)
    search_fields = ("requester__username",)
