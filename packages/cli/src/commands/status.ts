/**
 * crucible status [<ID>] — table of work orders: state, age, escalation.
 * The terminal fallback for the Console board. (PR/check summary via the
 * GitHub API attaches in Phase 4 when PRs start existing.)
 */

import type { CmdContext, CmdResult } from "../lib/context.js";
import { legalNextStates } from "../core/states.js";
import { loadWorkorder, scanWorkorders } from "../lib/workorders.js";

function ageOf(nowIso: string, sinceIso: string): string {
  const ms = Date.parse(nowIso) - Date.parse(sinceIso);
  const days = Math.floor(ms / 86_400_000);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(ms / 3_600_000);
  return hours > 0 ? `${hours}h` : "<1h";
}

export async function cmdStatus(ctx: CmdContext, id?: string): Promise<CmdResult> {
  if (id !== undefined) {
    const loaded = loadWorkorder(ctx.cwd, id);
    if (!loaded) {
      return { exitCode: 2, data: { error: `work order ${id} not found` }, lines: [`error: work order ${id} not found`] };
    }
    if (!loaded.result.ok) {
      return {
        exitCode: 1,
        data: { id, errors: loaded.result.errors },
        lines: [`${id}: INVALID`, ...loaded.result.errors.map((e) => `  - ${e}`)],
      };
    }
    const wo = loaded.result.workorder;
    return {
      exitCode: 0,
      data: { workorder: wo, legalNext: legalNextStates(wo.state) },
      lines: [
        `${wo.id}  ${wo.state}  "${wo.title}"`,
        `  change: ${wo.change}`,
        `  oracles: ${wo.oracles.join(", ") || "(none yet)"}`,
        `  legal next: ${legalNextStates(wo.state).join(", ") || "(terminal)"}`,
        ...(wo.escalation ? [`  ESCALATED: see ${wo.escalation.file}`] : []),
        `  history: ${wo.history.map((h) => h.state).join(" -> ")}`,
      ],
    };
  }

  const all = scanWorkorders(ctx.cwd);
  const now = ctx.now();
  const rows = all.map(({ dirName, result }) => {
    if (!result.ok) return { id: dirName, state: "INVALID", title: result.errors[0] ?? "", age: "", escalated: false };
    const wo = result.workorder;
    const last = wo.history[wo.history.length - 1];
    return {
      id: wo.id,
      state: wo.state,
      title: wo.title,
      age: last ? ageOf(now, last.at) : "",
      escalated: wo.escalation != null,
    };
  });
  const invalid = rows.filter((r) => r.state === "INVALID").length;
  return {
    exitCode: invalid > 0 ? 1 : 0,
    data: { workorders: rows },
    lines:
      rows.length === 0
        ? ["no work orders — start one with: crucible new <ID> --title <t> --change <slug>"]
        : rows.map((r) =>
            `${r.id.padEnd(12)} ${r.state.padEnd(18)} ${r.age.padEnd(5)} ${r.escalated ? "⚠ ESCALATED " : ""}${r.title}`,
          ),
  };
}
