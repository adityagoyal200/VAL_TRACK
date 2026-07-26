"""Parser + aggregation unit tests — no DB, no network.

These lock the HenrikDev v4 match shape into place so a provider change that
breaks the scoreboard is caught without needing the live API.
"""
from apps.integrations.services import henrikdev_client as riot
from apps.tracker.services.aggregate import build_overview
from apps.tracker.services.career import build_career
from apps.tracker.services.squad import build_squad

SUBJECT = "SUBJECT-PUUID"


def _match(**overrides):
    payload = {
        "metadata": {
            "match_id": "abc-123",
            "map": {"id": "map-uuid-ascent", "name": "Ascent"},
            "game_length_in_ms": 2_100_000,
            "started_at": "2026-07-04T18:30:00.000Z",
            "queue": {"id": "competitive", "name": "Competitive"},
        },
        "players": [
            {
                "puuid": SUBJECT, "name": "Akaari", "tag": "001", "team_id": "Red",
                "agent": {"id": "jett-uuid", "name": "Jett"},
                "tier": {"name": "Diamond 2"},
                "stats": {
                    "score": 6300, "kills": 24, "deaths": 15, "assists": 5,
                    "headshots": 40, "bodyshots": 55, "legshots": 5,
                    "damage": {"dealt": 4200},
                },
            },
            {
                "puuid": "enemy-1", "name": "Reyna", "tag": "na", "team_id": "Blue",
                "agent": {"id": "reyna-uuid", "name": "Reyna"},
                "tier": {"name": ""},
                "stats": {"score": 7000, "kills": 27, "deaths": 14, "assists": 3,
                          "headshots": 50, "bodyshots": 40, "legshots": 10,
                          "damage": {"dealt": 4800}},
            },
        ],
        "teams": [
            {"team_id": "Red", "won": True, "rounds": {"won": 13, "lost": 9}},
            {"team_id": "Blue", "won": False, "rounds": {"won": 9, "lost": 13}},
        ],
    }
    payload.update(overrides)
    return payload


def test_parse_match_subject_line():
    m = riot.parse_match(_match(), SUBJECT)
    assert m.map_name == "Ascent"
    assert m.mode == "Competitive"
    assert m.game_length_seconds == 2100
    assert m.map_image.endswith("/maps/map-uuid-ascent/listviewicon.png")
    assert m.started_at == "2026-07-04T18:30:00+00:00"
    # ACS = score / rounds = 6300 / 22
    assert m.subject_acs == round(6300 / 22)
    assert m.subject_won is True
    assert m.subject_agent == "Jett"
    assert m.subject_agent_image.endswith("/agents/jett-uuid/displayicon.png")
    assert m.subject_score_line == "13 - 9"
    assert m.subject_hs_percent == 40.0  # 40 / (40+55+5)


def test_parse_match_player_derived_stats():
    m = riot.parse_match(_match(), SUBJECT)
    sub = next(p for p in m.players if p.is_subject)
    assert sub.kd == round(24 / 15, 2)
    assert sub.acs == round(6300 / 22)
    assert sub.damage_dealt == 4200
    assert sub.tier_name == "Diamond 2"
    enemy = next(p for p in m.players if not p.is_subject)
    assert enemy.is_subject is False
    assert enemy.tier_name == ""  # hidden rank tolerated


def test_parse_match_handles_partial_payload():
    m = riot.parse_match({"metadata": {"match_id": "x"}, "players": [], "teams": []}, SUBJECT)
    assert m.players == []
    assert m.subject_won is None
    assert m.subject_acs == 0
    assert m.map_image == ""  # no map id -> no url


def test_zero_deaths_kd_is_kill_count():
    payload = _match()
    payload["players"][0]["stats"]["deaths"] = 0
    m = riot.parse_match(payload, SUBJECT)
    sub = next(p for p in m.players if p.is_subject)
    assert sub.kd == 24.0


def test_build_overview_aggregates():
    m = riot.parse_match(_match(), SUBJECT)
    loss = riot.parse_match(_match(), SUBJECT)
    loss.subject_won = False
    ov = build_overview([m, m, loss])
    assert ov.matches_counted == 3
    assert ov.wins == 2 and ov.losses == 1
    assert ov.win_rate == round(100 * 2 / 3, 1)
    assert ov.kd == round(24 / 15, 2)
    assert ov.avg_acs == round(6300 / 22)
    assert ov.top_agents[0].agent == "Jett"
    assert ov.top_agents[0].games == 3
    assert ov.top_maps[0].map_name == "Ascent"


def test_build_overview_skips_matches_without_subject():
    payload = _match()
    payload["players"] = payload["players"][1:]  # drop the subject line
    m = riot.parse_match(payload, SUBJECT)
    assert build_overview([m]).matches_counted == 0


