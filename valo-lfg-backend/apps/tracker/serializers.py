"""Read-only serializers over the seam dataclasses (not DB models).

DRF resolves each field with getattr, so plain dataclasses and their
computed @property fields serialize directly.
"""
from rest_framework import serializers

from apps.tracker.services.rating import rate_match_player


class MatchPlayerSerializer(serializers.Serializer):
    puuid = serializers.CharField()
    name = serializers.CharField()
    tag = serializers.CharField()
    team_id = serializers.CharField()
    agent = serializers.CharField()
    agent_image = serializers.CharField()
    tier_name = serializers.CharField()
    score = serializers.IntegerField()
    kills = serializers.IntegerField()
    deaths = serializers.IntegerField()
    assists = serializers.IntegerField()
    headshots = serializers.IntegerField()
    bodyshots = serializers.IntegerField()
    legshots = serializers.IntegerField()
    damage_dealt = serializers.IntegerField()
    damage_received = serializers.IntegerField()
    acs = serializers.IntegerField()
    kd = serializers.FloatField()
    hs_percent = serializers.FloatField()
    adr = serializers.FloatField()
    dd_delta = serializers.FloatField()
    kast = serializers.FloatField()
    first_bloods = serializers.IntegerField()
    first_deaths = serializers.IntegerField()
    multikills = serializers.IntegerField()
    best_kill_round = serializers.IntegerField()
    plants = serializers.IntegerField()
    defuses = serializers.IntegerField()
    weapons = serializers.JSONField()
    is_subject = serializers.BooleanField()
    rating = serializers.SerializerMethodField()

    def get_rating(self, obj) -> float | None:
        return rate_match_player(obj)


class MatchTeamSerializer(serializers.Serializer):
    team_id = serializers.CharField()
    won = serializers.BooleanField(allow_null=True)
    rounds_won = serializers.IntegerField()
    rounds_lost = serializers.IntegerField()


class MatchSummarySerializer(serializers.Serializer):
    """The lightweight row shown in the history list."""
    match_id = serializers.CharField()
    map_name = serializers.CharField()
    map_image = serializers.CharField()
    mode = serializers.CharField()
    started_at = serializers.CharField()
    game_length_seconds = serializers.IntegerField()
    subject_won = serializers.BooleanField(allow_null=True)
    subject_agent = serializers.CharField()
    subject_agent_image = serializers.CharField()
    subject_kills = serializers.IntegerField()
    subject_deaths = serializers.IntegerField()
    subject_assists = serializers.IntegerField()
    subject_acs = serializers.IntegerField()
    subject_hs_percent = serializers.FloatField()
    subject_score_line = serializers.CharField()
    subject_adr = serializers.FloatField()
    subject_kast = serializers.FloatField()
    subject_first_bloods = serializers.IntegerField()
    subject_multikills = serializers.IntegerField()
    subject_mvp = serializers.BooleanField()
    subject_team_mvp = serializers.BooleanField()
    rating = serializers.SerializerMethodField()

    def get_rating(self, obj) -> float | None:
        """The tracked player's rating for this game — from their own
        scoreboard line so the number matches the detail scoreboard exactly."""
        sub = next((p for p in obj.players if p.is_subject), None)
        return rate_match_player(sub) if sub else None


class MatchDetailSerializer(MatchSummarySerializer):
    """Full scoreboard for one match, plus match-level context."""
    season_name = serializers.CharField()
    cluster = serializers.CharField()
    region = serializers.CharField()
    queue_id = serializers.CharField()
    teams = MatchTeamSerializer(many=True)
    players = MatchPlayerSerializer(many=True)


class MMRHistoryEntrySerializer(serializers.Serializer):
    match_id = serializers.CharField()
    started_at = serializers.CharField()
    tier_name = serializers.CharField()
    rr = serializers.IntegerField(allow_null=True)
    rr_change = serializers.IntegerField(allow_null=True)
    map_name = serializers.CharField()


class AgentStatSerializer(serializers.Serializer):
    agent = serializers.CharField()
    agent_image = serializers.CharField()
    games = serializers.IntegerField()
    wins = serializers.IntegerField()
    win_rate = serializers.FloatField()
    kd = serializers.FloatField()
    avg_acs = serializers.IntegerField()
    adr = serializers.FloatField()
    kast = serializers.FloatField()
    hs_percent = serializers.FloatField()
    first_bloods = serializers.IntegerField()
    multikills = serializers.IntegerField()
    avg_rating = serializers.FloatField(allow_null=True)


class MapStatSerializer(serializers.Serializer):
    map_name = serializers.CharField()
    map_image = serializers.CharField()
    games = serializers.IntegerField()
    wins = serializers.IntegerField()
    win_rate = serializers.FloatField()
    kd = serializers.FloatField()
    avg_acs = serializers.IntegerField()
    avg_rating = serializers.FloatField(allow_null=True)


class WeaponStatSerializer(serializers.Serializer):
    weapon_id = serializers.CharField()
    name = serializers.CharField()
    image = serializers.CharField()
    kills = serializers.IntegerField()


