import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type Overview = {
  riot_id: string;
  game_name: string;
  tag_line: string;
  region: string;
  tier: number;
  tier_name: string;
  rr: number;
};

const POLL_MS = 60_000;

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

export default function App() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const o = await invoke<Overview>("get_overview");
      setData(o);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll while visible; stop entirely when minimized/hidden so the app
  // costs nothing during a match.
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
    return () => {
      window.clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const offline = error !== null && /isn't running|lockfile/i.test(error);

  return (
    <main className="shell">
      <header className="topbar">
        <span className="wordmark">
          VALO<span className="wordmark-accent">LFG</span>
        </span>
        <span className="topbar-label">TRACKER</span>
      </header>

      {loading ? (
        <section className="panel center">
          <p className="dim">Scanning local Riot client…</p>
        </section>
      ) : error ? (
        <section className="panel center">
          <p className="status-title">{offline ? "RIOT CLIENT OFFLINE" : "LINK ERROR"}</p>
          <p className="dim">
            {offline
              ? "Launch the Riot client / VALORANT and I'll pick it up."
              : error}
          </p>
          <button className="btn" onClick={() => { setLoading(true); refresh(); }}>
            Retry
          </button>
        </section>
      ) : data ? (
        <>
          <section className="panel">
            <p className="label">SIGNED IN AS</p>
            <p className="riot-id">
              {data.game_name}
              <span className="tag">#{data.tag_line}</span>
            </p>
            <p className="dim">Region · {data.region}</p>
          </section>

          <section className="panel rank" style={{ ["--tier" as string]: tierColor(data.tier) }}>
            <p className="label">COMPETITIVE</p>
            <p className="tier-name">{data.tier_name}</p>
            {data.tier > 0 && data.tier < 27 && (
              <div className="rr">
                <div className="rr-track">
                  <div className="rr-fill" style={{ width: `${Math.min(data.rr, 100)}%` }} />
                </div>
                <span className="rr-num">{data.rr} RR</span>
              </div>
            )}
            {data.tier === 0 && (
              <p className="dim">No ranked matches this act yet.</p>
            )}
          </section>

          <footer className="footbar">
            <span className="pulse" />
            <span className="dim">LIVE · refreshes every 60s</span>
            <button className="btn ghost" onClick={refresh}>Refresh</button>
          </footer>
        </>
      ) : null}
    </main>
  );
}
