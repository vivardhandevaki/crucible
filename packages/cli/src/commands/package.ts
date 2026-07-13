/**
 * crucible package <ID>
 *
 * Precondition: state ORACLES_APPROVED. Assembles the implementation context
 * bundle the sandbox runner mounts read-only (spec deltas, oracle map, oracle
 * implementation paths, module map, constraints), then records PACKAGED.
 * The bundle is derived state — regenerable, self-gitignored, never reviewed.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CmdContext, CmdResult } from "../lib/context.js";
import { loadWorkorder, saveWorkorder } from "../lib/workorders.js";
import { parseOracleRows } from "./validate.js";

export async function cmdPackage(ctx: CmdContext, id: string): Promise<CmdResult> {
  const loaded = loadWorkorder(ctx.cwd, id);
  if (!loaded) {
    return { exitCode: 2, data: { error: `work order ${id} not found` }, lines: [`error: work order ${id} not found`] };
  }
  if (!loaded.result.ok) {
    return { exitCode: 1, data: { error: "workorder.yaml invalid", details: loaded.result.errors }, lines: ["workorder.yaml invalid:", ...loaded.result.errors] };
  }
  const wo = loaded.result.workorder;
  if (wo.state !== "ORACLES_APPROVED") {
    return {
      exitCode: 2,
      data: { error: `state is ${wo.state}, packaging requires ORACLES_APPROVED` },
      lines: [`error: state is ${wo.state} — packaging requires ORACLES_APPROVED (run: crucible validate ${id})`],
    };
  }
  const changeDir = join(ctx.cwd, wo.change);
  const oraclesMd = join(changeDir, "oracles.md");
  const failures: string[] = [];
  if (wo.modules_allowed.length === 0) failures.push("modules_allowed is empty — set the module map first");
  if (!existsSync(join(changeDir, "tasks.md"))) failures.push(`${wo.change}tasks.md missing — finish planning artifacts (/opsx:continue)`);
  if (!existsSync(oraclesMd)) failures.push(`${wo.change}oracles.md missing`);
  if (failures.length > 0) {
    return { exitCode: 2, data: { failures }, lines: failures.map((f) => `error: ${f}`) };
  }

  // Assemble the bundle (fresh each time — derived state).
  const bundle = join(loaded.dir, "bundle");
  rmSync(bundle, { recursive: true, force: true });
  mkdirSync(bundle, { recursive: true });
  writeFileSync(join(bundle, ".gitignore"), "*\n"); // self-ignoring: bundles are never committed
  for (const artifact of ["proposal.md", "design.md", "oracles.md", "tasks.md"]) {
    const src = join(changeDir, artifact);
    if (existsSync(src)) cpSync(src, join(bundle, artifact));
  }
  cpSync(join(changeDir, "specs"), join(bundle, "specs"), { recursive: true });

  const oracleRows = parseOracleRows(readFileSync(oraclesMd, "utf8"));
  const implPaths = oracleRows
    .filter((r) => r.ids.some((i) => wo.oracles.includes(i)) && r.implPath !== "n/a")
    .map((r) => r.implPath);
  writeFileSync(
    join(bundle, "bundle.yaml"),
    [
      `workorder: ${wo.id}`,
      `change: ${wo.change}`,
      `modules_allowed: [${wo.modules_allowed.join(", ")}]`,
      `paths_forbidden: [${wo.paths_forbidden.join(", ")}]`,
      `max_diff_lines: ${wo.max_diff_lines}`,
      `max_iterations: ${wo.max_iterations}`,
      `oracle_ids: [${wo.oracles.join(", ")}]`,
      `oracle_implementations: [${implPaths.join(", ")}]`,
      `packaged_at: "${ctx.now()}"`,
      "",
    ].join("\n"),
  );

  wo.history.push({ state: "PACKAGED", at: ctx.now(), by: ctx.user() });
  wo.state = "PACKAGED";
  saveWorkorder(loaded.dir, wo);

  return {
    exitCode: 0,
    data: { id: wo.id, bundle, oracle_implementations: implPaths },
    lines: [
      `packaged ${wo.id} -> ${bundle}`,
      `  oracle implementations: ${implPaths.length}`,
      `  state: PACKAGED — next: crucible run ${wo.id} (Phase 4)`,
    ],
  };
}
