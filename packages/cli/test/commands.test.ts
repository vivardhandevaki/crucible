import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CmdContext, ExecResult } from "../src/lib/context.js";
import { cmdNew } from "../src/commands/new.js";
import { cmdValidate, parseOracleRows } from "../src/commands/validate.js";
import { cmdStatus } from "../src/commands/status.js";
import { cmdEscalations } from "../src/commands/escalations.js";
import { parseWorkorder } from "../src/core/workorder.js";

let cwd: string;
let gitPathsOnMain: Set<string>;

function ctx(): CmdContext {
  return {
    cwd,
    now: () => "2026-07-13T10:00:00.000Z",
    user: () => "tester",
    exec: async (cmd: string, args: string[]): Promise<ExecResult> => {
      if (cmd === "git" && args[0] === "cat-file") {
        const path = (args[2] ?? "").replace(/^main:/, "");
        return { ok: gitPathsOnMain.has(path), stdout: "", stderr: "" };
      }
      return { ok: false, stdout: "", stderr: `unexpected exec: ${cmd}` };
    },
  };
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "crucible-test-"));
  gitPathsOnMain = new Set();
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("crucible new", () => {
  it("scaffolds a schema-valid work order in DRAFT_SPEC", async () => {
    const r = await cmdNew(ctx(), "OMS-1", { title: "T", change: "demo-change" });
    expect(r.exitCode).toBe(0);
    const parsed = parseWorkorder(
      readFileSync(join(cwd, "workorders/OMS-1-demo-change/workorder.yaml"), "utf8"),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.workorder.state).toBe("DRAFT_SPEC");
      expect(parsed.workorder.paths_forbidden).toContain("oracles/");
      expect(parsed.workorder.history).toHaveLength(1);
    }
  });

  it("refuses a duplicate ID with exit 2", async () => {
    await cmdNew(ctx(), "OMS-1", { title: "T", change: "demo-change" });
    const r = await cmdNew(ctx(), "OMS-1", { title: "T2", change: "other-change" });
    expect(r.exitCode).toBe(2);
  });

  it.each([["bad id", "oms-1", "demo"], ["bad slug", "OMS-1", "Bad_Slug"]])(
    "rejects %s with exit 1", async (_n, id, slug) => {
      const r = await cmdNew(ctx(), id, { title: "T", change: slug });
      expect(r.exitCode).toBe(1);
    });
});