def _kill(round_no, t, killer, victim, weapon_name="Vandal", weapon_id="vandal-uuid"):
    return {
        "round": round_no, "time_in_round_in_ms": t,
        "killer": {"puuid": killer}, "victim": {"puuid": victim},
        "assistants": [], "weapon": {"id": weapon_id, "name": weapon_name, "type": "Weapon"},
    }


def _match_with_timeline():
    payload = _match()
    payload["kills"] = [
        # round 0: subject opens, then dies without a trade
        _kill(0, 5_000, SUBJECT, "enemy-1"),
        _kill(0, 12_000, "enemy-1", SUBJECT),
        # round 1: a subject triple
        _kill(1, 3_000, SUBJECT, "enemy-2"),
        _kill(1, 6_000, SUBJECT, "enemy-3", weapon_name="Operator", weapon_id="op-uuid"),
        _kill(1, 9_000, SUBJECT, "enemy-4"),
        # round 2: subject dies with no kill, assist, or trade -> KAST miss
        _kill(2, 3_000, "enemy-1", SUBJECT),
    ]
    payload["rounds"] = [
        {"plant": {"player": {"puuid": SUBJECT}}},
        {"defuse": {"player": {"puuid": "enemy-1"}}},
    ]
    return payload


def test_timeline_stats():
    m = riot.parse_match(_match_with_timeline(), SUBJECT)
    sub = next(p for p in m.players if p.is_subject)
    enemy = next(p for p in m.players if not p.is_subject)

    assert sub.first_bloods == 2  # opened rounds 0 and 1
    assert sub.first_deaths == 1  # round 2
    assert enemy.first_deaths == 1 and enemy.first_bloods == 1
    assert sub.multikills == 1 and sub.best_kill_round == 3
    assert sub.plants == 1
    assert enemy.defuses == 1
    # KAST: subject misses only round 2 (died with no kill/assist/trade)
    assert sub.kast == round(100 * 21 / 22, 1)
    assert enemy.kast == 100.0
    assert sub.adr == round(4200 / 22, 1)
    # weapon breakdown sorted by kills
    assert sub.weapons[0]["name"] == "Vandal" and sub.weapons[0]["kills"] == 3
    assert sub.weapons[1]["name"] == "Operator"
    assert sub.weapons[0]["image"].endswith("/weapons/vandal-uuid/displayicon.png")
    # subject topped their team but not the lobby (enemy scored higher)
    assert m.subject_team_mvp is True and m.subject_mvp is False
    assert m.subject_first_bloods == 2 and m.subject_multikills == 1


def test_timeline_absent_leaves_defaults():
    m = riot.parse_match(_match(), SUBJECT)
    sub = next(p for p in m.players if p.is_subject)
    assert sub.kast == 0.0 and sub.first_bloods == 0 and sub.weapons == []
    # plain per-round damage still computes without the kill feed
    assert sub.adr == round(4200 / 22, 1)


def test_overview_extended_aggregates():
    m = riot.parse_match(_match_with_timeline(), SUBJECT)
    loss = riot.parse_match(_match_with_timeline(), SUBJECT)
    loss.subject_won = False
    ov = build_overview([m, m, loss])
    assert ov.first_bloods == 6
    assert ov.multikills == 3
    assert ov.plants == 3
    assert ov.current_streak == 2  # two newest wins, then a loss
    assert ov.top_weapons[0].name == "Vandal" and ov.top_weapons[0].kills == 9
    assert ov.best_match is not None and ov.best_match["match_id"] == "abc-123"
    assert ov.headshots == 3 * 40
    assert ov.hs_shot_percent == 40.0
    assert ov.team_mvps == 3


# --- stored matches / career ------------------------------------------------

def _stored(act="e11a4", won_team="Blue", agent="Reyna", **overrides):
    payload = {
        "meta": {
            "id": "sm-1",
            "map": {"id": "sunset-uuid", "name": "Sunset"},
            "mode": "Competitive",
            "started_at": "2026-07-05T02:48:05.126Z",
            "season": {"id": "s", "short": act},
        },
        "stats": {
            "puuid": SUBJECT, "team": won_team, "level": 200,
            "character": {"id": "reyna-uuid", "name": agent}, "tier": 27,
            "score": 6900, "kills": 24, "deaths": 17, "assists": 5,
            "shots": {"head": 26, "body": 23, "leg": 1},
            "damage": {"made": 4469, "received": 2982},
        },
        "teams": {"red": 10, "blue": 13},
    }
    payload["meta"].update(overrides.get("meta", {}))
    payload["stats"].update(overrides.get("stats", {}))
    return payload


