/**
 * Shared plumbing for Gauntlet gate commands. Gates are the ENFORCEMENT layer
 * (D-02): they run in CI on every PR and must reject illegitimate PRs even if
 * the CLI was bypassed entirely. Exit 0 = gate green, 1 = gate red, 3 = env.
 */

import type { CmdContext } from "../lib/context.js";
import type { Check } from "../commands/validate.js";

/** Parse the PR template's machine-readable block. */
export function extractWorkOrderId(prBody: string): string | null {
  const m = prBody.match(/Work-Order-ID:\s*([A-Z][A-Z0-9]*-[0-9]+)/);
  return m?.[1] ?? null;
}

/** Changed paths between the merge base and HEAD. */
export async function changedPaths(ctx: CmdContext, base: string): Promise<string[] | null> {
  const r = await ctx.exec("git", ["diff", "--name-only", `${base}...HEAD`]);
  if (!r.ok) return null;
  return r.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
}

/** Added+deleted line counts per file between merge base and HEAD. */
export async function changedLineCounts(
  ctx: CmdContext,
  base: string,
): Promise<Array<{ path: string; lines: number }> | null> {
  const r = await ctx.exec("git", ["diff", "--numstat", `${base}...HEAD`]);
  if (!r.ok) return null;
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [adds, dels, ...rest] = line.split("\t");
      // Binary files report "-"; count them as 0 lines (they trip other gates).
      const a = adds === "-" ? 0 : Number(adds);
      const d = dels === "-" ? 0 : Number(dels);
      return { path: rest.join("\t"), lines: a + d };
    });
}

/** File content at a ref, or null when it does not exist there. */
export async function fileAtRef(ctx: CmdContext, ref: string, path: string): Promise<string | null> {
  const r = await ctx.exec("git", ["show", `${ref}:${path}`]);
  return r.ok ? r.stdout : null;
}

/** Prefix match against a path list ("dir/" entries match the subtree; files exactly). */
export function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
}

export function renderChecks(name: string, checks: Check[]): { ok: boolean; lines: string[] } {
  const ok = checks.every((c) => c.ok);
  return {
    ok,
    lines: [
      `gate ${name}: ${ok ? "GREEN" : "RED"}`,
      ...checks.map((c) => `  [${c.ok ? "ok" : "FAIL"}] ${c.name}: ${c.detail}`),
    ],
  };
}