describe("crucible validate", () => {
  async function scaffold(): Promise<void> {
    await cmdNew(ctx(), "OMS-1", { title: "T", change: "demo" });
  }
  function writeSpecDelta(text = "The system SHALL do X.") {
    const d = join(cwd, "openspec/changes/demo/specs/cap");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "spec.md"), text);
  }

  it("exit 2 for a missing work order", async () => {
    const r = await cmdValidate(ctx(), "NOPE-1", {});
    expect(r.exitCode).toBe(2);
  });

  it("exit 1 for an invalid workorder.yaml", async () => {
    await scaffold();
    writeFileSync(join(cwd, "workorders/OMS-1-demo/workorder.yaml"), "id: 123\n");
    const r = await cmdValidate(ctx(), "OMS-1", {});
    expect(r.exitCode).toBe(1);
  });

  it("DRAFT_SPEC: fails preconditions without spec deltas, passes with SHALL, advances", async () => {
    await scaffold();
    let r = await cmdValidate(ctx(), "OMS-1", {});
    expect(r.exitCode).toBe(2);

    writeSpecDelta();
    r = await cmdValidate(ctx(), "OMS-1", { advance: true });
    expect(r.exitCode).toBe(0);
    const wo = parseWorkorder(readFileSync(join(cwd, "workorders/OMS-1-demo/workorder.yaml"), "utf8"));
    if (wo.ok) {
      expect(wo.workorder.state).toBe("SPEC_APPROVED");
      expect(wo.workorder.history).toHaveLength(2);
    } else expect.fail("workorder should stay valid after advance");
  });

  it("ORACLES_AUTHORED -> ORACLES_APPROVED: distinguishes 'oracles.md exists' from 'merged on main'", async () => {
    await scaffold();
    writeSpecDelta();
    await cmdValidate(ctx(), "OMS-1", { advance: true }); // -> SPEC_APPROVED
    const changeDir = join(cwd, "openspec/changes/demo");
    writeFileSync(join(changeDir, "oracles.md"), [
      "| REQ ID | Requirement | Oracle ID(s) | Oracle Type | Implementation Path | Status |",
      "|---|---|---|---|---|---|",
      "| REQ-D-1 | The system SHALL do X. | ORA-D-1a | property | oracles/properties/XTest.java | DRAFT |",
    ].join("\n"));
    await cmdValidate(ctx(), "OMS-1", { advance: true }); // -> ORACLES_AUTHORED

    // Put the oracle ID on the work order (normally the packaging/authoring flow does this).
    const file = join(cwd, "workorders/OMS-1-demo/workorder.yaml");
    writeFileSync(file, readFileSync(file, "utf8").replace("oracles: []", 'oracles: ["ORA-D-1a"]'));

    // oracles.md exists but implementation NOT on main -> precondition fails.
    let r = await cmdValidate(ctx(), "OMS-1", {});
    expect(r.exitCode).toBe(2);
    expect(r.lines.join()).toContain("not on main");

    // Now "merge" it.
    gitPathsOnMain.add("oracles/properties/XTest.java");
    r = await cmdValidate(ctx(), "OMS-1", { advance: true });
    expect(r.exitCode).toBe(0);
  });

  it("refuses an illegal --to target", async () => {
    await scaffold();
    const r = await cmdValidate(ctx(), "OMS-1", { to: "MERGED" });
    expect(r.exitCode).toBe(2);
  });

  it("does not advance machinery-owned transitions", async () => {
    await scaffold();
    const file = join(cwd, "workorders/OMS-1-demo/workorder.yaml");
    const wo = parseWorkorder(readFileSync(file, "utf8"));
    if (!wo.ok) return expect.fail();
    wo.workorder.history.push(
      { state: "SPEC_APPROVED", at: "2026-07-13T10:01:00Z", by: "t" },
      { state: "ORACLES_AUTHORED", at: "2026-07-13T10:02:00Z", by: "t" },
      { state: "ORACLES_APPROVED", at: "2026-07-13T10:03:00Z", by: "t" },
      { state: "PACKAGED", at: "2026-07-13T10:04:00Z", by: "t" },
    );
    wo.workorder.state = "PACKAGED";
    writeFileSync(file, (await import("../src/core/workorder.js")).serializeWorkorder(wo.workorder));
    const r = await cmdValidate(ctx(), "OMS-1", { advance: true });
    expect(r.data).toMatchObject({ advanced: false });
  });
});

describe("crucible status / escalations", () => {
  it("status lists all work orders; detail shows legal next states", async () => {
    await cmdNew(ctx(), "OMS-1", { title: "One", change: "one" });
    await cmdNew(ctx(), "OMS-2", { title: "Two", change: "two" });
    const all = await cmdStatus(ctx());
    expect(all.exitCode).toBe(0);
    expect((all.data as { workorders: unknown[] }).workorders).toHaveLength(2);
    const one = await cmdStatus(ctx(), "OMS-1");
    expect(one.lines.join()).toContain("SPEC_APPROVED"); // legal next of DRAFT_SPEC
  });

  it("escalations lists structured content only for escalated work orders", async () => {
    await cmdNew(ctx(), "OMS-1", { title: "One", change: "one" });
    let r = await cmdEscalations(ctx());
    expect((r.data as { count: number }).count).toBe(0);

    const dir = join(cwd, "workorders/OMS-1-one");
    writeFileSync(join(dir, "escalation.md"), "## Blocking\nREQ-X contradicts ORA-Y");
    const file = join(dir, "workorder.yaml");
    writeFileSync(file, readFileSync(file, "utf8").replace(
      "escalation: null",
      'escalation:\n  file: escalation.md\n  created_at: "2026-07-13T11:00:00Z"',
    ));
    r = await cmdEscalations(ctx());
    expect((r.data as { count: number }).count).toBe(1);
    expect(r.lines.join("\n")).toContain("REQ-X contradicts ORA-Y");
  });
});

describe("parseOracleRows", () => {
  it("extracts ids, path, status; ignores header and non-oracle rows", () => {
    const rows = parseOracleRows([
      "| REQ ID | Requirement | Oracle ID(s) | Type | Implementation Path | Status |",
      "|---|---|---|---|---|---|",
      "| REQ-A-1 | X SHALL Y | ORA-A-1a, ORA-A-1b | property | oracles/properties/T.java | DRAFT |",
      "| REQ-A-2 | X MUST Z | ORA-A-2a | human-audit | n/a | APPROVED |",
    ].join("\n"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ ids: ["ORA-A-1a", "ORA-A-1b"], implPath: "oracles/properties/T.java" });
    expect(rows[1]).toMatchObject({ ids: ["ORA-A-2a"], implPath: "n/a", status: "APPROVED" });
  });
});
