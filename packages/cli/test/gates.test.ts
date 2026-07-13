import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultContext } from "../src/lib/context.js";
import { gateLegitimacy } from "../src/gates/legitimacy.js";
import { gateDiffSize } from "../src/gates/diffsize.js";
import { serializeWorkorder, type Workorder } from "../src/core/workorder.js";

let repo: string;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" });
}

function workorder(overrides: Partial<Workorder> = {}): Workorder {
  const t = (n: number) => `2026-07-13T0${n}:00:00Z`;
  return {
    id: "OMS-1",
    title: "Demo",
    state: "IMPLEMENTING",
    change: "openspec/changes/demo/",
    oracles: ["ORA-D-1a"],
    modules_allowed: ["src/demo"],
    paths_forbidden: ["oracles/", "openspec/specs/", "openspec/schemas/", "ci/", ".github/", "settings/", "CLAUDE.md"],
    max_diff_lines: 400,
    max_iterations: 6,
    pr_sequence: [],
    escalation: null,
    history: [
      { state: "DRAFT_SPEC", at: t(1), by: "o" },
      { state: "SPEC_APPROVED", at: t(2), by: "o" },
      { state: "ORACLES_AUTHORED", at: t(3), by: "o" },
      { state: "ORACLES_APPROVED", at: t(4), by: "o" },
      { state: "PACKAGED", at: t(5), by: "cli" },
      { state: "IMPLEMENTING", at: t(6), by: "runner" },
    ],
    ...overrides,
  };
}

const PR_BODY = "## Crucible\n- Work-Order-ID: OMS-1\n";

/** Base repo on main: valid IMPLEMENTING work order; then a feature branch. */
function setupRepo(wo: Workorder = workorder()): void {
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  mkdirSync(join(repo, "workorders", "OMS-1-demo"), { recursive: true });
  writeFileSync(join(repo, "workorders/OMS-1-demo/workorder.yaml"), serializeWorkorder(wo));
  mkdirSync(join(repo, "src/demo"), { recursive: true });
  writeFileSync(join(repo, "src/demo/a.txt"), "base\n");
  git("add", "-A");
  git("commit", "-qm", "base");
  git("checkout", "-qb", "feature");
}

function commitChange(path: string, content: string): void {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), content);
  git("add", "-A");
  git("commit", "-qm", `change ${path}`);
}

