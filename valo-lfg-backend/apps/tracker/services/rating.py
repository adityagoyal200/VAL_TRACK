"""A single 0–10 performance rating per game — the "tracker score".

One `rate()` function is the sole source of truth so every surface (match
rows, scoreboard, agent/map splits, career acts, the profile headline) agrees.

The rating is **performance only** (outcome-independent — a 30-kill loss still
rates high) and uses **absolute anchors**: the same yardstick for everyone,
where an average competitive game lands around 5.0. Each input is mapped to a
0–10 sub-score via a piecewise-linear anchor table, then blended by weight.

Round-timeline stats (KAST, first bloods, multikills) only exist when the
match payload carried the kills/rounds arrays. When they are absent the score
degrades gracefully: the present components are re-normalised over their own
weight, so a rating is still produced from combat + efficiency alone. Modes
with no rounds at all (deathmatch, escalation) yield no ADR → no rating.
"""
from dataclasses import dataclass

# Component weights. They sum to 1.0 when every input is available; missing
# inputs drop out and the remainder is renormalised (see `rate`).
W_COMBAT = 0.35      # ADR — the least-noisy carry signal, kind to low-frag support
W_IMPACT = 0.25      # KAST — rewards trades, utility, survival (not just fragging)
W_EFFICIENCY = 0.20  # KDA — classic frag efficiency
W_DUEL = 0.12        # net first bloods (FB − FD) — entry/opening impact
W_BURST = 0.08       # multikills (+ a 5k nudge) — round-swinging highlight plays

# Anchor tables: (input, sub-score) pairs, ascending. Values between anchors
# interpolate linearly; outside the ends clamp to the nearest sub-score.
_COMBAT = [(40, 1.0), (80, 2.0), (180, 5.5), (220, 7.0), (270, 8.5), (330, 10.0)]
_IMPACT = [(30, 1.0), (50, 3.0), (72, 6.5), (80, 8.0), (88, 10.0)]
_EFFICIENCY = [(0.3, 0.5), (0.6, 2.0), (1.3, 6.0), (1.8, 8.0), (2.5, 10.0)]
_DUEL = [(-4, 3.0), (0, 5.0), (4, 8.0), (7, 10.0)]
_BURST = [(0, 4.5), (1, 6.5), (2, 8.5), (3, 10.0)]


def _lerp(x: float, points: list[tuple[float, float]]) -> float:
    """Piecewise-linear interpolation over ascending (x, y) anchors, clamped."""
    if x <= points[0][0]:
        return points[0][1]
    if x >= points[-1][0]:
        return points[-1][1]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x0 <= x <= x1:
            t = (x - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)
    return points[-1][1]


def rate(
    adr: float,
    kda: float,
    *,
    kast: float | None = None,
    net_first_bloods: int | None = None,
    multikills: int | None = None,
    best_kill_round: int = 0,
) -> float | None:
    """Blend one game's stats into a 0–10 rating, or None if unratable.

    `adr` and `kda` are always required. Pass `kast`, `net_first_bloods` and
    `multikills` only when the match carried round-timeline data; omit them
    (leave None) and their weight is redistributed across what remains.
    """
    if not adr or adr <= 0:
        return None  # no per-round damage → no rounds → nothing to rate

    parts: list[tuple[float, float]] = [
        (W_COMBAT, _lerp(adr, _COMBAT)),
        (W_EFFICIENCY, _lerp(kda, _EFFICIENCY)),
    ]
    if kast is not None and kast > 0:
        parts.append((W_IMPACT, _lerp(kast, _IMPACT)))
    if net_first_bloods is not None:
        parts.append((W_DUEL, _lerp(net_first_bloods, _DUEL)))
    if multikills is not None:
        burst = _lerp(multikills, _BURST)
        if best_kill_round >= 5:  # an ace tops out the burst component
            burst = 10.0
        parts.append((W_BURST, burst))

    total_w = sum(w for w, _ in parts)
    if not total_w:
        return None
    score = sum(w * s for w, s in parts) / total_w
    return round(max(0.0, min(10.0, score)), 1)


def _kda(kills: int, assists: int, deaths: int) -> float:
    return (kills + assists) / deaths if deaths else float(kills + assists)


def rate_match_player(p) -> float | None:
    """Rate one full scoreboard line (`MatchPlayer`). Timeline stats are used
    when present (kast > 0), else the score falls back to combat+efficiency."""
    has_timeline = bool(p.kast and p.kast > 0)
    return rate(
        p.adr,
        _kda(p.kills, p.assists, p.deaths),
        kast=p.kast if has_timeline else None,
        net_first_bloods=(p.first_bloods - p.first_deaths) if has_timeline else None,
        multikills=p.multikills if has_timeline else None,
        best_kill_round=p.best_kill_round,
    )


def rate_stored_match(m) -> float | None:
    """Rate a lifetime `StoredMatch`. That endpoint has no kill-timeline, so
    only combat (ADR) + efficiency (KDA) feed the score."""
    return rate(m.adr, _kda(m.kills, m.assists, m.deaths))
