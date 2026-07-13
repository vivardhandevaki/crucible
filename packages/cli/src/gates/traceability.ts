/**
 * The `traceability` gate — "a requirement without an oracle is a wish",
 * enforced mechanically (plan §3.1.8):
 *   a. every normative requirement block (SHALL/MUST) in the change's spec
 *      deltas has ≥1 covering row in oracles.md;
 *   b. every row's Implementation Path exists on HEAD for status ≥ IMPLEMENTED
 *      and on the main ref for APPROVED (human-audit rows are exempt);
 *   c. oracle IDs in workorder.yaml ⊆ IDs in oracles.md.
 * Violations fail with a table of unmapped requirements / dangling IDs.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { CmdContext, CmdResult } from "../lib/context.js";
import type { Check } from "../commands/validate.js";
import { parseOracleRows, parseRequirements, rowCovers, type Requirement } from "../core/oracles.js";
import { loadWorkorder } from "../lib/workorders.js";
import { extractWorkOrderId, renderChecks } from "./common.js";

function specDeltaFiles(changeDir: string): string[] {
  const specsDir = join(changeDir, "specs");
  if (!existsSync(specsDir)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name.endsWith(".md")) out.push(join(d, e.name));
    }
  };
  walk(specsDir);
  return out;
}

export async function gateTraceability(
  ctx: CmdContext,
  opts: { id?: string; prBody?: string; mainRef: string },
): Promise<CmdResult> {
  const id = opts.id ?? (opts.prBody ? extractWorkOrderId(opts.prBody) : null);
  if (!id) {
    return { exitCode: 1, data: { error: "no work-order ID" }, lines: ["gate traceability: RED — no work-order ID (use --id or --pr-body-file)"] };
  }
  const loaded = loadWorkorder(ctx.cwd, id);
  if (!loaded || !loaded.result.ok) {
    return { exitCode: 1, data: { error: `work order ${id} not found or invalid` }, lines: [`gate traceability: RED — work order ${id} not found or invalid`] };
  }
  const wo = loaded.result.workorder;
  const changeDir = join(ctx.cwd, wo.change);
  const checks: Check[] = [];

  // Parse inputs.
  const oraclesMd = join(changeDir, "oracles.md");
  if (!existsSync(oraclesMd)) {
    return { exitCode: 1, data: { error: "oracles.md missing" }, lines: [`gate traceability: RED — ${wo.change}oracles.md does not exist`] };
  }
  const rows = parseOracleRows(readFileSync(oraclesMd, "utf8"));
  const requirements: Requirement[] = specDeltaFiles(changeDir).flatMap((f) =>
    parseRequirements(f.slice(ctx.cwd.length + 1), readFileSync(f, "utf8")),
  );
  const normative = requirements.filter((r) => r.normative);
  checks.push({
    name: "inputs parsed",
    ok: rows.length > 0 && normative.length > 0,
    detail: `${normative.length} normative requirement(s), ${rows.length} oracle row(s)`,
  });

  // a. Every normative requirement is covered.
  const unmapped = normative.filter((req) => !rows.some((row) => rowCovers(row, req)));
  checks.push({
    name: "every SHALL/MUST has ≥1 oracle row",
    ok: unmapped.length === 0,
    detail: unmapped.length
      ? `UNMAPPED: ${unmapped.map((r) => `"${r.name}" (${r.file})`).join("; ")}`
      : `${normative.length}/${normative.length} covered`,
  });

  // b. Implementation paths exist on the right ref.
  for (const row of rows) {
    if (row.implPath === "n/a" || row.type === "human-audit" || row.status === "DRAFT") continue;
    if (row.status === "APPROVED") {
      const r = await ctx.exec("git", ["cat-file", "-e", `${opts.mainRef}:${row.implPath}`]);
      checks.push({
        name: `APPROVED oracle on ${opts.mainRef}: ${row.ids.join(",")}`,
        ok: r.ok,
        detail: r.ok ? row.implPath : `${row.implPath} not on ${opts.mainRef} — APPROVED means merged under /oracles`,
      });
    } else {
      // IMPLEMENTED (or beyond): must exist on the PR's checkout.
      const ok = existsSync(join(ctx.cwd, row.implPath));
      checks.push({
        name: `IMPLEMENTED oracle on PR ref: ${row.ids.join(",")}`,
        ok,
        detail: ok ? row.implPath : `${row.implPath} missing from this branch`,
      });
    }
  }

  // c. Work-order oracle IDs ⊆ oracles.md IDs.
  const mapIds = new Set(rows.flatMap((r) => r.ids));
  const dangling = wo.oracles.filter((i) => !mapIds.has(i));
  checks.push({
    name: "work-order oracle IDs resolve in oracles.md",
    ok: dangling.length === 0,
    detail: dangling.length ? `DANGLING: ${dangling.join(", ")}` : `${wo.oracles.length} id(s) resolve`,
  });

  const { ok, lines } = renderChecks("traceability", checks);
  return { exitCode: ok ? 0 : 1, data: { id, checks, unmapped: unmapped.map((u) => u.name), dangling }, lines };
}
