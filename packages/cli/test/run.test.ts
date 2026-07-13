import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CmdContext, ExecResult } from "../src/lib/context.js";
import { cmdRun } from "../src/commands/run.js";
import { parseWorkorder, serializeWorkorder, type Workorder } from "../src/core/workorder.js";

let cwd: string;
let agent: "escalate" | "commit" | "nothing";
let execLog: string[];

function ctx(): CmdContext {
  return {
    cwd,
    now: () => "2026-07-13T14:00:00.000Z",
    user: () => "tester",
    exec: async (cmd: string, args: string[]): Promise<ExecResult> => {
      execLog.push(`${cmd} ${args.join(" ")}`);
      if (cmd === "docker" && args[0] === "--version") return { ok: true, stdout: "Docker", stderr: "" };
      if (cmd === "git" && args[0] === "clone") {
        mkdirSync(args[args.length - 1]!, { recursive: true });
        return { ok: true, stdout: "", stderr: "" };
      }
      if (cmd === "git" && args.includes("rev-parse")) return { ok: true, stdout: "basesha\n", stderr: "" };
      if (cmd === "docker" && args[0] === "run") {
        // Simulate the agent: workspace is the -v mount source before ":/workspace".
        const ws = args.find((a) => a.endsWith(":/workspace"))!.split(":")[0]!;
        if (agent === "escalate") {
          mkdirSync(join(ws, "workorders/OMS-1-demo"), { recursive: true });
          writeFileSync(join(ws, "workorders/OMS-1-demo/escalation.md"), "# Escalation — OMS-1\n- Blocking: REQ-D-1\n");
        }
        return { ok: true, stdout: '{"type":"result"}\n', stderr: "" };
      }
      if (cmd === "git" && args.includes("rev-list")) {
        return { ok: true, stdout: agent === "commit" ? "2\n" : "0\n", stderr: "" };
      }
      if (cmd === "git" && args.includes("push")) return { ok: true, stdout: "", stderr: "" };
      if (cmd === "gh" && args[0] === "pr") return { ok: true, stdout: "https://github.com/x/y/pull/9\n", stderr: "" };
      return { ok: false, stdout: "", stderr: `unexpected: ${cmd} ${args.join(" ")}` };
    },
  };
}

function workorder(state: Workorder["state"] = "PACKAGED"): Workorder {
  const t = (n: number) => `2026-07-13T0${n}:00:00Z`;
  const history: Workorder["history"] = [
    { state: "DRAFT_SPEC", at: t(1), by: "o" }, { state: "SPEC_APPROVED", at: t(2), by: "o" },
    { state: "ORACLES_AUTHORED", at: t(3), by: "o" }, { state: "ORACLES_APPROVED", at: t(4), by: "o" },
  ];
  if (state !== "ORACLES_APPROVED") history.push({ state: "PACKAGED", at: t(5), by: "cli" });
  return {
    id: "OMS-1", title: "Demo", state, change: "openspec/changes/demo/",
    oracles: ["ORA-D-1a"], modules_allowed: ["src/demo"],
    paths_forbidden: ["oracles/", "openspec/specs/", "openspec/schemas/", "ci/", ".github/", "settings/", "CLAUDE.md"],
    max_diff_lines: 400, max_iterations: 6, pr_sequence: [], escalation: null, history,
  };
}

function setup(state: Workorder["state"] = "PACKAGED", opts: { bundle?: boolean; key?: boolean } = {}): void {
  const woDir = join(cwd, "workorders/OMS-1-demo");
  mkdirSync(woDir, { recursive: true });
  writeFileSync(join(woDir, "workorder.yaml"), serializeWorkorder(workorder(state)));
  writeFileSync(join(cwd, "crucible.yaml"), "toolchain_image: ghcr.io/x/crucible-toolchain:0.1.0\n");
  if (opts.bundle !== false) {
    mkdirSync(join(woDir, "bundle"), { recursive: true });
    writeFileSync(join(woDir, "bundle/bundle.yaml"), "workorder: OMS-1\n");
  }
  if (opts.key !== false) writeFileSync(join(cwd, ".env"), "ANTHROPIC_API_KEY=sk-test-123\n");
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "crucible-run-"));
  agent = "nothing";
  execLog = [];
  delete process.env["ANTHROPIC_API_KEY"];
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

