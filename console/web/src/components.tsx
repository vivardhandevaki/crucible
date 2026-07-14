import type { ReactNode } from "react";
import { GATE_CONTEXTS, type Check, type PrSummary } from "./lib/api";

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

export function EmptyState({ title, hint, cmd }: { title: string; hint?: string; cmd?: string }): ReactNode {
  return (
    <div className="empty">
      <div style={{ fontSize: 15, marginBottom: 8 }}>{title}</div>
      {hint && <div style={{ marginBottom: 8 }}>{hint}</div>}
      {cmd && <div>Next: <code>{cmd}</code></div>}
    </div>
  );
}

const HAPPY_PATH = [
  "DRAFT_SPEC", "SPEC_APPROVED", "ORACLES_AUTHORED", "ORACLES_APPROVED",
  "PACKAGED", "IMPLEMENTING", "PR_OPEN", "GATES_GREEN", "AI_REVIEWED", "MERGED", "DONE",
];

export function Stepper({ state }: { state: string }): ReactNode {
  if (state === "ESCALATED") {
    return <div className="stepper"><span className="step current">ESCALATED</span></div>;
  }
  const idx = HAPPY_PATH.indexOf(state);
  return (
    <div className="stepper">
      {HAPPY_PATH.map((s, i) => (
        <span key={s} className={`step ${i < idx ? "done" : ""} ${i === idx ? "current" : ""}`}>{s}</span>
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
