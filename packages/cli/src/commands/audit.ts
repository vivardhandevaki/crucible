/**
 * crucible audit --sample 0.1 — statistical process control on the auto-merge
 * stream: a DETERMINISTIC sample of auto-merged PRs for human review.
 *
 * Determinism without state: a PR is sampled iff (number % round(1/sample)) == 0
 * — same command, same answer, no seed file, auditable by anyone.
 */

import type { CmdContext, CmdResult } from "../lib/context.js";

interface MergedPr {
  number: number;
  title: string;
  mergedAt: string;
  labels: Array<{ name: string }>;
}

export async function cmdAudit(
  ctx: CmdContext,
  opts: { sample: number; sinceDays: number },
): Promise<CmdResult> {
  if (opts.sample <= 0 || opts.sample > 1) {
    return { exitCode: 1, data: { error: "sample must be in (0,1]" }, lines: ["error: --sample must be in (0,1]"] };
  }
  const r = await ctx.exec("gh", [
    "pr", "list", "--state", "merged", "--label", "crucible",
    "--json", "number,title,mergedAt,labels", "--limit", "200",
  ]);
  if (!r.ok) {
    return { exitCode: 3, data: { error: "gh unavailable" }, lines: [`environment error: gh pr list failed: ${r.stderr.trim()}`] };
  }
  const cutoff = Date.now() - opts.sinceDays * 86_400_000;
  const autoMerged = (JSON.parse(r.stdout || "[]") as MergedPr[]).filter(
    (pr) =>
      Date.parse(pr.mergedAt) >= cutoff &&
      pr.labels.some((l) => l.name === "auto-merge") &&
      !pr.labels.some((l) => l.name.startsWith("risk:")),
  );
  const k = Math.max(1, Math.round(1 / opts.sample));
  const sampled = autoMerged.filter((pr) => pr.number % k === 0);

  return {
    exitCode: 0,
    data: { window_days: opts.sinceDays, auto_merged: autoMerged.length, sampled: sampled.map((p) => p.number), k },
    lines:
      autoMerged.length === 0
        ? [`no auto-merged crucible PRs in the last ${opts.sinceDays} day(s)`]
        : [
            `auto-merged in window: ${autoMerged.length}; sampled (every ${k}th by PR number): ${sampled.length}`,
            ...sampled.map((p) => `  #${p.number}  ${p.mergedAt.slice(0, 10)}  ${p.title}`),
            ...(sampled.length ? ["review each sampled diff; any finding is a ratchet PR (new oracle/rubric line/rule)"] : []),
          ],
  };
}
