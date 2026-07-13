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
import { cmdInit } from "./commands/init.js";
import { cmdPackage } from "./commands/package.js";
import { cmdRun } from "./commands/run.js";
import { cmdReview } from "./commands/review.js";
import { gateLegitimacy } from "./gates/legitimacy.js";
import { gateDiffSize } from "./gates/diffsize.js";
import { gateTraceability } from "./gates/traceability.js";
import { readFileSync } from "node:fs";

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
  .command("init")
  .description("turn this repo into a Crucible-governed project (openspec + oracle-driven schema + scaffold)")
  .requiredOption("--owner <handle>", "GitHub handle that owns protected paths (CODEOWNERS)")
  .option("--lang <lang>", "language profile", "java")
  .option("--json", "machine-readable output", false)
  .action((o: { owner: string; lang: string; json: boolean }) =>
    run(() => cmdInit(defaultContext(process.cwd()), o), o.json));

program
  .command("package <id>")
  .description("assemble the implementation bundle (requires ORACLES_APPROVED); records PACKAGED")
  .option("--json", "machine-readable output", false)
  .action((id: string, o: { json: boolean }) =>
    run(() => cmdPackage(defaultContext(process.cwd()), id), o.json));

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
  .command("run <id>")
  .description("run the implementer agent in a sandbox (requires PACKAGED); runner opens the PR")
  .option("--json", "machine-readable output", false)
  .action((id: string, o: { json: boolean }) =>
    run(() => cmdRun(defaultContext(process.cwd()), id), o.json));

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

program
  .command("review")
  .description("run the reviewer agent (diff+spec+rubric only; fail-closed verdict JSON)")
  .requiredOption("--base <ref>", "merge-base ref (e.g. origin/main)")
  .option("--id <id>", "work-order ID (or provide --pr-body-file)")
  .option("--pr-body-file <path>", "file containing the PR body")
  .option("--model <model>", "reviewer model", "claude-sonnet-4-6")
  .option("--out <path>", "verdict output path", "review-verdict.json")
  .option("--json", "machine-readable output", false)
  .action((o: { base: string; id?: string; prBodyFile?: string; model: string; out: string; json: boolean }) =>
    run(() => cmdReview(defaultContext(process.cwd()), {
      base: o.base, model: o.model, out: o.out,
      ...(o.id !== undefined ? { id: o.id } : {}),
      ...(o.prBodyFile !== undefined ? { prBody: readFileSync(o.prBodyFile, "utf8") } : {}),
    }), o.json));

const gate = program
  .command("gate")
  .description("Gauntlet gate checks (the enforcement layer; run by CI on every PR)");

gate
  .command("legitimacy")
  .description("work-order legitimacy: valid ID + legal state + scope + append-only history")
  .requiredOption("--base <ref>", "merge-base ref (e.g. origin/main)")
  .option("--pr-body-file <path>", "file containing the PR body")
  .option("--label <label...>", "PR labels", [])
  .option("--json", "machine-readable output", false)
  .action((o: { base: string; prBodyFile?: string; label: string[]; json: boolean }) =>
    run(() => gateLegitimacy(defaultContext(process.cwd()), {
      base: o.base,
      prBody: o.prBodyFile ? readFileSync(o.prBodyFile, "utf8") : "",
      labels: o.label,
    }), o.json));

gate
  .command("diff-size")
  .description("changed lines ≤ the work order's max_diff_lines (lockfiles/generated excluded)")
  .requiredOption("--base <ref>", "merge-base ref (e.g. origin/main)")
  .option("--id <id>", "work-order ID (or provide --pr-body-file)")
  .option("--pr-body-file <path>", "file containing the PR body")
  .option("--json", "machine-readable output", false)
  .action((o: { base: string; id?: string; prBodyFile?: string; json: boolean }) =>
    run(() => gateDiffSize(defaultContext(process.cwd()), {
      base: o.base,
      ...(o.id !== undefined ? { id: o.id } : {}),
      ...(o.prBodyFile !== undefined ? { prBody: readFileSync(o.prBodyFile, "utf8") } : {}),
    }), o.json));

gate
  .command("traceability")
  .description("every SHALL/MUST has an oracle row; oracle files exist on the right ref")
  .option("--id <id>", "work-order ID (or provide --pr-body-file)")
  .option("--pr-body-file <path>", "file containing the PR body")
  .option("--main-ref <ref>", "ref where APPROVED oracles must exist", "origin/main")
  .option("--json", "machine-readable output", false)
  .action((o: { id?: string; prBodyFile?: string; mainRef: string; json: boolean }) =>
    run(() => gateTraceability(defaultContext(process.cwd()), {
      mainRef: o.mainRef,
      ...(o.id !== undefined ? { id: o.id } : {}),
      ...(o.prBodyFile !== undefined ? { prBody: readFileSync(o.prBodyFile, "utf8") } : {}),
    }), o.json));

program.parseAsync(process.argv);