def test_parse_stored_match():
    sm = riot.parse_stored_match(_stored())
    assert sm.act == "e11a4"
    assert sm.map_name == "Sunset"
    assert sm.rounds == 23
    assert sm.won is True  # Blue 13 > Red 10
    assert sm.acs == round(6900 / 23)
    assert sm.hs_percent == round(100 * 26 / 50, 1)
    assert sm.adr == round(4469 / 23, 1)
    assert sm.agent_image.endswith("/agents/reyna-uuid/displayicon.png")
    # a red-team win flips the outcome
    assert riot.parse_stored_match(_stored(won_team="Red")).won is False


def test_build_career_groups_by_act():
    matches = [
        riot.parse_stored_match(_stored(act="e11a4", agent="Reyna")),
        riot.parse_stored_match(_stored(act="e11a4", agent="Jett", won_team="Red")),
        riot.parse_stored_match(_stored(act="e11a3", agent="Reyna")),
    ]
    acts, lifetime = build_career(matches)
    assert [a.act for a in acts] == ["e11a4", "e11a3"]  # newest first
    e11a4 = acts[0]
    assert e11a4.matches == 2 and e11a4.wins == 1 and e11a4.losses == 1
    assert e11a4.win_rate == 50.0
    assert {a.agent for a in e11a4.top_agents} == {"Reyna", "Jett"}
    assert lifetime.act == "all" and lifetime.matches == 3
    assert lifetime.peak_tier == 27


# --- squad: party size, teammates, duels ------------------------------------

def _squad_match():
    def player(puuid, name, team, party, agent_id, score, party_stats=None):
        return {
            "puuid": puuid, "name": name, "tag": "001", "team_id": team,
            "party_id": party, "agent": {"id": agent_id, "name": agent_id},
            "tier": {"name": "Diamond 2"},
            "stats": {"score": score, "kills": 20, "deaths": 15, "assists": 4,
                      "headshots": 20, "bodyshots": 30, "legshots": 2,
                      "damage": {"dealt": 3000, "received": 2500}},
        }
    return {
        "metadata": {
            "match_id": "sq-1", "map": {"id": "m", "name": "Bind"},
            "game_length_in_ms": 2_000_000, "started_at": "2026-07-04T18:30:00Z",
            "queue": {"id": "competitive", "name": "Competitive"},
        },
        "players": [
            player(SUBJECT, "Akaari", "Red", "P1", "jett", 6300),
            player("mate-1", "Duo", "Red", "P1", "sova", 5000),  # same party
            player("solo-mate", "Rando", "Red", "P9", "sage", 4000),
            player("enemy-1", "Villain", "Blue", "P2", "reyna", 7000),
        ],
        "teams": [
            {"team_id": "Red", "won": True, "rounds": {"won": 13, "lost": 9}},
            {"team_id": "Blue", "won": False, "rounds": {"won": 9, "lost": 13}},
        ],
        "kills": [
            {"round": 0, "time_in_round_in_ms": 5000,
             "killer": {"puuid": SUBJECT}, "victim": {"puuid": "enemy-1"},
             "weapon": {"id": "v", "name": "Vandal", "type": "Weapon"}, "assistants": []},
            {"round": 0, "time_in_round_in_ms": 9000,
             "killer": {"puuid": "enemy-1"}, "victim": {"puuid": SUBJECT},
             "weapon": {"id": "v", "name": "Vandal", "type": "Weapon"}, "assistants": []},
            {"round": 1, "time_in_round_in_ms": 4000,
             "killer": {"puuid": SUBJECT}, "victim": {"puuid": "enemy-1"},
             "weapon": {"id": "v", "name": "Vandal", "type": "Weapon"}, "assistants": []},
        ],
    }


def test_match_party_and_duels():
    m = riot.parse_match(_squad_match(), SUBJECT)
    assert m.subject_party_size == 2  # subject + Duo share P1
    assert m.subject_placement == 2  # enemy-1 out-scores the subject
    dirs = [d["dir"] for d in m.subject_duels]
    assert dirs.count("kill") == 2 and dirs.count("death") == 1
    assert all(d["puuid"] == "enemy-1" for d in m.subject_duels)


def test_build_squad():
    m = riot.parse_match(_squad_match(), SUBJECT)
    squad = build_squad([m, m], SUBJECT)
    assert squad.matches_analysed == 2
    # one party-size bucket (duo), two games, both wins
    assert len(squad.party_sizes) == 1
    duo = squad.party_sizes[0]
    assert duo.size == 2 and duo.games == 2 and duo.win_rate == 100.0
    assert duo.avg_placement == 2.0
    # the recurring teammate is surfaced
    assert len(squad.teammates) == 1
    assert squad.teammates[0].name == "Duo" and squad.teammates[0].games == 2
    # enemy-1 is both top victim (4 kills) and nemesis (2 deaths)
    assert squad.victims[0].name == "Villain" and squad.victims[0].kills == 4
    assert squad.nemeses[0].deaths == 2
    assert squad.stacked_win_rate == 100.0
