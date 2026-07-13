import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CmdContext, ExecResult } from "../src/lib/context.js";
import { cmdRoute, decide, globToRegex, type RouteDecision } from "../src/commands/route.js";
import { cmdAudit } from "../src/commands/audit.js";
import type { Verdict } from "../src/commands/review.js";

const PASS: Verdict = { rubric_version: 1, items: [{ id: "R1", verdict: "PASS", evidence: "ok" }], overall: "PASS" };
const FLAG: Verdict = { ...PASS, items: [{ id: "R7", verdict: "FLAG", evidence: "txn boundary" }], overall: "FLAG" };
const RISK = { money: ["**/refund/**"], deps: ["ci/dependency-allowlist.yml"] };

describe("globToRegex", () => {
  it.each([
    ["**/refund/**", "src/refund/Svc.java", true],
    ["**/refund/**", "src/order/Svc.java", false],
    ["**/*Migration*", "src/db/V2__UserMigration.java", true],
    ["ci/dependency-allowlist.yml", "ci/dependency-allowlist.yml", true],
    ["**/api/**", "src/order-api/Controller.java", false], // * does not cross segments
    ["**/api/**", "src/api/Controller.java", true],
  ])("%s vs %s -> %s", (glob, path, expected) => {
    expect(globToRegex(glob).test(path)).toBe(expected);
  });
});

describe("decide (pure routing core)", () => {
  it("auto when clean: no risk hits, PASS verdict, no concurrency markers", () => {
    const d = decide(["src/demo/a.java"], RISK, PASS, "+ plain code");
    expect(d).toMatchObject({ route: "auto", categories: [] });
  });
  it("human on risk-path hit with the category named", () => {
    const d = decide(["src/refund/Svc.java"], RISK, PASS, "");
    expect(d.route).toBe("human");
    expect(d.categories).toContain("money");
  });
  it("human on reviewer FLAG", () => {
    expect(decide(["src/demo/a.java"], RISK, FLAG, "").categories).toContain("reviewer-flag");
  });
  it("human when verdict is missing (fail-closed routing)", () => {
    expect(decide(["src/demo/a.java"], RISK, null, "").route).toBe("human");
  });
  it("human on concurrency markers in diff content", () => {
    const d = decide(["src/demo/a.java"], RISK, PASS, "+  synchronized (lock) {");
    expect(d.categories).toContain("concurrency");
  });
});

describe("cmdRoute --apply", () => {
  let cwd: string;
  let execLog: string[];
  let diffPaths: string;

  function ctx(): CmdContext {
    return {
      cwd, now: () => "t", user: () => "u",
      exec: async (cmd: string, args: string[]): Promise<ExecResult> => {
        execLog.push(`${cmd} ${args.join(" ")}`);
        if (cmd === "git" && args[0] === "diff" && args.includes("--name-only")) return { ok: true, stdout: diffPaths, stderr: "" };
        if (cmd === "git" && args[0] === "diff") return { ok: true, stdout: "+ code", stderr: "" };
        if (cmd === "gh") return { ok: true, stdout: "", stderr: "" };
        return { ok: false, stdout: "", stderr: "unexpected" };
      },
    };
  }

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "crucible-route-"));
    execLog = [];
    mkdirSync(join(cwd, "ci"), { recursive: true });
    writeFileSync(join(cwd, "ci/risk-paths.yml"), 'categories:\n  money: ["**/refund/**"]\n');
    writeFileSync(join(cwd, "crucible.yaml"), "owner: \"vivardhandevaki\"\n");
    writeFileSync(join(cwd, "review-verdict.json"), JSON.stringify(PASS));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("auto route: enables auto-merge", async () => {
    diffPaths = "src/demo/a.java\n";
    const r = await cmdRoute(ctx(), { base: "origin/main", verdict: "review-verdict.json", pr: "7", apply: true });
    expect(r.exitCode).toBe(0);
    expect((r.data as RouteDecision).route).toBe("auto");
    expect(execLog.some((l) => l.includes("pr merge 7 --auto --squash"))).toBe(true);
    expect(execLog.some((l) => l.includes("--add-label auto-merge"))).toBe(true);
  });

  it("human route: risk label + owner review requested, never auto-merge", async () => {
    diffPaths = "src/refund/Svc.java\n";
    const r = await cmdRoute(ctx(), { base: "origin/main", verdict: "review-verdict.json", pr: "7", apply: true });
    expect((r.data as RouteDecision).route).toBe("human");
    expect(execLog.some((l) => l.includes("--add-label risk:money"))).toBe(true);
    expect(execLog.some((l) => l.includes("--add-reviewer vivardhandevaki"))).toBe(true);
    expect(execLog.some((l) => l.includes("--auto"))).toBe(false);
  });
});

describe("cmdAudit", () => {
  const prs = (nums: number[], labels: string[] = ["crucible", "auto-merge"]) =>
    JSON.stringify(nums.map((n) => ({
      number: n, title: `PR ${n}`, mergedAt: "2026-07-12T00:00:00Z",
      labels: labels.map((name) => ({ name })),
    })));

  function ctx(ghOut: string): CmdContext {
    return {
      cwd: "/tmp", now: () => "t", user: () => "u",
      exec: async (cmd: string): Promise<ExecResult> =>
        cmd === "gh" ? { ok: true, stdout: ghOut, stderr: "" } : { ok: false, stdout: "", stderr: "x" },
    };
  }

  it("samples deterministically: every k-th PR number", async () => {
    const r = await cmdAudit(ctx(prs([9, 10, 11, 20, 21, 30])), { sample: 0.1, sinceDays: 7 });
    expect((r.data as { sampled: number[] }).sampled).toEqual([10, 20, 30]);
    // Re-run: identical (no seed state).
    const r2 = await cmdAudit(ctx(prs([9, 10, 11, 20, 21, 30])), { sample: 0.1, sinceDays: 7 });
    expect(r2.data).toEqual(r.data);
  });

  it("excludes human-routed (risk:*) PRs and respects the window", async () => {
    const mixed = JSON.stringify([
      { number: 10, title: "auto", mergedAt: "2026-07-12T00:00:00Z", labels: [{ name: "crucible" }, { name: "auto-merge" }] },
      { number: 20, title: "risky", mergedAt: "2026-07-12T00:00:00Z", labels: [{ name: "crucible" }, { name: "auto-merge" }, { name: "risk:money" }] },
      { number: 30, title: "old", mergedAt: "2020-01-01T00:00:00Z", labels: [{ name: "crucible" }, { name: "auto-merge" }] },
    ]);
    const r = await cmdAudit(ctx(mixed), { sample: 1, sinceDays: 3650 });
    const sampled = (r.data as { sampled: number[] }).sampled;
    expect(sampled).toContain(10);
    expect(sampled).not.toContain(20);
  });

  it("rejects a sample outside (0,1]", async () => {
    expect((await cmdAudit(ctx("[]"), { sample: 0, sinceDays: 7 })).exitCode).toBe(1);
  });
});
