/**
 * Command context — everything a command needs from the environment, injected
 * so tests can stub the clock, the user, and external processes (git, openspec).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export interface CmdContext {
  /** Consumer-repo root (where workorders/, openspec/, oracles/ live). */
  cwd: string;
  now: () => string;
  user: () => string;
  /** Run an external tool; never throws — failures come back as ok: false. */
  exec: (cmd: string, args: string[]) => Promise<ExecResult>;
}

export function defaultContext(cwd: string): CmdContext {
  return {
    cwd,
    now: () => new Date().toISOString(),
    user: () => process.env["USER"] ?? process.env["USERNAME"] ?? "unknown",
    exec: async (cmd, args) => {
      try {
        const { stdout, stderr } = await execFileAsync(cmd, args, { cwd });
        return { ok: true, stdout, stderr };
      } catch (e) {
        const err = e as { stdout?: string; stderr?: string; message: string };
        return { ok: false, stdout: err.stdout ?? "", stderr: err.stderr ?? err.message };
      }
    },
  };
}

/** Uniform command outcome: exit code + payload for --json or human rendering. */
export interface CmdResult<T = unknown> {
  /** 0 ok · 1 validation failure · 2 precondition failure · 3 environment failure */
  exitCode: 0 | 1 | 2 | 3;
  data: T;
  /** Human-readable lines (ignored in --json mode). */
  lines: string[];
}