const woFile = () => parseWorkorder(readFileSync(join(cwd, "workorders/OMS-1-demo/workorder.yaml"), "utf8"));

describe("crucible run preconditions", () => {
  it("exit 2 when state is not runnable", async () => {
    setup("ORACLES_APPROVED");
    expect((await cmdRun(ctx(), "OMS-1")).exitCode).toBe(2);
  });
  it("exit 2 without a bundle; exit 3 without an API key", async () => {
    setup("PACKAGED", { bundle: false });
    expect((await cmdRun(ctx(), "OMS-1")).exitCode).toBe(2);
    setup("PACKAGED", { key: false });
    rmSync(join(cwd, ".env"));
    expect((await cmdRun(ctx(), "OMS-1")).exitCode).toBe(3);
  });
});

describe("crucible run outcomes", () => {
  it("escalation: copies escalation.md, sets ESCALATED, exit 0", async () => {
    setup(); agent = "escalate";
    const r = await cmdRun(ctx(), "OMS-1");
    expect(r.exitCode).toBe(0);
    expect((r.data as { outcome: string }).outcome).toBe("escalated");
    expect(existsSync(join(cwd, "workorders/OMS-1-demo/escalation.md"))).toBe(true);
    const wo = woFile();
    expect(wo.ok && wo.workorder.state).toBe("ESCALATED");
    expect(wo.ok && wo.workorder.escalation?.file).toBe("escalation.md");
  });

  it("commits: runner pushes branch + opens PR, sets PR_OPEN", async () => {
    setup(); agent = "commit";
    const r = await cmdRun(ctx(), "OMS-1");
    expect(r.exitCode).toBe(0);
    expect((r.data as { outcome: string }).outcome).toBe("pr-open");
    expect(execLog.some((l) => l.startsWith("gh pr create") && l.includes("Work-Order-ID: OMS-1") && l.includes("wo:OMS-1"))).toBe(true);
    expect(woFile().ok && (woFile() as { workorder: Workorder }).workorder.state).toBe("PR_OPEN");
  });

  it("no progress: state stays IMPLEMENTING, exit 2, transcript archived", async () => {
    setup(); agent = "nothing";
    const r = await cmdRun(ctx(), "OMS-1");
    expect(r.exitCode).toBe(2);
    expect(woFile().ok && (woFile() as { workorder: Workorder }).workorder.state).toBe("IMPLEMENTING");
    expect(readFileSync(join(cwd, "workorders/OMS-1-demo/runlog/attempt-1/transcript.jsonl"), "utf8")).toContain("result");
  });

  it("renders prompt + settings with substitutions; bundle mounted ro; attempts increment", async () => {
    setup(); agent = "nothing";
    await cmdRun(ctx(), "OMS-1");
    const runlog = join(cwd, "workorders/OMS-1-demo/runlog/attempt-1");
    const prompt = readFileSync(join(runlog, "prompt.md"), "utf8");
    expect(prompt).toContain("work order **OMS-1**");
    expect(prompt).toContain("src/demo");
    expect(prompt).not.toContain("{{");
    const settings = readFileSync(join(runlog, "settings.json"), "utf8");
    expect(settings).toContain("workorders/OMS-1-demo/escalation.md");
    expect(settings).not.toContain("_comment");
    const dockerRun = execLog.find((l) => l.startsWith("docker run"))!;
    expect(dockerRun).toContain("/bundle:ro");
    expect(dockerRun).toContain("--max-turns 150"); // 6 iterations × 25

    await cmdRun(ctx(), "OMS-1"); // second attempt (state now IMPLEMENTING)
    expect(existsSync(join(cwd, "workorders/OMS-1-demo/runlog/attempt-2"))).toBe(true);
  });
});
