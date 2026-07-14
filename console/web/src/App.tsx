import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api, type Health } from "./lib/api";
import { useGlobalNav } from "./lib/keys";
import { Board } from "./screens/Board";
import { NewFeature } from "./screens/NewFeature";
import { OracleReview } from "./screens/OracleReview";
import { RunMonitor } from "./screens/RunMonitor";
import { ReviewQueue } from "./screens/ReviewQueue";

export function App() {
  useGlobalNav();
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => { api.health().then(setHealth).catch(() => setHealth(null)); }, []);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">crucible<span className="dot">.</span>console</span>
        <nav className="nav">
          <NavLink to="/" end>Board</NavLink>
          <NavLink to="/new">New Feature</NavLink>
          <NavLink to="/queue">Review Queue</NavLink>
        </nav>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          {health ? <>{health.githubSlug ?? "no remote"} · gh {health.github ? "✓" : "✗"} · claude {health.claude ? "✓" : "✗"}</> : "connecting…"}
        </span>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Board />} />
          <Route path="/new" element={<NewFeature />} />
          <Route path="/wo/:id/oracles" element={<OracleReview />} />
          <Route path="/wo/:id/run" element={<RunMonitor />} />
          <Route path="/queue" element={<ReviewQueue />} />
        </Routes>
      </main>
    </div>
  );
}
