/**
 * The `diff-size` gate: changed lines (adds+deletes, excluding lockfiles and
 * generated paths) must be ≤ the work order's max_diff_lines. Small diffs make
 * every other gate more discriminating (Core Principle 9).
 *
 * Extra exclusions come from the consumer's ci/gates.yml (`diff_exclude:` list).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { CmdContext, CmdResult } from "../lib/context.js";
import { loadWorkorder } from "../lib/workorders.js";
import { changedLineCounts, extractWorkOrderId } from "./common.js";

const DEFAULT_EXCLUDES = ["package-lock.json", "*.lock", "dist/", "build/", "bundle/", ".gitkeep"];

function isExcluded(path: string, excludes: readonly string[]): boolean {
  const basename = path.split("/").pop() ?? path;
  return excludes.some((e) => {
    if (e.endsWith("/")) return path.startsWith(e) || path.includes(`/${e}`);
    if (e.startsWith("*.")) return basename.endsWith(e.slice(1));
    return basename === e;
  });
}

function consumerExcludes(cwd: string): string[] {
  const gatesFile = join(cwd, "ci", "gates.yml");
  if (!existsSync(gatesFile)) return [];
  try {
    const parsed = parseYaml(readFileSync(gatesFile, "utf8")) as { diff_exclude?: unknown };
    return Array.isArray(parsed?.diff_exclude) ? parsed.diff_exclude.map(String) : [];
  } catch {
    return [];
  }
}

export async function gateDiffSize(
  ctx: CmdContext,
  opts: { base: string; id?: string; prBody?: string },
): Promise<CmdResult> {
  const id = opts.id ?? (opts.prBody ? extractWorkOrderId(opts.prBody) : null);
  if (!id) {
    return { exitCode: 1, data: { error: "no work-order ID" }, lines: ["gate diff-size: RED — no work-order ID (use --id or a PR body with Work-Order-ID)"] };
  }
  const loaded = loadWorkorder(ctx.cwd, id);
  if (!loaded || !loaded.result.ok) {
    return { exitCode: 1, data: { error: `work order ${id} not found or invalid` }, lines: [`gate diff-size: RED — work order ${id} not found or invalid`] };
  }
  const cap = loaded.result.workorder.max_diff_lines;

  const counts = await changedLineCounts(ctx, opts.base);
  if (counts === null) {
    return { exitCode: 3, data: { error: "git diff failed" }, lines: [`environment error: cannot diff against ${opts.base}`] };
  }
  const excludes = [...DEFAULT_EXCLUDES, ...consumerExcludes(ctx.cwd)];
  const counted = counts.filter((c) => !isExcluded(c.path, excludes));
  const total = counted.reduce((sum, c) => sum + c.lines, 0);
  const excluded = counts.length - counted.length;
  const ok = total <= cap;

  return {
    exitCode: ok ? 0 : 1,
    data: { id, total, cap, excludedFiles: excluded },
    lines: [
      `gate diff-size: ${ok ? "GREEN" : "RED"} — ${total}/${cap} changed lines (${counted.length} file(s), ${excluded} excluded)`,
      ...(ok ? [] : [
        `  over cap by ${total - cap} lines — decompose into a PR sequence (workorder pr_sequence) instead of one large diff`,
        ...counted.sort((a, b) => b.lines - a.lines).slice(0, 5).map((c) => `  ${String(c.lines).padStart(6)}  ${c.path}`),
      ]),
    ],
  };
}
