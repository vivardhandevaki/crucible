import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api, type Health } from "./lib/api";
import { useGlobalNav } from "./lib/keys";
import { useTheme } from "./lib/theme";
import { WorkflowProvider, useWorkflowScope } from "./lib/workflow";
import { PhaseRail, ThemeToggle } from "./components";
import { Board } from "./screens/Board";
import { NewFeature } from "./screens/NewFeature";
import { OracleReview } from "./screens/OracleReview";
import { RunMonitor } from "./screens/RunMonitor";
import { ReviewQueue } from "./screens/ReviewQueue";

export function App(): ReactNode {
  useGlobalNav();
  const [theme, toggleTheme] = useTheme();
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => { api.health().then(setHealth).catch(() => setHealth(null)); }, []);

  const repoName = health?.repo ? health.repo.split("/").pop() ?? null : null;
  const project = health?.githubSlug ?? repoName;

  return (
    <WorkflowProvider>
      <div className="app">
        <header className="topbar">
          <span className="brand">
            <span className="mark" />
            crucible<span className="sub">/console</span>
          </span>
          <nav className="nav">
            <NavLink to="/" end>Board</NavLink>
            <NavLink to="/new">New Feature</NavLink>
            <NavLink to="/queue">Review Queue</NavLink>
          </nav>
          <span className="spacer" />
          <div className="chips">
            {health ? (
              <>
                <span className={`chip ${health.github ? "on" : "off"}`}>
                  <span className="led" />gh {health.githubAuth === "gh-cli" ? "cli" : health.github ? "env" : "off"}
                </span>
                <span className={`chip ${health.claude ? "on" : "off"}`}>
                  <span className="led" />claude {health.claudeMode === "host" ? "host" : health.claude ? "token" : "off"}
                </span>
              </>
            ) : <span className="chip"><span className="led" />connecting…</span>}
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <WorkflowBar project={project} repoPath={health?.repo ?? null} hasRemote={!!health?.githubSlug} />

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
    </WorkflowProvider>
  );
}

/** The persistent breadcrumb + phase rail: Project › Feature › Stage. */
function WorkflowBar({ project, repoPath, hasRemote }: { project: string | null; repoPath: string | null; hasRemote: boolean }): ReactNode {
  const scope = useWorkflowScope();
  const tip = project
    ? `Console is bound to this repository${repoPath ? ` (${repoPath})` : ""}.\nOne Console instance = one project. Restart with CRUCIBLE_REPO set to another path to switch.`
    : "No project bound. Start the Console from a Crucible repo, or set CRUCIBLE_REPO.";
  return (
    <div className="workflowbar">
      <div className="crumbs">
        <span className="project-chip" title={tip}>
          <span className="label">PROJECT</span>
          <span className="repo-glyph" aria-hidden>▤</span>
          <span className="name">{project ?? "no project"}</span>
          {project && !hasRemote && <span className="tag-local">local</span>}
        </span>
        <span className="crumb-sep">›</span>
        {scope.feature ? (
          <span className="crumb">
            <span className="id">{scope.feature.id}</span>
            {scope.feature.title && <span className="title">{scope.feature.title}</span>}
          </span>
        ) : (
          <span className="crumb">{scope.section || "—"}</span>
        )}
        {scope.feature && scope.section && (
          <>
            <span className="crumb-sep">›</span>
            <span className="crumb">{scope.section}</span>
          </>
        )}
      </div>
      {(scope.stage || scope.feature) && <PhaseRail state={scope.stage} />}
    </div>
  );
}
