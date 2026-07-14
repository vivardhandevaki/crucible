/**
 * The crucible CLI shell-out — the ONLY way the Console mutates work-order
 * state. Every state transition the Console triggers is exactly the command a
 * human would type; the UI shows that command alongside the button.
 */

import { spawn } from "node:child_process";
import type { Config } from "../config.js";

export interface CliResult {
  ok: boolean;
  exitCode: number;
  data: unknown;
  stdout: string;
  stderr: string;
  /** The terminal-equivalent command, for the UI's ⌘ popover. */
  command: string;
}

export function crucibleCommand(args: string[]): string {
  return `crucible ${args.join(" ")}`;
}

export function runCli(cfg: Config, args: string[]): Promise<CliResult> {
  const full = [...cfg.crucibleBin.slice(1), ...args, "--json"];
  return new Promise((resolvePromise) => {
    const child = spawn(cfg.crucibleBin[0]!, full, { cwd: cfg.repoPath });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      let data: unknown = null;
      try {
        data = JSON.parse(stdout.trim().split("\n").filter((l) => l.trim().startsWith("{") || l.trim().startsWith("[")).at(-1) ?? "null");
      } catch {
        /* non-JSON output — surface raw */
      }
      resolvePromise({
        ok: code === 0,
        exitCode: code ?? 1,
        data,
        stdout,
        stderr,
        command: crucibleCommand(args),
      });
    });
    child.on("error", (err) => {
      resolvePromise({ ok: false, exitCode: 127, data: null, stdout, stderr: String(err), command: crucibleCommand(args) });
    });
  });
}