class OverviewStatsSerializer(serializers.Serializer):
    matches_counted = serializers.IntegerField()
    wins = serializers.IntegerField()
    losses = serializers.IntegerField()
    draws = serializers.IntegerField()
    win_rate = serializers.FloatField()
    kills = serializers.IntegerField()
    deaths = serializers.IntegerField()
    assists = serializers.IntegerField()
    kd = serializers.FloatField()
    kda = serializers.FloatField()
    avg_acs = serializers.IntegerField()
    avg_kills = serializers.FloatField()
    adr = serializers.FloatField()
    kast = serializers.FloatField()
    hs_percent = serializers.FloatField()
    hs_shot_percent = serializers.FloatField()
    body_percent = serializers.FloatField()
    leg_percent = serializers.FloatField()
    headshots = serializers.IntegerField()
    bodyshots = serializers.IntegerField()
    legshots = serializers.IntegerField()
    damage_dealt = serializers.IntegerField()
    damage_received = serializers.IntegerField()
    first_bloods = serializers.IntegerField()
    first_deaths = serializers.IntegerField()
    multikills = serializers.IntegerField()
    best_kill_round = serializers.IntegerField()
    plants = serializers.IntegerField()
    defuses = serializers.IntegerField()
    mvps = serializers.IntegerField()
    team_mvps = serializers.IntegerField()
    current_streak = serializers.IntegerField()
    avg_rating = serializers.FloatField(allow_null=True)
    rating_form = serializers.ListField(child=serializers.FloatField())
    best_match = serializers.JSONField(allow_null=True)
    top_agents = AgentStatSerializer(many=True)
    top_maps = MapStatSerializer(many=True)
    top_weapons = WeaponStatSerializer(many=True)


class SeasonStatSerializer(serializers.Serializer):
    season = serializers.CharField()
    wins = serializers.IntegerField()
    games = serializers.IntegerField()
    end_tier = serializers.CharField()


class CareerAgentSerializer(serializers.Serializer):
    agent = serializers.CharField()
    agent_image = serializers.CharField()
    games = serializers.IntegerField()
    wins = serializers.IntegerField()
    win_rate = serializers.FloatField()
    kd = serializers.FloatField()
    avg_acs = serializers.IntegerField()


class CareerMapSerializer(serializers.Serializer):
    map_name = serializers.CharField()
    map_image = serializers.CharField()
    games = serializers.IntegerField()
    wins = serializers.IntegerField()
    win_rate = serializers.FloatField()
    avg_acs = serializers.IntegerField()


class ActStatSerializer(serializers.Serializer):
    act = serializers.CharField()
    label = serializers.CharField()
    matches = serializers.IntegerField()
    wins = serializers.IntegerField()
    losses = serializers.IntegerField()
    draws = serializers.IntegerField()
    win_rate = serializers.FloatField()
    kills = serializers.IntegerField()
    deaths = serializers.IntegerField()
    assists = serializers.IntegerField()
    kd = serializers.FloatField()
    kda = serializers.FloatField()
    avg_acs = serializers.IntegerField()
    avg_kills = serializers.FloatField()
    hs_percent = serializers.FloatField()
    body_percent = serializers.FloatField()
    leg_percent = serializers.FloatField()
    head = serializers.IntegerField()
    body = serializers.IntegerField()
    leg = serializers.IntegerField()
    adr = serializers.FloatField()
    avg_rating = serializers.FloatField(allow_null=True)
    peak_tier = serializers.IntegerField()
    top_agents = CareerAgentSerializer(many=True)
    top_maps = CareerMapSerializer(many=True)


class CareerSerializer(serializers.Serializer):
    acts = ActStatSerializer(many=True)
    all = ActStatSerializer()


class PartySizeStatSerializer(serializers.Serializer):
    size = serializers.IntegerField()
    games = serializers.IntegerField()
    wins = serializers.IntegerField()
    win_rate = serializers.FloatField()
    kd = serializers.FloatField()
    avg_acs = serializers.IntegerField()
    avg_placement = serializers.FloatField()


class TeammateSerializer(serializers.Serializer):
    puuid = serializers.CharField()
    name = serializers.CharField()
    tag = serializers.CharField()
    agent_image = serializers.CharField()
    games = serializers.IntegerField()
    wins = serializers.IntegerField()
    win_rate = serializers.FloatField()


class DuelistSerializer(serializers.Serializer):
    puuid = serializers.CharField()
    name = serializers.CharField()
    tag = serializers.CharField()
    agent_image = serializers.CharField()
    kills = serializers.IntegerField()
    deaths = serializers.IntegerField()
    diff = serializers.IntegerField()


class SquadSerializer(serializers.Serializer):
    matches_analysed = serializers.IntegerField()
    solo_win_rate = serializers.FloatField()
    stacked_win_rate = serializers.FloatField()
    party_sizes = PartySizeStatSerializer(many=True)
    teammates = TeammateSerializer(many=True)
    nemeses = DuelistSerializer(many=True)
    victims = DuelistSerializer(many=True)


class ProfileHeaderSerializer(serializers.Serializer):
    """Identity + rank banner at the top of a tracker page."""
    riot_game_name = serializers.CharField()
    riot_tag_line = serializers.CharField()
    region = serializers.CharField()
    account_level = serializers.IntegerField(allow_null=True)
    card_wide = serializers.CharField(allow_blank=True)
    card_small = serializers.CharField(allow_blank=True)
    title = serializers.CharField(allow_blank=True)
    current_tier = serializers.CharField()
    current_division = serializers.IntegerField(allow_null=True)
    current_rr = serializers.IntegerField(allow_null=True)
    last_change = serializers.IntegerField(allow_null=True)
    elo = serializers.IntegerField(allow_null=True)
    leaderboard_rank = serializers.IntegerField(allow_null=True)
    peak_tier = serializers.CharField()
    peak_division = serializers.IntegerField(allow_null=True)
    seasons = SeasonStatSerializer(many=True)
