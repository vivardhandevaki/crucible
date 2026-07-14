/**
 * Read OpenSpec change artifacts and compute the traceability view. Reuses the
 * exact core parsers the traceability gate uses, so the Console shows what CI
 * will enforce — not a second interpretation.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseOracleRows, parseRequirements, rowCovers, type OracleRow } from "@crucible/cli/core";
import type { Config } from "../config.js";

export interface ChangeArtifacts {
  slug: string;
  proposal: string | null;
  design: string | null;
  oracles: string | null;
  tasks: string | null;
  specDeltas: Array<{ path: string; content: string }>;
}

export interface TraceRow extends OracleRow {
  implExists: boolean;
  implSource: string | null;
}

export interface Traceability {
  slug: string;
  rows: TraceRow[];
  requirements: Array<{ name: string; file: string; covered: boolean }>;
  unmapped: string[];
}

function changeDir(cfg: Config, slug: string): string {
  return join(cfg.repoPath, "openspec", "changes", slug);
}

function read(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function specDeltaFiles(dir: string): string[] {
  const specsDir = join(dir, "specs");
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

export function readChange(cfg: Config, slug: string): ChangeArtifacts | null {
  const dir = changeDir(cfg, slug);
  if (!existsSync(dir)) return null;
  return {
    slug,
    proposal: read(join(dir, "proposal.md")),
    design: read(join(dir, "design.md")),
    oracles: read(join(dir, "oracles.md")),
    tasks: read(join(dir, "tasks.md")),
    specDeltas: specDeltaFiles(dir).map((f) => ({ path: f.slice(cfg.repoPath.length + 1), content: readFileSync(f, "utf8") })),
  };
}

export function readTraceability(cfg: Config, slug: string): Traceability | null {
  const dir = changeDir(cfg, slug);
  const oraclesMd = join(dir, "oracles.md");
  if (!existsSync(oraclesMd)) return null;
  const rows = parseOracleRows(readFileSync(oraclesMd, "utf8"));
  const requirements = specDeltaFiles(dir).flatMap((f) =>
    parseRequirements(f.slice(cfg.repoPath.length + 1), readFileSync(f, "utf8")),
  );
  const normative = requirements.filter((r) => r.normative);

  const traceRows: TraceRow[] = rows.map((row) => {
    const implPath = row.implPath === "n/a" ? null : join(cfg.repoPath, row.implPath);
    return {
      ...row,
      implExists: implPath ? existsSync(implPath) : true,
      implSource: implPath && existsSync(implPath) ? readFileSync(implPath, "utf8") : null,
    };
  });

  const reqView = normative.map((req) => ({
    name: req.name,
    file: req.file,
    covered: rows.some((row) => rowCovers(row, req)),
  }));

  return {
    slug,
    rows: traceRows,
    requirements: reqView,
    unmapped: reqView.filter((r) => !r.covered).map((r) => r.name),
  };
}
