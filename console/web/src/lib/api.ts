/** Typed client for the Console server. Every screen reads through here. */

export const GATE_CONTEXTS = [
  "gauntlet / legitimacy",
  "gauntlet / traceability",
  "gauntlet / diff-size",
  "java / build",
  "java / style",
  "java / archunit",
  "java / tests",
  "java / mutation",
  "java / sast",
  "review / reviewer-verdict",
  "java / deps",
] as const;

export type Check = "pass" | "fail" | "pending";

export interface PrSummary {
  number: number; state: string; title: string; url: string; headRef: string;
  labels: string[]; checks: Record<string, Check>; merged: boolean;
}
export interface BoardCard {
  id: string; title: string; state: string; change: string; slug: string;
  ageDays: number; escalated: boolean; pr: PrSummary | null;
}
export interface WorkorderDetail extends BoardCard {
  workorder: {
    id: string; title: string; state: string; change: string;
    oracles: string[]; modules_allowed: string[]; max_diff_lines: number; max_iterations: number;
    history: Array<{ state: string; at: string; by: string }>;
    escalation: null | { file: string; created_at: string };
  };
  escalation: string | null; runlog: string[]; invalidReason?: string;
}
export interface ChangeArtifacts {
  slug: string; proposal: string | null; design: string | null; oracles: string | null; tasks: string | null;
  specDeltas: Array<{ path: string; content: string }>;
}
export interface TraceRow {
  reqId: string; reqText: string; ids: string[]; type: string; implPath: string; status: string;
  implExists: boolean; implSource: string | null;
}
export interface Traceability {
  slug: string; rows: TraceRow[];
  requirements: Array<{ name: string; file: string; covered: boolean }>; unmapped: string[];
}
export interface Health {
  ok: boolean; repo: string; github: boolean; githubSlug: string | null;
  githubAuth: "env" | "gh-cli" | "none"; claude: boolean; claudeMode: "token" | "host" | "off";
}
export interface CliResult { ok: boolean; exitCode: number; data: unknown; stdout: string; stderr: string; command: string; }

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}
const post = <T>(url: string, body?: unknown): Promise<T> =>
  j<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

export const api = {
  health: () => j<Health>("/api/health"),
  board: () => j<{ workorders: BoardCard[]; github: boolean }>("/api/workorders"),
  workorder: (id: string) => j<WorkorderDetail>(`/api/workorders/${id}`),
  change: (slug: string) => j<ChangeArtifacts>(`/api/changes/${slug}`),
  traceability: (slug: string) => j<Traceability>(`/api/traceability/${slug}`),
  reviewQueue: () => j<{ queue: PrSummary[]; github: boolean; hint?: string }>("/api/review-queue"),
  review: (pr: number) => j<{ pr: PrSummary; diff: string | null; body: string; verdict: string | null }>(`/api/review/${pr}`),

  newWorkorder: (b: { id: string; title: string; change: string }) => post<CliResult>("/api/workorders", b),
  validate: (id: string, b: { advance?: boolean; to?: string } = {}) => post<CliResult>(`/api/workorders/${id}/validate`, b),
  packageWo: (id: string) => post<CliResult>(`/api/workorders/${id}/package`),
  run: (id: string) => post<{ started: boolean; command: string; pid?: number; error?: string }>(`/api/workorders/${id}/run`),
  approveSpec: (slug: string, specMarkdown?: string) => post<{ number: number; url: string; command: string }>(`/api/approve/spec/${slug}`, { specMarkdown }),
  approveOracles: (slug: string) => post<{ number: number; url: string; command: string }>(`/api/approve/oracles/${slug}`),
  reviewDecision: (pr: number, decision: "approve" | "request-changes", body: string) =>
    post<{ ok: boolean; command: string }>(`/api/review/${pr}/${decision}`, { body }),
};

/** SSE over POST (spec-chat) — EventSource is GET-only, so parse the stream. */
export async function streamPost(
  url: string, body: unknown,
  on: { chunk?: (t: string) => void; done?: () => void; error?: (m: string) => void },
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      const ev = /event: (.*)/.exec(p)?.[1];
      const data = /data: (.*)/.exec(p)?.[1];
      if (!ev || !data) continue;
      const payload = JSON.parse(data);
      if (ev === "chunk") on.chunk?.(payload.text);
      else if (ev === "done") on.done?.();
      else if (ev === "error") on.error?.(payload.message);
    }
  }
  on.done?.();
}
