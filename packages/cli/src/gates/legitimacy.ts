/**
 * The `legitimacy` gate — what makes bypassing the CLI hit a wall:
 *   a. PR body carries a valid Work-Order-ID; the work order exists, is valid,
 *      and is in a state where an open PR is legal.
 *   b. Every touched path is inside modules_allowed ∪ workorders/<dir>/ and
 *      outside paths_forbidden.
 *   c. workorder.yaml history is append-only relative to the merge base.
 *
 * Exception: PRs labeled `harness-change` skip (a) and (b) — they touch
 * protected paths, so CODEOWNERS review is required by construction — but (c)
 * still applies to any touched work-order manifest.
 */

import { relative, join } from "node:path";
import type { CmdContext, CmdResult } from "../lib/context.js";
import type { Check } from "../commands/validate.js";
import { parseWorkorder, isHistoryAppendOnly, type Workorder } from "../core/workorder.js";
import { loadWorkorder, findWorkorderDir } from "../lib/workorders.js";
import { changedPaths, extractWorkOrderId, fileAtRef, matchesAny, renderChecks } from "./common.js";

const PR_LEGAL_STATES = new Set([
  "IMPLEMENTING", "PR_OPEN", "GATES_GREEN", "AI_REVIEWED", "ROUTED_AUTO", "ROUTED_HUMAN",
]);

async function historyCheck(ctx: CmdContext, base: string, woPath: string, current: Workorder): Promise<Check> {
  const baseText = await fileAtRef(ctx, base, woPath);
  if (baseText === null) {
    return { name: "history append-only", ok: true, detail: "work order is new at merge base" };
  }
  const baseParsed = parseWorkorder(baseText);
  if (!baseParsed.ok) {
    return { name: "history append-only", ok: true, detail: "merge-base manifest invalid; current validated instead" };
  }
  const ok = isHistoryAppendOnly(baseParsed.workorder.history, current.history);
  return {
    name: "history append-only",
    ok,
    detail: ok ? "history extends the merge base" : "history was rewritten or truncated relative to the merge base",
  };
}

export async function gateLegitimacy(
  ctx: CmdContext,
  opts: { base: string; prBody: string; labels: string[] },
): Promise<CmdResult> {
  const checks: Check[] = [];
  const touched = await changedPaths(ctx, opts.base);
  if (touched === null) {
    return { exitCode: 3, data: { error: "git diff failed" }, lines: [`environment error: cannot diff against ${opts.base}`] };
  }

  if (opts.labels.includes("harness-change")) {
    checks.push({
      name: "harness-change exception",
      ok: true,
      detail: "module-map/work-order checks skipped; protected paths force CODEOWNERS review by construction",
    });
    for (const p of touched.filter((t) => /^workorders\/.*\/workorder\.yaml$/.test(t))) {
      const currentText = await fileAtRef(ctx, "HEAD", p);
      const parsed = currentText ? parseWorkorder(currentText) : null;
      if (parsed?.ok) checks.push(await historyCheck(ctx, opts.base, p, parsed.workorder));
    }
    const { ok, lines } = renderChecks("legitimacy", checks);
    return { exitCode: ok ? 0 : 1, data: { checks }, lines };
  }

  // a. Work order identity + state.
  const id = extractWorkOrderId(opts.prBody);
  checks.push({
    name: "PR declares Work-Order-ID",
    ok: id !== null,
    detail: id ?? "no `Work-Order-ID: <ID>` line in the PR body — no code without a work order",
  });
  if (!id) {
    const { lines } = renderChecks("legitimacy", checks);
    return { exitCode: 1, data: { checks }, lines };
  }
  const loaded = loadWorkorder(ctx.cwd, id);
  if (!loaded || !loaded.result.ok) {
    checks.push({
      name: "work order exists and validates",
      ok: false,
      detail: loaded ? loaded.result.ok ? "" : loaded.result.errors.join("; ") : `work order ${id} not found`,
    });
    const { lines } = renderChecks("legitimacy", checks);
    return { exitCode: 1, data: { checks }, lines };
  }
  const wo = loaded.result.workorder;
  checks.push({ name: "work order exists and validates", ok: true, detail: id });
  checks.push({
    name: "state legal for an open PR",
    ok: PR_LEGAL_STATES.has(wo.state),
    detail: PR_LEGAL_STATES.has(wo.state) ? wo.state : `${wo.state} — PRs are only legal in ${[...PR_LEGAL_STATES].join(", ")}`,
  });

  // b. Scope: inside module map (+ own work-order dir), outside forbidden paths.
  const woDir = relative(ctx.cwd, findWorkorderDir(ctx.cwd, id) ?? join(ctx.cwd, "workorders", id)) + "/";
  const allowed = [...wo.modules_allowed.map((m) => (m.endsWith("/") ? m : `${m}/`)), woDir];
  const forbidden = touched.filter((p) => matchesAny(p, wo.paths_forbidden));
  checks.push({
    name: "no touched path is forbidden",
    ok: forbidden.length === 0,
    detail: forbidden.length ? `forbidden: ${forbidden.join(", ")}` : "clear",
  });
  const outside = touched.filter((p) => !matchesAny(p, allowed) && !allowed.some((a) => p.startsWith(a)));
  checks.push({
    name: "every touched path is inside the module map",
    ok: outside.length === 0,
    detail: outside.length ? `outside scope: ${outside.join(", ")} (allowed: ${allowed.join(", ")})` : `${touched.length} path(s) in scope`,
  });

  // c. Append-only history.
  checks.push(await historyCheck(ctx, opts.base, `${woDir}workorder.yaml`, wo));

  const { ok, lines } = renderChecks("legitimacy", checks);
  return { exitCode: ok ? 0 : 1, data: { id, checks }, lines };
}
