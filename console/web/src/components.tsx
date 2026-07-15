import type { ReactNode } from "react";
import { GATE_CONTEXTS, type Check, type PrSummary } from "./lib/api";
import { PHASES, phaseOf } from "./lib/workflow";

/** The 11-gate check-dot row (Board cards + PR views). */
export function CheckDots({ pr }: { pr: PrSummary | null }): ReactNode {
  if (!pr) return <span className="muted" style={{ fontSize: 11 }}>no PR</span>;
  return (
    <span className="dots" title={pr.merged ? "merged" : pr.state}>
      {GATE_CONTEXTS.map((c) => {
        const s: Check | undefined = pr.checks[c];
        return <span key={c} className={`dot ${s ?? "pending"}`} title={`${c}: ${s ?? "—"}`} />;
      })}
    </span>
  );
}

/** The ⌘ terminal-equivalent popover — keeps the fallback path documented. */
export function Cmd({ cmd }: { cmd: string }): ReactNode {
  return (
    <span className="cmd">
      <span className="glyph" aria-label="terminal equivalent">⌘</span>
      <span className="pop">$ {cmd}</span>
    </span>
  );
}

/** A labelled section with a trailing divider rule — the workflow's visual grouping. */
export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <section className="section anim-in">
      <div className="section-head">
        <span className="section-title">{title}</span>
        {aside && <span className="section-aside">{aside}</span>}
        <span className="section-rule" />
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, hint, cmd, icon = "◇" }: { title: string; hint?: string; cmd?: string; icon?: string }): ReactNode {
  return (
    <div className="empty anim-in">
      <div className="empty-icon">{icon}</div>
      <div style={{ fontSize: 15, marginBottom: 6, color: "var(--text)" }}>{title}</div>
      {hint && <div style={{ marginBottom: cmd ? 10 : 0 }}>{hint}</div>}
      {cmd && <div>Next: <code>{cmd}</code></div>}
    </div>
  );
}

/** Compact 5-phase rail for the workflow bar (Spec → Oracles → Build → Review → Ship). */
export function PhaseRail({ state }: { state: string | undefined }): ReactNode {
  if (state === "ESCALATED") {
    return (
      <div className="phaserail" title="Escalated — resolve via a spec/oracle fix">
        <span className="phase esc"><span className="bead" />Escalated</span>
      </div>
    );
  }
  const current = phaseOf(state);
  const curIdx = current ? PHASES.indexOf(current) : -1;
  return (
    <div className="phaserail">
      {PHASES.map((p, i) => {
        const cls = i < curIdx ? "done" : i === curIdx ? "current" : "";
        return (
          <span key={p} style={{ display: "inline-flex", alignItems: "center" }}>
            {i > 0 && <span className={`phase-link ${i <= curIdx ? "done" : ""}`} />}
            <span className={`phase ${cls}`}><span className="bead" />{p}</span>
          </span>
        );
      })}
    </div>
  );
}

const HAPPY_PATH = [
  "DRAFT_SPEC", "SPEC_APPROVED", "ORACLES_AUTHORED", "ORACLES_APPROVED",
  "PACKAGED", "IMPLEMENTING", "PR_OPEN", "GATES_GREEN", "AI_REVIEWED", "MERGED", "DONE",
];

/** Detailed per-state stepper (Run Monitor). */
export function Stepper({ state }: { state: string }): ReactNode {
  if (state === "ESCALATED") {
    return <div className="stepper"><span className="step esc">ESCALATED</span></div>;
  }
  const idx = HAPPY_PATH.indexOf(state);
  return (
    <div className="stepper">
      {HAPPY_PATH.map((s, i) => (
        <span key={s} className={`step ${i < idx ? "done" : ""} ${i === idx ? "current" : ""}`}>{s.replace(/_/g, " ")}</span>
      ))}
    </div>
  );
}

/** Render spec/markdown as plain text with SHALL/MUST lines highlighted. */
export function SpecView({ text }: { text: string }): ReactNode {
  return (
    <pre className="src">
      {text.split("\n").map((line, i) => (
        <div key={i} className={/\b(SHALL|MUST)\b/.test(line) ? "shall" : undefined}>{line || " "}</div>
      ))}
    </pre>
  );
}

export function DiffView({ diff }: { diff: string | null }): ReactNode {
  if (!diff) return <EmptyState title="No diff available" hint="GitHub token missing or PR not found." />;
  return (
    <pre className="src">
      {diff.split("\n").map((line, i) => {
        const cls = line.startsWith("+") && !line.startsWith("+++") ? "diff-add"
          : line.startsWith("-") && !line.startsWith("---") ? "diff-del" : undefined;
        return <div key={i} className={cls}>{line || " "}</div>;
      })}
    </pre>
  );
}

export function Toast({ msg, err, onClose }: { msg: string; err?: boolean; onClose: () => void }): ReactNode {
  return (
    <div className={`toast ${err ? "err" : ""}`} onClick={onClose} role="status">
      {msg}
    </div>
  );
}

/** Sun/moon theme toggle for the top bar. */
export function ThemeToggle({ theme, onToggle }: { theme: "dark" | "light"; onToggle: () => void }): ReactNode {
  return (
    <button
      className="icon-btn"
      onClick={onToggle}
      title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? "☾" : "☀"}
    </button>
  );
}
