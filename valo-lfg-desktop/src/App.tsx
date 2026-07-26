import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type LobbyPlayer = {
  puuid: string;
  name: string;
  tag: string;
  team: string;
  is_self: boolean;
  agent: string;
  agent_icon: string;
  tier: number;
  tier_name: string;
  rr: number;
  peak_tier: number;
  peak_name: string;
  wins: number;
  games: number;
  level: number;
  incognito: boolean;
};

type Lobby = {
  phase: "INGAME" | "PREGAME" | "MENUS";
  match_id: string;
  has_loadouts: boolean;
  players: LobbyPlayer[];
};

type WeaponSkin = { weapon: string; skin: string; icon: string };

type RecentMatch = {
  map: string;
  mode: string;
  agent: string;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  won: boolean;
  rounds_won: number;
  rounds_lost: number;
};

// Heartbeat fallback; real updates arrive instantly via the "lobby-changed" event.
const POLL_MS = 45_000;

const PHASE_LABEL: Record<Lobby["phase"], string> = {
  INGAME: "LIVE MATCH",
  PREGAME: "AGENT SELECT",
  MENUS: "IN MENUS",
};

/** Tier group -> accent color for the rank readout. */
function tierColor(tier: number): string {
  if (tier >= 27) return "#ffffa8"; // radiant
  if (tier >= 24) return "#ff4655"; // immortal
  if (tier >= 21) return "#00e5c0"; // ascendant
  if (tier >= 18) return "#b489c4"; // diamond
  if (tier >= 15) return "#59a9b6"; // platinum
  if (tier >= 12) return "#e7c65f"; // gold
  if (tier >= 9) return "#a5a5a5"; // silver
  if (tier >= 3) return "#a5855d"; // bronze/iron
  return "#6b7280"; // unranked
}

