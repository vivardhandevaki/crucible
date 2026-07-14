/**
 * Trigger and observe a sandbox run. The run is spawned DETACHED and unref'd,
 * so killing the Console never aborts it (plan §5.4). The Console only observes
 * the runlog the runner writes; it is not in the run's process tree.
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config.js";
import { crucibleCommand } from "./cli.js";
import { findDir } from "../read/workorders.js";

export interface StartResult {
  started: boolean;
  command: string;
  pid?: number;
  error?: string;
}

/** Spawn `crucible run <id>` fully detached from the Console process. */
export function startRun(cfg: Config, id: string): StartResult {
  const args = ["run", id];
  const command = crucibleCommand(args);
  try {
    const child = spawn(cfg.crucibleBin[0]!, [...cfg.crucibleBin.slice(1), ...args], {
      cwd: cfg.repoPath,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return { started: true, command, pid: child.pid };
  } catch (err) {
    return { started: false, command, error: String(err) };
  }
}

function latestAttemptDir(cfg: Config, id: string): string | null {
  const found = findDir(cfg, id);
  if (!found) return null;
  const runlog = join(found.dir, "runlog");
  if (!existsSync(runlog)) return null;
  const attempts = readdirSync(runlog, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("attempt-"))
    .map((e) => e.name)
    .sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));
  const last = attempts.at(-1);
  return last ? join(runlog, last) : null;
}

export interface RunSnapshot {
  attempt: string | null;
  transcriptLines: string[];
  finished: boolean;
  meta: string | null;
}

/** Read the current state of the latest run attempt (for SSE polling). */
export function runSnapshot(cfg: Config, id: string, fromLine = 0): RunSnapshot {
  const dir = latestAttemptDir(cfg, id);
  if (!dir) return { attempt: null, transcriptLines: [], finished: false, meta: null };
  const transcriptPath = join(dir, "transcript.jsonl");
  const metaPath = join(dir, "meta.yaml");
  const lines = existsSync(transcriptPath)
    ? readFileSync(transcriptPath, "utf8").split("\n").filter(Boolean)
    : [];
  const meta = existsSync(metaPath) ? readFileSync(metaPath, "utf8") : null;
  return {
    attempt: dir.split("/").at(-1) ?? null,
    transcriptLines: lines.slice(fromLine),
    finished: meta !== null && /finished:/.test(meta),
    meta,
  };
}
