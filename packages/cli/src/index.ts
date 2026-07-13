#!/usr/bin/env node
/**
 * The `crucible` CLI. Convenience layer over the state machine — it advances
 * state, it never enforces it (D-02: enforcement lives in CI + platform).
 *
 * Exit codes: 0 ok · 1 validation failure · 2 precondition failure · 3 environment failure.
 * Every command supports --json.
 */

import { Command } from "commander";
import { defaultContext, type CmdResult } from "./lib/context.js";
import { cmdNew } from "./commands/new.js";
import { cmdValidate } from "./commands/validate.js";
import { cmdStatus } from "./commands/status.js";
import { cmdEscalations } from "./commands/escalations.js";

const program = new Command();

function emit(result: CmdResult, json: boolean): never {
  if (json) {
    console.log(JSON.stringify({ ok: result.exitCode === 0, ...((result.data as object) ?? {}) }, null, 2));
  } else {
    for (const line of result.lines) console.log(line);
  }
  process.exit(result.exitCode);
}

async function run(fn: () => Promise<CmdResult>, json: boolean): Promise<never> {
  try {
    emit(await fn(), json);
  } catch (e) {
    emit(
      { exitCode: 3, data: { error: (e as Error).message }, lines: [`environment error: ${(e as Error).message}`] },
      json,
    );
  }
}

program
  .name("crucible")
  .description("Crucible — AI-driven development inside a container of enforcement")
  .version("0.1.0");

program
  .command("new <id>")
  .description("scaffold a work order (DRAFT_SPEC); records the OpenSpec change linkage")
  .requiredOption("--title <title>", "work-order title")
  .requiredOption("--change <slug>", "OpenSpec change slug (kebab-case)")
  .option("--json", "machine-readable output", false)
  .action((id: string, o: { title: string; change: string; json: boolean }) =>
    run(() => cmdNew(defaultContext(process.cwd()), id, o), o.json));

program
  .command("validate <id>")
  .description("run the precondition chain for the next transition; --advance records it")
  .option("--advance", "record the transition if all checks pass", false)
  .option("--to <state>", "target state when multiple edges are legal (e.g. from ESCALATED)")
  .option("--json", "machine-readable output", false)
  .action((id: string, o: { advance: boolean; to?: string; json: boolean }) =>
    run(() => cmdValidate(defaultContext(process.cwd()), id, o), o.json));

program
  .command("status [id]")
  .description("work-order table (all) or detail (one) — the terminal fallback for the board")
  .option("--json", "machine-readable output", false)
  .action((id: string | undefined, o: { json: boolean }) =>
    run(() => cmdStatus(defaultContext(process.cwd()), id), o.json));

program
  .command("escalations")
  .description("list open escalations with their structured content")
  .option("--json", "machine-readable output", false)
  .action((o: { json: boolean }) =>
    run(() => cmdEscalations(defaultContext(process.cwd())), o.json));

program.parseAsync(process.argv);