function modeLabel(mode: string): string {
  if (!mode) return "Custom";
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

export default function App() {
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LobbyPlayer | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const debounce = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const l = await invoke<Lobby>("get_lobby");
      setLobby(l);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Coalesce bursts of client events into a single refetch.
  const nudge = useCallback(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(refresh, 600);
  }, [refresh]);

  useEffect(() => {
    const start = () => {
      window.clearInterval(timer.current);
      refresh();
      timer.current = window.setInterval(refresh, POLL_MS);
    };
    const onVisibility = () => {
      if (document.hidden) window.clearInterval(timer.current);
      else start();
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    const un = listen("lobby-changed", nudge);
    return () => {
      window.clearInterval(timer.current);
      window.clearTimeout(debounce.current);
      document.removeEventListener("visibilitychange", onVisibility);
      un.then((f) => f());
    };
  }, [refresh, nudge]);

  const offline = error !== null && /isn't running|lockfile|signed in/i.test(error);

  if (loading) {
    return (
      <Shell>
        <section className="panel center">
          <p className="dim">Scanning local Riot client…</p>
        </section>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <section className="panel center">
          <p className="status-title">{offline ? "RIOT CLIENT OFFLINE" : "LINK ERROR"}</p>
          <p className="dim">
            {offline ? "Launch the Riot client / VALORANT and I'll pick it up." : error}
          </p>
          <button className="btn" onClick={() => { setLoading(true); refresh(); }}>Retry</button>
        </section>
      </Shell>
    );
  }

  const players = lobby?.players ?? [];

  return (
    <Shell phase={lobby ? PHASE_LABEL[lobby.phase] : ""}>
      {players.length === 0 ? (
        <section className="panel center">
          <p className="dim">Signed in. Waiting for a lobby or match…</p>
        </section>
      ) : (
        <div className="roster">
          {players.map((p, i) => {
            const teamBreak = i > 0 && p.team !== players[i - 1].team;
            const losses = p.games - p.wins;
            const wr = p.games > 0 ? Math.round((p.wins / p.games) * 100) : null;
            return (
              <div key={p.puuid}>
                {teamBreak && <div className="team-divider" />}
                <button
                  className={`row${p.is_self ? " me" : ""} clickable`}
                  style={{ ["--tier" as string]: tierColor(p.tier) }}
                  onClick={() => setSelected(p)}
                >
                  <span className="agent-cell">
                    {p.agent_icon ? (
                      <img className="agent-img" src={p.agent_icon} alt={p.agent} />
                    ) : (
                      <span className="agent-img placeholder" />
                    )}
                  </span>
                  <span className="who">
                    <span className="who-name">
                      {p.name ? (
                        <>{p.name}<span className="tag">#{p.tag}</span></>
                      ) : (
                        <span className="dim">Hidden</span>
                      )}
                      {p.is_self && <span className="you-badge">YOU</span>}
                    </span>
                    <span className="who-sub dim">
                      {p.agent !== "—" ? p.agent : "Selecting…"} · Lvl {p.level}
                    </span>
                  </span>
                  {wr !== null && (
                    <span className="form">
                      <span className="form-wl">{p.wins}W {losses}L</span>
                      <span className="form-wr dim">{wr}% WR</span>
                    </span>
                  )}
                  <span className="rank-cell">
                    <span className="rank-name">{p.tier_name}</span>
                    {p.tier > 0 && p.tier < 27 && <span className="rank-rr dim">{p.rr} RR</span>}
                    {p.peak_tier > 0 && (
                      <span className="rank-peak dim" style={{ color: tierColor(p.peak_tier) }}>
                        ▲ {p.peak_name}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <footer className="footbar">
        <span className="pulse" />
        <span className="dim">LIVE · click a player to scout them</span>
        <button className="btn ghost" onClick={() => setSyncOpen(true)}>Sync collection</button>
        <button className="btn ghost" onClick={refresh}>Refresh</button>
      </footer>

      {selected && (
        <ScoutModal
          player={selected}
          hasLoadouts={lobby?.has_loadouts ?? false}
          onClose={() => setSelected(null)}
        />
      )}
      {syncOpen && <SyncModal onClose={() => setSyncOpen(false)} />}
    </Shell>
  );
}

function Shell({ phase, children }: { phase?: string; children: React.ReactNode }) {
  return (
    <main className="shell">
      <header className="topbar">
        <span className="wordmark">
          VALO<span className="wordmark-accent">LFG</span>
        </span>
        <span className="topbar-label">{phase || "TRACKER"}</span>
      </header>
      {children}
    </main>
  );
}

/** Push the signed-in player's owned skins to the website using the one-time
 * code generated on the web tracker's Collection tab. */
function SyncModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sync = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const count = await invoke<number>("sync_skins", { code: code.trim() });
      setResult(`${count} skins synced — refresh the website's Collection tab.`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <p className="label">SYNC SKIN COLLECTION</p>
            <p className="dim">
              Generate a code on the website (Tracker → Collection), paste it here,
              and your owned skins show up on your web profile.
            </p>
          </div>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </header>
        <div className="modal-body">
          <div className="sync-row">
            <input
              className="sync-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && sync()}
              placeholder="SYNC CODE"
              maxLength={16}
              autoFocus
            />
            <button className="btn" onClick={sync} disabled={busy || !code.trim()}>
              {busy ? "Syncing…" : "Sync"}
            </button>
          </div>
          {result && <p className="sync-ok">{result}</p>}
          {err && <p className="sync-err">{err}</p>}
        </div>
      </div>
    </div>
  );
}

function ScoutModal({
  player,
  hasLoadouts,
  onClose,
}: {
  player: LobbyPlayer;
  hasLoadouts: boolean;
  onClose: () => void;
}) {
  const [matches, setMatches] = useState<RecentMatch[] | null>(null);
  const [matchesErr, setMatchesErr] = useState<string | null>(null);
  const [skins, setSkins] = useState<WeaponSkin[] | null>(null);
  const [skinsErr, setSkinsErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    invoke<RecentMatch[]>("get_player_matches", { puuid: player.puuid })
      .then((m) => alive && setMatches(m))
      .catch((e) => alive && setMatchesErr(String(e)));
    if (hasLoadouts) {
      invoke<WeaponSkin[]>("get_player_loadout", { puuid: player.puuid })
        .then((s) => alive && setSkins(s))
        .catch((e) => alive && setSkinsErr(String(e)));
    }
    return () => { alive = false; };
  }, [player.puuid, hasLoadouts]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <p className="label">SCOUTING REPORT</p>
            <p className="riot-id" style={{ fontSize: 18 }}>
              {player.name || "Hidden"}
              {player.name && <span className="tag">#{player.tag}</span>}
            </p>
            <p className="dim">
              {player.agent} · {player.tier_name}
              {player.peak_tier > 0 && ` · Peak ${player.peak_name}`}
            </p>
          </div>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </header>

        <div className="modal-body">
          <p className="label">RECENT MATCHES</p>
          {matchesErr ? (
            <p className="dim">{matchesErr}</p>
          ) : !matches ? (
            <p className="dim">Loading recent matches…</p>
          ) : matches.length === 0 ? (
            <p className="dim">No recent matches found.</p>
          ) : (
            <div className="matches">
              {matches.map((m, i) => (
                <div className={`match ${m.won ? "win" : "loss"}`} key={i}>
                  <span className="match-res">{m.won ? "W" : "L"}</span>
                  <span className="match-info">
                    <span className="match-agent">{m.agent}</span>
                    <span className="match-meta dim">{m.map} · {modeLabel(m.mode)}</span>
                  </span>
                  <span className="match-score dim">{m.rounds_won}-{m.rounds_lost}</span>
                  <span className="match-kda">
                    {m.kills}/{m.deaths}/{m.assists}
                  </span>
                </div>
              ))}
            </div>
          )}

          {hasLoadouts && (
            <>
              <p className="label" style={{ marginTop: 14 }}>LOADOUT</p>
              {skinsErr ? (
                <p className="dim">{skinsErr}</p>
              ) : !skins ? (
                <p className="dim">Loading skins…</p>
              ) : skins.length === 0 ? (
                <p className="dim">No custom skins equipped.</p>
              ) : (
                <div className="skins">
                  {skins.map((s, i) => (
                    <div className="skin" key={i}>
                      {s.icon ? (
                        <img className="skin-img" src={s.icon} alt={s.skin} />
                      ) : (
                        <div className="skin-img placeholder" />
                      )}
                      <div className="skin-meta">
                        <span className="skin-weapon dim">{s.weapon}</span>
                        <span className="skin-name">{s.skin}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
