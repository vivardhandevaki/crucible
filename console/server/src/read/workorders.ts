/**
 * Read workorders from the git worktree and merge in live GitHub PR/check
 * status. The workorder.yaml files are the authoritative state; GitHub adds
 * the PR view. Parsing uses the shared core — one implementation of the truth.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseWorkorder, type Workorder } from "@crucible/cli/core";
import type { Config } from "../config.js";
import type { GitHub, PrSummary } from "../lib/github.js";

export interface BoardCard {
  id: string;
  title: string;
  state: Workorder["state"];
  change: string;
  slug: string;
  ageDays: number;
  escalated: boolean;
  pr: PrSummary | null;
}

export interface WorkorderDetail extends BoardCard {
  workorder: Workorder;
  escalation: string | null;
  runlog: string[];
  invalidReason?: string;
}

function workorderDirs(cfg: Config): Array<{ dir: string; slug: string }> {
  const root = join(cfg.repoPath, "workorders");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, e.name, "workorder.yaml")))
    .map((e) => ({ dir: join(root, e.name), slug: e.name }));
}

function ageDays(dir: string): number {
  try {
    return Math.floor((Date.now() - statSync(join(dir, "workorder.yaml")).mtimeMs) / 86_400_000);
  } catch {
    return 0;
  }
}

/** slug for a change path like "openspec/changes/greeting/" -> "greeting". */
export function changeSlug(change: string): string {
  return change.replace(/\/+$/, "").split("/").pop() ?? change;
}

export async function readBoard(cfg: Config, gh: GitHub): Promise<BoardCard[]> {
  const prs = await gh.prsByHeadRef();
  const cards: BoardCard[] = [];
  for (const { dir, slug } of workorderDirs(cfg)) {
    const parsed = parseWorkorder(readFileSync(join(dir, "workorder.yaml"), "utf8"));
    if (!parsed.ok) continue;
    const wo = parsed.workorder;
    cards.push({
      id: wo.id,
      title: wo.title,
      state: wo.state,
      change: wo.change,
      slug,
      ageDays: ageDays(dir),
      escalated: existsSync(join(dir, "escalation.md")),
      pr: prs.get(`wo/${wo.id}`) ?? null,
    });
  }
  return cards.sort((a, b) => a.id.localeCompare(b.id));
}

export function findDir(cfg: Config, id: string): { dir: string; slug: string } | null {
  return workorderDirs(cfg).find((d) => {
    const parsed = parseWorkorder(readFileSync(join(d.dir, "workorder.yaml"), "utf8"));
    return parsed.ok && parsed.workorder.id === id;
  }) ?? null;
}

export async function readDetail(cfg: Config, gh: GitHub, id: string): Promise<WorkorderDetail | null> {
  const found = findDir(cfg, id);
  if (!found) return null;
  const parsed = parseWorkorder(readFileSync(join(found.dir, "workorder.yaml"), "utf8"));
  if (!parsed.ok) {
    return {
      id, title: id, state: "DRAFT_SPEC", change: "", slug: found.slug, ageDays: ageDays(found.dir),
      escalated: false, pr: null, workorder: {} as Workorder, escalation: null, runlog: [],
      invalidReason: parsed.errors.join("; "),
    };
  }
  const wo = parsed.workorder;
  const escPath = join(found.dir, "escalation.md");
  const runlogDir = join(found.dir, "runlog");
  const runlog = existsSync(runlogDir)
    ? readdirSync(runlogDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
    : [];
  const prs = await gh.prsByHeadRef();
  return {
    id: wo.id, title: wo.title, state: wo.state, change: wo.change, slug: found.slug,
    ageDays: ageDays(found.dir), escalated: existsSync(escPath), pr: prs.get(`wo/${wo.id}`) ?? null,
    workorder: wo,
    escalation: existsSync(escPath) ? readFileSync(escPath, "utf8") : null,
    runlog,
  };
}