beforeEach(() => { repo = mkdtempSync(join(tmpdir(), "crucible-gate-")); });
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("gate legitimacy", () => {
  it("GREEN: in-scope change with valid work order in IMPLEMENTING", async () => {
    setupRepo();
    commitChange("src/demo/b.txt", "new\n");
    const r = await gateLegitimacy(defaultContext(repo), { base: "main", prBody: PR_BODY, labels: [] });
    expect(r.lines.join("\n")).toContain("GREEN");
    expect(r.exitCode).toBe(0);
  });

  it("RED: no Work-Order-ID in the PR body (the bypass drill)", async () => {
    setupRepo();
    commitChange("src/demo/b.txt", "new\n");
    const r = await gateLegitimacy(defaultContext(repo), { base: "main", prBody: "manual PR, no template", labels: [] });
    expect(r.exitCode).toBe(1);
    expect(r.lines.join()).toContain("no code without a work order");
  });

  it("RED: work order state not legal for an open PR", async () => {
    setupRepo(workorder({ state: "DRAFT_SPEC", history: [{ state: "DRAFT_SPEC", at: "2026-07-13T01:00:00Z", by: "o" }] }));
    commitChange("src/demo/b.txt", "new\n");
    const r = await gateLegitimacy(defaultContext(repo), { base: "main", prBody: PR_BODY, labels: [] });
    expect(r.exitCode).toBe(1);
    expect(r.lines.join()).toContain("DRAFT_SPEC");
  });

  it("RED: touched path outside the module map (scope creep)", async () => {
    setupRepo();
    commitChange("src/other/c.txt", "sneaky\n");
    const r = await gateLegitimacy(defaultContext(repo), { base: "main", prBody: PR_BODY, labels: [] });
    expect(r.exitCode).toBe(1);
    expect(r.lines.join()).toContain("src/other/c.txt");
  });

  it("RED: touched protected path (oracle tampering)", async () => {
    setupRepo();
    commitChange("oracles/properties/T.java", "weakened\n");
    const r = await gateLegitimacy(defaultContext(repo), { base: "main", prBody: PR_BODY, labels: [] });
    expect(r.exitCode).toBe(1);
    expect(r.lines.join()).toContain("forbidden: oracles/properties/T.java");
  });

  it("RED: workorder history rewritten relative to merge base", async () => {
    setupRepo();
    const tampered = workorder();
    tampered.history[0]!.by = "someone-else"; // rewrite, same length
    writeFileSync(join(repo, "workorders/OMS-1-demo/workorder.yaml"), serializeWorkorder(tampered));
    git("add", "-A");
    git("commit", "-qm", "tamper");
    const r = await gateLegitimacy(defaultContext(repo), { base: "main", prBody: PR_BODY, labels: [] });
    expect(r.exitCode).toBe(1);
    expect(r.lines.join()).toContain("rewritten");
  });

  it("GREEN: harness-change label skips scope checks (CODEOWNERS owns it)", async () => {
    setupRepo();
    commitChange("ci/gates.yml", "mutation_threshold: 80\n");
    const r = await gateLegitimacy(defaultContext(repo), { base: "main", prBody: "", labels: ["harness-change"] });
    expect(r.exitCode).toBe(0);
    expect(r.lines.join()).toContain("CODEOWNERS");
  });

  it("workorders/<own-dir>/ is always in scope (runlogs, escalation)", async () => {
    setupRepo();
    commitChange("workorders/OMS-1-demo/escalation.md", "## Blocking\n...\n");
    const r = await gateLegitimacy(defaultContext(repo), { base: "main", prBody: PR_BODY, labels: [] });
    expect(r.exitCode).toBe(0);
  });
});

describe("gate diff-size", () => {
  it("GREEN under the cap; RED over it with the largest files listed", async () => {
    setupRepo(workorder({ max_diff_lines: 10 }));
    commitChange("src/demo/small.txt", "a\nb\nc\n");
    let r = await gateDiffSize(defaultContext(repo), { base: "main", prBody: PR_BODY });
    expect(r.exitCode).toBe(0);

    commitChange("src/demo/big.txt", Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n"));
    r = await gateDiffSize(defaultContext(repo), { base: "main", prBody: PR_BODY });
    expect(r.exitCode).toBe(1);
    expect(r.lines.join("\n")).toContain("src/demo/big.txt");
    expect(r.lines.join()).toContain("pr_sequence");
  });

  it("excludes lockfiles and consumer ci/gates.yml diff_exclude entries", async () => {
    setupRepo(workorder({ max_diff_lines: 5 }));
    // ci/gates.yml exists at base (it's a protected consumer file, not part of this diff)
    git("checkout", "-q", "main");
    mkdirSync(join(repo, "ci"), { recursive: true });
    writeFileSync(join(repo, "ci/gates.yml"), "diff_exclude:\n  - generated/\n");
    git("add", "-A"); git("commit", "-qm", "gates config");
    git("checkout", "-q", "feature"); git("rebase", "-q", "main");

    commitChange("package-lock.json", Array.from({ length: 100 }, () => "x").join("\n"));
    commitChange("generated/api.ts", Array.from({ length: 100 }, () => "y").join("\n"));
    commitChange("src/demo/real.txt", "one\ntwo\n");
    const r = await gateDiffSize(defaultContext(repo), { base: "main", prBody: PR_BODY });
    expect(r.exitCode).toBe(0);
    expect((r.data as { total: number }).total).toBe(2);
  });

  it("RED without any work-order reference", async () => {
    setupRepo();
    const r = await gateDiffSize(defaultContext(repo), { base: "main" });
    expect(r.exitCode).toBe(1);
  });
});
