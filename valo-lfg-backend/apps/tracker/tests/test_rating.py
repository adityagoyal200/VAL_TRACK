"""Tests for the 0–10 performance rating (the "tracker score").

`rate()` is pure and deterministic, so these pin the anchor math, the
weight-renormalisation when round-timeline stats are missing, and the
graceful None when a game can't be rated.
"""
from types import SimpleNamespace

from apps.tracker.services.rating import rate, rate_match_player, rate_stored_match


def test_full_blend_hits_expected_score():
    # Every input on an exact anchor: combat 5.5, efficiency 6.0, impact 6.5,
    # duel 5.0, burst 6.5. Weighted sum with full weights (total 1.0) = 5.87.
    r = rate(180, 1.3, kast=72, net_first_bloods=0, multikills=1)
    assert r == 5.9


def test_missing_timeline_renormalises_over_present_weights():
    # Only combat (0.35) + efficiency (0.20) remain; score is their weighted
    # mean, NOT diluted by the absent 45% of weight.
    r = rate(180, 1.3)
    assert r == 5.7  # (0.35*5.5 + 0.20*6.0) / 0.55


def test_no_adr_is_unratable():
    assert rate(0, 2.0, kast=80) is None
    assert rate(0.0, 1.0) is None


def test_elite_game_clamps_to_ten():
    r = rate(400, 3.0, kast=95, net_first_bloods=10, multikills=4)
    assert r == 10.0


def test_ace_maxes_the_burst_component():
    # multikills=0 would give burst 4.5, but a 5k round tops burst out at 10.
    plain = rate(180, 1.3, kast=72, net_first_bloods=0, multikills=0)
    ace = rate(180, 1.3, kast=72, net_first_bloods=0, multikills=0, best_kill_round=5)
    assert ace > plain
    assert ace == 6.2


def test_rate_match_player_uses_timeline_when_present():
    p = SimpleNamespace(
        adr=220, kills=20, assists=6, deaths=12, kast=80,
        first_bloods=5, first_deaths=1, multikills=2, best_kill_round=4,
    )
    assert rate_match_player(p) is not None
    assert 0.0 <= rate_match_player(p) <= 10.0


def test_rate_match_player_falls_back_without_timeline():
    # kast == 0 → treat timeline as absent; still rated off adr + kda.
    p = SimpleNamespace(
        adr=150, kills=15, assists=4, deaths=15, kast=0,
        first_bloods=0, first_deaths=0, multikills=0, best_kill_round=0,
    )
    r = rate_match_player(p)
    assert r is not None
    # Same inputs, no duel/burst/impact components.
    assert r == rate(150, (15 + 4) / 15)


def test_rate_stored_match_is_combat_and_efficiency_only():
    m = SimpleNamespace(adr=200, kills=18, assists=5, deaths=14)
    assert rate_stored_match(m) == rate(200, (18 + 5) / 14)


def test_zero_deaths_kda_does_not_crash():
    p = SimpleNamespace(
        adr=200, kills=10, assists=3, deaths=0, kast=75,
        first_bloods=2, first_deaths=0, multikills=1, best_kill_round=3,
    )
    assert rate_match_player(p) is not None
