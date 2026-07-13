import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CmdContext, ExecResult } from "../src/lib/context.js";
import { cmdInit } from "../src/commands/init.js";
import { cmdPackage } from "../src/commands/package.js";
import { cmdNew } from "../src/commands/new.js";
import { parseWorkorder, serializeWorkorder } from "../src/core/workorder.js";

let cwd: string;

/** Stub exec: `openspec init` writes the minimal footprint the real CLI would. */
function ctx(): CmdContext {
  return {
    cwd,
    now: () => "2026-07-13T12:00:00.000Z",
    user: () => "tester",
    exec: async (cmd: string, args: string[]): Promise<ExecResult> => {
      if (cmd === "openspec" && args[0] === "init") {
        mkdirSync(join(cwd, "openspec", "changes"), { recursive: true });
        writeFileSync(join(cwd, "openspec", "config.yaml"), "schema: spec-driven\n");
        return { ok: true, stdout: "", stderr: "" };
      }
      if (cmd === "git" && args[0] === "cat-file") return { ok: true, stdout: "", stderr: "" };
      return { ok: false, stdout: "", stderr: `unexpected exec: ${cmd} ${args.join(" ")}` };
    },
  };
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "crucible-init-test-"));
  mkdirSync(join(cwd, ".git")); // simulate a git repo
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("crucible init", () => {
  it("initializes openspec, installs the schema, copies the scaffold with owner substitution", async () => {
    const r = await cmdInit(ctx(), { owner: "vivardhandevaki", lang: "java" });
    expect(r.exitCode).toBe(0);

    // schema installed + set as default
    expect(existsSync(join(cwd, "openspec/schemas/oracle-driven/schema.yaml"))).toBe(true);
    expect(existsSync(join(cwd, "openspec/schemas/oracle-driven/templates/oracles.md"))).toBe(true);
    expect(readFileSync(join(cwd, "openspec/config.yaml"), "utf8")).toMatch(/^schema: oracle-driven/m);

    // scaffold copied with token substitution
    const codeowners = readFileSync(join(cwd, ".github/CODEOWNERS"), "utf8");
    expect(codeowners).toContain("@vivardhandevaki");
    expect(codeowners).not.toContain("{{OWNER}}");
    expect(existsSync(join(cwd, "settings/branch-protection.json"))).toBe(true);
    expect(existsSync(join(cwd, "settings/apply.sh"))).toBe(true);
    expect(existsSync(join(cwd, ".github/pull_request_template.md"))).toBe(true);

    // CLAUDE.md with language profile substituted
    const claudeMd = readFileSync(join(cwd, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain("Language profile: **java**");
    expect(claudeMd).not.toContain("{{LANG}}");

    // skills installed under .claude/skills/
    expect(existsSync(join(cwd, ".claude/skills/crucible-writing-oracles/SKILL.md"))).toBe(true);
    expect(existsSync(join(cwd, ".claude/skills/crucible-escalation-protocol/SKILL.md"))).toBe(true);
    expect(existsSync(join(cwd, ".claude/skills/crucible-java-conventions/SKILL.md"))).toBe(true);

    // consumer dirs + manifest
    expect(existsSync(join(cwd, "oracles/properties"))).toBe(true);
    expect(existsSync(join(cwd, "workorders"))).toBe(true);
    const manifest = readFileSync(join(cwd, "crucible.yaml"), "utf8");
    expect(manifest).toContain("language: java");
    expect(manifest).toContain("crucible-toolchain");
  });

  it("never overwrites existing files (reports them as skipped)", async () => {
    mkdirSync(join(cwd, ".github"), { recursive: true });
    writeFileSync(join(cwd, ".github/CODEOWNERS"), "# mine\n");
    const r = await cmdInit(ctx(), { owner: "someone", lang: "java" });
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(cwd, ".github/CODEOWNERS"), "utf8")).toBe("# mine\n");
    expect((r.data as { skipped: string[] }).skipped).toContain(".github/CODEOWNERS");
  });

  it("exit 2 when already initialized; exit 1 for unsupported language; exit 2 outside git", async () => {
    writeFileSync(join(cwd, "crucible.yaml"), "x\n");
    expect((await cmdInit(ctx(), { owner: "o", lang: "java" })).exitCode).toBe(2);
    rmSync(join(cwd, "crucible.yaml"));
    expect((await cmdInit(ctx(), { owner: "o", lang: "cobol" })).exitCode).toBe(1);
    rmSync(join(cwd, ".git"), { recursive: true });
    expect((await cmdInit(ctx(), { owner: "o", lang: "java" })).exitCode).toBe(2);
  });
});

