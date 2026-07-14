/**
 * Approval flows — the second (and only other) writer besides the CLI. An
 * approval opens a PR to a protected path on the owner's behalf; it never writes
 * to the repo directly. CODEOWNERS + branch protection still gate the merge.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config.js";
import type { GitHub } from "../lib/github.js";
import { readTraceability } from "../read/artifacts.js";

function collectFiles(root: string, rel: string, into: Array<{ path: string; content: string }>): void {
  const abs = join(root, rel);
  if (!existsSync(abs)) return;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const childRel = `${rel}/${e.name}`;
    if (e.isDirectory()) collectFiles(root, childRel, into);
    else into.push({ path: childRel, content: readFileSync(join(root, childRel), "utf8") });
  }
}

/**
 * Approve the spec: PR the change's OpenSpec artifacts. If `specMarkdown` is
 * supplied (drafted in the New Feature screen and not yet on disk), it is
 * committed as the change's spec delta directly — the Console never writes it to
 * the worktree first (stateless doctrine).
 */
export async function approveSpec(
  cfg: Config, gh: GitHub, slug: string, opts: { specMarkdown?: string } = {},
): Promise<{ number: number; url: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const changeRel = `openspec/changes/${slug}`;
  if (opts.specMarkdown && opts.specMarkdown.trim()) {
    files.push({ path: `${changeRel}/specs/${slug}/spec.md`, content: opts.specMarkdown });
  } else {
    collectFiles(cfg.repoPath, `${changeRel}/specs`, files);
  }
  for (const name of ["proposal.md", "design.md", "oracles.md", "tasks.md"]) {
    if (existsSync(join(cfg.repoPath, changeRel, name))) {
      files.push({ path: `${changeRel}/${name}`, content: readFileSync(join(cfg.repoPath, changeRel, name), "utf8") });
    }
  }
  if (files.length === 0) throw new Error(`no spec content for ${changeRel} (draft a spec or add spec deltas)`);
  return gh.createCommitPr({
    branch: `spec/${slug}`,
    title: `Approve spec: ${slug}`,
    body: `## Crucible\n- Spec approval for change \`${slug}\` (opened via the Console).\n\nMerging records the spec as approved on the default branch.`,
    message: `spec(${slug}): approve spec delta`,
    files,
  });
}

/** Approve the oracles: PR oracles.md + every referenced oracle implementation. */
export async function approveOracles(cfg: Config, gh: GitHub, slug: string): Promise<{ number: number; url: string }> {
  const trace = readTraceability(cfg, slug);
  if (!trace) throw new Error(`no oracles.md for change '${slug}'`);
  const files: Array<{ path: string; content: string }> = [];
  const oraclesMd = `openspec/changes/${slug}/oracles.md`;
  files.push({ path: oraclesMd, content: readFileSync(join(cfg.repoPath, oraclesMd), "utf8") });
  const seen = new Set<string>();
  for (const row of trace.rows) {
    if (row.implPath === "n/a" || seen.has(row.implPath)) continue;
    seen.add(row.implPath);
    const abs = join(cfg.repoPath, row.implPath);
    if (existsSync(abs)) files.push({ path: row.implPath, content: readFileSync(abs, "utf8") });
  }
  return gh.createCommitPr({
    branch: `oracles/${slug}`,
    title: `Approve oracles: ${slug}`,
    body: `## Crucible\n- Oracle approval for change \`${slug}\` (opened via the Console).\n\nMerging records the oracles as APPROVED under \`/oracles\` on the default branch.`,
    message: `oracles(${slug}): approve oracle implementations`,
    files,
  });
}
