/**
 * crucible new <ID> --title <t> --change <slug>
 *
 * Scaffolds workorders/<ID>-<slug>/workorder.yaml in DRAFT_SPEC. Does NOT
 * create the OpenSpec change (that happens in the spec chat via /opsx:new);
 * it records the linkage. Refuses if the ID already exists (exit 2).
 */

import type { CmdContext, CmdResult } from "../lib/context.js";
import { INITIAL_STATE } from "../core/states.js";
import { PROTECTED_PATHS, validateWorkorder, type Workorder } from "../core/workorder.js";
import { createWorkorderDir, findWorkorderDir, saveWorkorder } from "../lib/workorders.js";

const ID_PATTERN = /^[A-Z][A-Z0-9]*-[0-9]+$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export async function cmdNew(
  ctx: CmdContext,
  id: string,
  opts: { title: string; change: string },
): Promise<CmdResult> {
  if (!ID_PATTERN.test(id)) {
    return {
      exitCode: 1,
      data: { error: `invalid work-order ID '${id}' (expected e.g. OMS-142)` },
      lines: [`error: invalid work-order ID '${id}' (expected e.g. OMS-142)`],
    };
  }
  if (!SLUG_PATTERN.test(opts.change)) {
    return {
      exitCode: 1,
      data: { error: `invalid change slug '${opts.change}' (kebab-case required)` },
      lines: [`error: invalid change slug '${opts.change}' (kebab-case required)`],
    };
  }
  if (findWorkorderDir(ctx.cwd, id)) {
    return {
      exitCode: 2,
      data: { error: `work order ${id} already exists` },
      lines: [`error: work order ${id} already exists — IDs are permanent, pick the next one`],
    };
  }

  const wo: Workorder = {
    id,
    title: opts.title,
    state: INITIAL_STATE,
    change: `openspec/changes/${opts.change}/`,
    oracles: [],
    modules_allowed: [],
    paths_forbidden: [...PROTECTED_PATHS],
    max_diff_lines: 400,
    max_iterations: 6,
    pr_sequence: [],
    escalation: null,
    history: [{ state: INITIAL_STATE, at: ctx.now(), by: ctx.user() }],
  };

  // Never write a manifest the validator would reject.
  const check = validateWorkorder(wo);
  if (!check.ok) {
    return {
      exitCode: 3,
      data: { error: "internal: scaffold failed validation", details: check.errors },
      lines: ["internal error: scaffold failed validation", ...check.errors],
    };
  }

  const dir = createWorkorderDir(ctx.cwd, id, opts.change);
  saveWorkorder(dir, wo);
  return {
    exitCode: 0,
    data: { id, dir, state: wo.state },
    lines: [
      `created ${dir}/workorder.yaml (state: ${wo.state})`,
      `next: draft the spec — /opsx:new ${opts.change} in your assistant chat`,
    ],
  };
}