describe("crucible package", () => {
  async function setupApproved(): Promise<string> {
    await cmdNew(ctx(), "OMS-1", { title: "T", change: "demo" });
    const changeDir = join(cwd, "openspec/changes/demo");
    mkdirSync(join(changeDir, "specs/cap"), { recursive: true });
    writeFileSync(join(changeDir, "specs/cap/spec.md"), "The system SHALL do X.");
    writeFileSync(join(changeDir, "oracles.md"), [
      "| REQ | Requirement | Oracle ID(s) | Type | Implementation Path | Status |",
      "|---|---|---|---|---|---|",
      "| REQ-D-1 | X | ORA-D-1a | property | oracles/properties/T.java | APPROVED |",
    ].join("\n"));
    writeFileSync(join(changeDir, "tasks.md"), "- [ ] 1.1 do it\n");
    // Drive the work order to ORACLES_APPROVED directly (unit scope).
    const file = join(cwd, "workorders/OMS-1-demo/workorder.yaml");
    const wo = parseWorkorder(readFileSync(file, "utf8"));
    if (!wo.ok) throw new Error("bad scaffold");
    // Timestamps must stay ≤ the stub clock (12:00) or the appended PACKAGED
    // entry would violate the non-decreasing-history rule.
    wo.workorder.history.push(
      { state: "SPEC_APPROVED", at: "2026-07-13T12:00:00Z", by: "t" },
      { state: "ORACLES_AUTHORED", at: "2026-07-13T12:00:00Z", by: "t" },
      { state: "ORACLES_APPROVED", at: "2026-07-13T12:00:00Z", by: "t" },
    );
    wo.workorder.state = "ORACLES_APPROVED";
    wo.workorder.oracles = ["ORA-D-1a"];
    wo.workorder.modules_allowed = ["src/demo"];
    writeFileSync(file, serializeWorkorder(wo.workorder));
    return file;
  }

  it("exit 2 unless state is ORACLES_APPROVED", async () => {
    await cmdNew(ctx(), "OMS-1", { title: "T", change: "demo" });
    const r = await cmdPackage(ctx(), "OMS-1");
    expect(r.exitCode).toBe(2);
    expect(r.lines.join()).toContain("ORACLES_APPROVED");
  });

  it("assembles the bundle, records PACKAGED, and the bundle self-gitignores", async () => {
    const file = await setupApproved();
    const r = await cmdPackage(ctx(), "OMS-1");
    expect(r.exitCode).toBe(0);

    const bundle = join(cwd, "workorders/OMS-1-demo/bundle");
    expect(readFileSync(join(bundle, ".gitignore"), "utf8")).toBe("*\n");
    expect(existsSync(join(bundle, "oracles.md"))).toBe(true);
    expect(existsSync(join(bundle, "tasks.md"))).toBe(true);
    expect(existsSync(join(bundle, "specs/cap/spec.md"))).toBe(true);
    expect(readFileSync(join(bundle, "bundle.yaml"), "utf8")).toContain("oracles/properties/T.java");

    const wo = parseWorkorder(readFileSync(file, "utf8"));
    expect(wo.ok && wo.workorder.state).toBe("PACKAGED");
  });

  it("exit 2 with actionable failures when tasks.md or module map is missing", async () => {
    const file = await setupApproved();
    rmSync(join(cwd, "openspec/changes/demo/tasks.md"));
    const wo = parseWorkorder(readFileSync(file, "utf8"));
    if (wo.ok) {
      wo.workorder.modules_allowed = [];
      writeFileSync(file, serializeWorkorder(wo.workorder));
    }
    const r = await cmdPackage(ctx(), "OMS-1");
    expect(r.exitCode).toBe(2);
    expect(r.lines.join("\n")).toContain("modules_allowed");
    expect(r.lines.join("\n")).toContain("tasks.md");
  });
});
