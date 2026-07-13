/**
 * crucible validate <ID> [--advance] [--to <state>]
 *
 * Runs the precondition chain for the work order's NEXT transition and prints
 * a report. With --advance, records the transition if every check passes.
 * Convenience layer only (D-02): CI re-checks everything; this never enforces.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { CmdContext, CmdResult } from "../lib/context.js";
import { isState, legalNextStates, gatekeeperOf, type State } from "../core/states.js";
import type { Workorder } from "../core/workorder.js";
import { loadWorkorder, saveWorkorder } from "../lib/workorders.js";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

/** Transitions the CLI may record on --advance; all others belong to machinery. */
const CLI_ADVANCEABLE: ReadonlyArray<readonly [State, State]> = [
  ["DRAFT_SPEC", "SPEC_APPROVED"],
  ["SPEC_APPROVED", "ORACLES_AUTHORED"],
  ["ORACLES_AUTHORED", "ORACLES_APPROVED"],
  ["ESCALATED", "SPEC_APPROVED"],
  ["ESCALATED", "ORACLES_APPROVED"],
  ["ESCALATED", "PACKAGED"],
];

// Oracle-map parsing lives in core (shared with package + traceability gate).
import { parseOracleRows } from "../core/oracles.js";
export { parseOracleRows };

function listSpecDeltas(changeDir: string): string[] {
  const specsDir = join(changeDir, "specs");
  if (!existsSync(specsDir)) return [];
  const out: string[] = [];
  for (const cap of readdirSync(specsDir, { withFileTypes: true })) {
    if (!cap.isDirectory()) continue;
    for (const f of readdirSync(join(specsDir, cap.name))) {
      if (f.endsWith(".md")) out.push(join(specsDir, cap.name, f));
    }
  }
  return out;
}

async function checksFor(
  ctx: CmdContext,
  wo: Workorder,
  to: State,
): Promise<Check[]> {
  const changeDir = join(ctx.cwd, wo.change);
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  if (to === "SPEC_APPROVED") {
    add("change folder exists", existsSync(changeDir), wo.change);
    const deltas = listSpecDeltas(changeDir);
    add("spec deltas present", deltas.length > 0, `${deltas.length} file(s)`);
    const normative = deltas.some((f) => /\b(SHALL|MUST)\b/.test(readFileSync(f, "utf8")));
    add("≥1 normative SHALL/MUST", normative, normative ? "found" : "no SHALL/MUST in any delta");
  } else if (to === "ORACLES_AUTHORED") {
    const oraclesMd = join(changeDir, "oracles.md");
    add("oracles.md exists", existsSync(oraclesMd), oraclesMd);
    if (existsSync(oraclesMd)) {
      const rows = parseOracleRows(readFileSync(oraclesMd, "utf8"));
      add("traceability table has rows", rows.length > 0, `${rows.length} row(s)`);
    }
  } else if (to === "ORACLES_APPROVED") {
    add("work order lists oracle IDs", wo.oracles.length > 0, `${wo.oracles.length} id(s)`);
    const oraclesMd = join(changeDir, "oracles.md");
    if (!existsSync(oraclesMd)) {
      add("oracles.md exists", false, oraclesMd);
    } else {
      const rows = parseOracleRows(readFileSync(oraclesMd, "utf8"));
      const mapped = new Set(rows.flatMap((r) => r.ids));
      const unmapped = wo.oracles.filter((id) => !mapped.has(id));
      add("every work-order oracle ID is in oracles.md", unmapped.length === 0,
        unmapped.length ? `missing: ${unmapped.join(", ")}` : "all mapped");
      // The Crucible-approved condition: implementations merged on the default
      // branch (git check, NOT filesystem — plan §2 acceptance criterion 3).
      for (const row of rows.filter((r) => r.ids.some((i) => wo.oracles.includes(i)))) {
        if (row.implPath === "n/a") continue;
        const r = await ctx.exec("git", ["cat-file", "-e", `main:${row.implPath}`]);
        add(`oracle merged on main: ${row.ids.join(",")}`, r.ok,
          r.ok ? row.implPath : `${row.implPath} not on main — approval = merge under /oracles`);
      }
    }
  } else if (to === "PACKAGED") {
    add("module map non-empty", wo.modules_allowed.length > 0,
      wo.modules_allowed.join(", ") || "modules_allowed is empty");
    add("tasks.md exists", existsSync(join(changeDir, "tasks.md")),
      "OpenSpec tasks artifact (blocked until oracles exist by the oracle-driven schema)");
  } else {
    add("cli-advanceable", false,
      `transition to ${to} is owned by: ${gatekeeperOf(wo.state, to) ?? "unknown"} — not the CLI`);
  }
  return checks;
}

export async function cmdValidate(
  ctx: CmdContext,
  id: string,
  opts: { advance?: boolean; to?: string },
): Promise<CmdResult> {
  const loaded = loadWorkorder(ctx.cwd, id);
  if (!loaded) {
    return { exitCode: 2, data: { error: `work order ${id} not found` }, lines: [`error: work order ${id} not found`] };
  }
  if (!loaded.result.ok) {
    return {
      exitCode: 1,
      data: { error: "workorder.yaml invalid", details: loaded.result.errors },
      lines: [`workorder.yaml invalid:`, ...loaded.result.errors.map((e) => `  - ${e}`)],
    };
  }
  const wo = loaded.result.workorder;

  // Resolve the target transition.
  const nexts = legalNextStates(wo.state);
  let to: State;
  if (opts.to !== undefined) {
    if (!isState(opts.to) || !nexts.includes(opts.to)) {
      return {
        exitCode: 2,
        data: { error: `illegal target ${opts.to}`, legal: nexts },
        lines: [`error: ${wo.state} -> ${opts.to} is not a legal edge (legal: ${nexts.join(", ")})`],
      };
    }
    to = opts.to;
  } else {
    const cliNexts = nexts.filter((n) => CLI_ADVANCEABLE.some(([f, t]) => f === wo.state && t === n));
    to = (cliNexts.length === 1 ? cliNexts[0] : nexts[0]) as State;
    if (nexts.length > 1 && cliNexts.length !== 1) {
      return {
        exitCode: 2,
        data: { error: "ambiguous next state", legal: nexts },
        lines: [`error: multiple legal next states from ${wo.state}: ${nexts.join(", ")} — use --to`],
      };
    }
  }

  const checks = await checksFor(ctx, wo, to);
  const allOk = checks.every((c) => c.ok);
  const cliOwned = CLI_ADVANCEABLE.some(([f, t]) => f === wo.state && t === to);
  const lines = [
    `work order ${wo.id}: ${wo.state} -> ${to}  (gatekeeper: ${gatekeeperOf(wo.state, to)})`,
    ...checks.map((c) => `  [${c.ok ? "ok" : "FAIL"}] ${c.name}: ${c.detail}`),
  ];

  let advanced = false;
  if (allOk && opts.advance) {
    if (!cliOwned) {
      lines.push(`not advanced: ${wo.state} -> ${to} is recorded by machinery, not the CLI`);
    } else {
      wo.history.push({ state: to, at: ctx.now(), by: ctx.user() });
      wo.state = to;
      if (wo.state !== "ESCALATED") wo.escalation = null;
      saveWorkorder(loaded.dir, wo);
      advanced = true;
      lines.push(`advanced: state is now ${to}`);
    }
  }

  return {
    exitCode: allOk ? 0 : 2,
    data: { id: wo.id, from: wo.state, to, checks, advanced },
    lines,
  };
}
