import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CmdContext, ExecResult } from "../src/lib/context.js";
import { cmdReview, parseVerdict, type Verdict } from "../src/commands/review.js";
import { serializeWorkorder, type Workorder } from "../src/core/workorder.js";

let cwd: string;
let agentOutput: { ok: boolean; stdout: string };
let promptSeen: string;

const goodVerdict = (overall: Verdict["overall"] = "PASS"): string =>
  JSON.stringify({
    rubric_version: 1,
    items: Array.from({ length: 10 }, (_, i) => ({
      id: `R${i + 1}`,
      verdict: i === 6 && overall !== "PASS" ? overall : "PASS",
      evidence: "checked; none found",
    })),
    overall,
  });

const envelope = (result: string) => JSON.stringify({ type: "result", result });

function ctx(): CmdContext {
  return {
    cwd,
    now: () => "2026-07-13T15:00:00.000Z",
    user: () => "tester",
    exec: async (cmd: string, args: string[]): Promise<ExecResult> => {
      if (cmd === "git" && args[0] === "diff") {
        return { ok: true, stdout: "diff --git a/src/demo/a.txt b/src/demo/a.txt\n+new line\n", stderr: "" };
      }
      if (cmd === "bash") return { ok: true, stdout: "### Requirement: X\nThe system SHALL do X.\n", stderr: "" };
      if (cmd === "claude") {
        promptSeen = args[1] ?? "";
        return { ok: agentOutput.ok, stdout: agentOutput.stdout, stderr: agentOutput.ok ? "" : "agent error" };
      }
      return { ok: false, stdout: "", stderr: `unexpected: ${cmd}` };
    },
  };
}

function setup(): void {
  const t = (n: number) => `2026-07-13T0${n}:00:00Z`;
  const wo: Workorder = {
    id: "OMS-1", title: "Demo", state: "GATES_GREEN", change: "openspec/changes/demo/",
    oracles: ["ORA-D-1a"], modules_allowed: ["src/demo"],
    paths_forbidden: ["oracles/", "openspec/specs/", "openspec/schemas/", "ci/", ".github/", "settings/", "CLAUDE.md"],
    max_diff_lines: 400, max_iterations: 6, pr_sequence: [], escalation: null,
    history: [
      { state: "DRAFT_SPEC", at: t(1), by: "o" }, { state: "SPEC_APPROVED", at: t(2), by: "o" },
      { state: "ORACLES_AUTHORED", at: t(3), by: "o" }, { state: "ORACLES_APPROVED", at: t(4), by: "o" },
      { state: "PACKAGED", at: t(5), by: "cli" }, { state: "IMPLEMENTING", at: t(6), by: "runner" },
      { state: "PR_OPEN", at: t(7), by: "runner" }, { state: "GATES_GREEN", at: t(8), by: "ci" },
    ],
  };
  mkdirSync(join(cwd, "workorders/OMS-1-demo"), { recursive: true });
  writeFileSync(join(cwd, "workorders/OMS-1-demo/workorder.yaml"), serializeWorkorder(wo));
  mkdirSync(join(cwd, "openspec/changes/demo/specs/cap"), { recursive: true });
  writeFileSync(join(cwd, "openspec/changes/demo/specs/cap/spec.md"), "### Requirement: X\nThe system SHALL do X.\n");
  writeFileSync(join(cwd, "openspec/changes/demo/oracles.md"), "| REQ-D-1 | X SHALL | ORA-D-1a | property | oracles/p/T.java | APPROVED |\n");
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "crucible-review-"));
  agentOutput = { ok: true, stdout: envelope(goodVerdict()) };
  promptSeen = "";
  setup();
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

const opts = { base: "origin/main", id: "OMS-1", model: "claude-sonnet-4-6", out: "review-verdict.json" };
const verdictFile = () => JSON.parse(readFileSync(join(cwd, "review-verdict.json"), "utf8")) as Verdict;

describe("crucible review", () => {
  it("PASS verdict: exit 0, verdict file written, prompt holds diff+rubric+spec", async () => {
    const r = await cmdReview(ctx(), opts);
    expect(r.exitCode).toBe(0);
    expect(verdictFile().overall).toBe("PASS");
    expect(promptSeen).toContain("+new line");           // diff
    expect(promptSeen).toContain("R7");                  // rubric
    expect(promptSeen).toContain("The system SHALL do X"); // spec delta
    expect(promptSeen).toContain("ORA-D-1a");            // oracle map
  });

  it("FLAG verdict: exit 0 (routing sends it to the human)", async () => {
    agentOutput = { ok: true, stdout: envelope(goodVerdict("FLAG")) };
    const r = await cmdReview(ctx(), opts);
    expect(r.exitCode).toBe(0);
    expect(verdictFile().overall).toBe("FLAG");
  });

  it("FAIL verdict: exit 1 (red check)", async () => {
    agentOutput = { ok: true, stdout: envelope(goodVerdict("FAIL")) };
    expect((await cmdReview(ctx(), opts)).exitCode).toBe(1);
  });

  it("fail-closed: garbage output -> FAIL verdict written, exit 1", async () => {
    agentOutput = { ok: true, stdout: "I think this PR looks great! LGTM :)" };
    const r = await cmdReview(ctx(), opts);
    expect(r.exitCode).toBe(1);
    expect(verdictFile().overall).toBe("FAIL");
    expect(verdictFile().items[0]!.evidence).toContain("fail-closed");
  });

  it("fail-closed: schema-valid JSON with unanswered rubric items", async () => {
    const partial = JSON.stringify({
      rubric_version: 1,
      items: [{ id: "R1", verdict: "PASS", evidence: "only one answered" }],
      overall: "PASS",
    });
    agentOutput = { ok: true, stdout: envelope(partial) };
    const r = await cmdReview(ctx(), opts);
    expect(r.exitCode).toBe(1);
    expect(verdictFile().items[0]!.evidence).toContain("unanswered");
  });

  it("fail-closed: reviewer agent process failure", async () => {
    agentOutput = { ok: false, stdout: "" };
    const r = await cmdReview(ctx(), opts);
    expect(r.exitCode).toBe(1);
    expect(verdictFile().items[0]!.evidence).toContain("reviewer agent failed");
  });
});

describe("parseVerdict", () => {
  const schema = JSON.parse(
    readFileSync(join(import.meta.dirname, "../../../rubric/verdict.schema.json"), "utf8"),
  ) as object;

  it("strips markdown fences", () => {
    expect(parseVerdict("```json\n" + goodVerdict() + "\n```", schema)?.overall).toBe("PASS");
  });

  it("rejects unknown verdict values and extra fields", () => {
    expect(parseVerdict(goodVerdict().replace('"PASS"', '"MAYBE"'), schema)).toBeNull();
    const extra = JSON.parse(goodVerdict()) as Record<string, unknown>;
    extra["notes"] = "sneaky";
    expect(parseVerdict(JSON.stringify(extra), schema)).toBeNull();
  });
});
