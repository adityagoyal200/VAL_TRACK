import django_filters

from .models import CommPreference, PartyListing, Region, Tier
from .serializers import TIER_ORDER


class PartyListingFilter(django_filters.FilterSet):
    region = django_filters.ChoiceFilter(choices=Region.choices)
    listing_type = django_filters.ChoiceFilter(choices=PartyListing.ListingType.choices)
    comm_preference = django_filters.ChoiceFilter(choices=CommPreference.choices)
    # A player's own rank: matches listings whose accepted range includes it.
    rank = django_filters.ChoiceFilter(choices=Tier.choices, method="filter_rank")
    # Comma-separated roles; matches listings needing any of them.
    roles = django_filters.CharFilter(method="filter_roles")

    class Meta:
        model = PartyListing
        fields = []

    def filter_rank(self, queryset, name, value):
        idx = TIER_ORDER.get(value)
        if idx is None:
            return queryset
        # A blank bound means "no floor/ceiling", so it always qualifies.
        mins_ok = [t for t, i in TIER_ORDER.items() if i <= idx] + [""]
        maxs_ok = [t for t, i in TIER_ORDER.items() if i >= idx] + [""]
        return queryset.filter(rank_min__in=mins_ok, rank_max__in=maxs_ok)

    def filter_roles(self, queryset, name, value):
        roles = [r for r in (part.strip() for part in value.split(",")) if r]
        if not roles:
            return queryset
        return queryset.filter(roles_needed__overlap=roles)
