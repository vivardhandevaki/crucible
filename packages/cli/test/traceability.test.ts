import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultContext } from "../src/lib/context.js";
import { gateTraceability } from "../src/gates/traceability.js";
import { parseRequirements, rowCovers, parseOracleRows } from "../src/core/oracles.js";
import { serializeWorkorder, type Workorder } from "../src/core/workorder.js";

let repo: string;
const git = (...a: string[]) => execFileSync("git", a, { cwd: repo, encoding: "utf8" });
const write = (rel: string, content: string) => {
  mkdirSync(join(repo, rel, ".."), { recursive: true });
  writeFileSync(join(repo, rel), content);
};

const SPEC_DELTA = `## ADDED Requirements

### Requirement: Line items are cancellable unless shipped
A line item in ALLOCATED or PENDING SHALL be cancellable; SHIPPED SHALL NOT.

#### Scenario: cancel allocated item
- **WHEN** a cancel request targets an ALLOCATED item
- **THEN** the item is cancelled

### Requirement: Refund matches rounding policy
Refund SHALL equal unit price times cancelled quantity per the rounding policy.

#### Scenario: refund computed
- **WHEN** an item is cancelled
- **THEN** the refund matches the policy to the cent
`;

function oraclesMd(rows: string[]): string {
  return [
    "# Oracle Map — demo",
    "",
    "## Traceability Table",
    "",
    "| REQ ID | Requirement (verbatim SHALL/MUST) | Oracle ID(s) | Oracle Type | Implementation Path | Status |",
    "|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

const ROW_CANCEL = "| REQ-D-1 | A line item in ALLOCATED or PENDING SHALL be cancellable; SHIPPED SHALL NOT. | ORA-D-1a | property | oracles/properties/CancelTest.java | APPROVED |";
const ROW_REFUND = "| REQ-D-2 | Refund SHALL equal unit price times cancelled quantity per the rounding policy. | ORA-D-2a | property | oracles/properties/RefundTest.java | IMPLEMENTED |";

function workorder(oracles: string[] = ["ORA-D-1a", "ORA-D-2a"]): Workorder {
  const t = (n: number) => `2026-07-13T0${n}:00:00Z`;
  return {
    id: "OMS-1", title: "Demo", state: "IMPLEMENTING", change: "openspec/changes/demo/",
    oracles, modules_allowed: ["src/demo"],
    paths_forbidden: ["oracles/", "openspec/specs/", "openspec/schemas/", "ci/", ".github/", "settings/", "CLAUDE.md"],
    max_diff_lines: 400, max_iterations: 6, pr_sequence: [], escalation: null,
    history: [
      { state: "DRAFT_SPEC", at: t(1), by: "o" }, { state: "SPEC_APPROVED", at: t(2), by: "o" },
      { state: "ORACLES_AUTHORED", at: t(3), by: "o" }, { state: "ORACLES_APPROVED", at: t(4), by: "o" },
      { state: "PACKAGED", at: t(5), by: "cli" }, { state: "IMPLEMENTING", at: t(6), by: "runner" },
    ],
  };
}

/** main: workorder + change + APPROVED oracle file; feature: IMPLEMENTED oracle file. */
function setup(rows: string[], wo: Workorder = workorder()): void {
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t"); git("config", "user.name", "t");
  write("workorders/OMS-1-demo/workorder.yaml", serializeWorkorder(wo));
  write("openspec/changes/demo/specs/cancel/spec.md", SPEC_DELTA);
  write("openspec/changes/demo/oracles.md", oraclesMd(rows));
  write("oracles/properties/CancelTest.java", "class CancelTest {}");
  git("add", "-A"); git("commit", "-qm", "base");
  git("checkout", "-qb", "feature");
  write("oracles/properties/RefundTest.java", "class RefundTest {}");
  git("add", "-A"); git("commit", "-qm", "impl oracle");
}

beforeEach(() => { repo = mkdtempSync(join(tmpdir(), "crucible-trace-")); });
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("gate traceability", () => {
  it("GREEN: both requirements covered; APPROVED on main, IMPLEMENTED on branch", async () => {
    setup([ROW_CANCEL, ROW_REFUND]);
    const r = await gateTraceability(defaultContext(repo), { id: "OMS-1", mainRef: "main" });
    expect(r.lines.join("\n")).toContain("GREEN");
    expect(r.exitCode).toBe(0);
  });

  it("RED: a SHALL requirement with no oracle row is named in the failure", async () => {
    setup([ROW_CANCEL]); // refund requirement unmapped
    const r = await gateTraceability(defaultContext(repo), { id: "OMS-1", mainRef: "main" });
    expect(r.exitCode).toBe(1);
    expect(r.lines.join()).toContain("Refund matches rounding policy");
  });

  it("RED: APPROVED oracle whose file is not on main", async () => {
    const row = ROW_CANCEL.replace("oracles/properties/CancelTest.java", "oracles/properties/Ghost.java");
    setup([row, ROW_REFUND]);
    const r = await gateTraceability(defaultContext(repo), { id: "OMS-1", mainRef: "main" });
    expect(r.exitCode).toBe(1);
    expect(r.lines.join()).toContain("Ghost.java not on main");
  });

  it("RED: IMPLEMENTED oracle missing from the branch", async () => {
    const row = ROW_REFUND.replace("RefundTest.java |", "Missing.java |");
    setup([ROW_CANCEL, row]);
    const r = await gateTraceability(defaultContext(repo), { id: "OMS-1", mainRef: "main" });
    expect(r.exitCode).toBe(1);
    expect(r.lines.join()).toContain("Missing.java missing from this branch");
  });

  it("RED: work-order oracle ID dangling (not in oracles.md)", async () => {
    setup([ROW_CANCEL, ROW_REFUND], workorder(["ORA-D-1a", "ORA-D-9z"]));
    const r = await gateTraceability(defaultContext(repo), { id: "OMS-1", mainRef: "main" });
    expect(r.exitCode).toBe(1);
    expect(r.lines.join()).toContain("DANGLING: ORA-D-9z");
  });

  it("DRAFT and human-audit rows require no files", async () => {
    const draft = ROW_REFUND.replace("IMPLEMENTED", "DRAFT").replace("RefundTest.java", "NotYet.java");
    setup([ROW_CANCEL, draft]);
    const r = await gateTraceability(defaultContext(repo), { id: "OMS-1", mainRef: "main" });
    expect(r.exitCode).toBe(0);
  });
});

describe("requirement/oracle-map parsers", () => {
  it("parseRequirements finds blocks and flags normativity", () => {
    const reqs = parseRequirements("spec.md", SPEC_DELTA);
    expect(reqs).toHaveLength(2);
    expect(reqs.every((r) => r.normative)).toBe(true);
    expect(reqs[0]!.name).toBe("Line items are cancellable unless shipped");
  });

  it("rowCovers matches verbatim text, requirement name, or REQ ID", () => {
    const reqs = parseRequirements("spec.md", SPEC_DELTA);
    const rows = parseOracleRows(oraclesMd([ROW_CANCEL, ROW_REFUND]));
    expect(rowCovers(rows[0]!, reqs[0]!)).toBe(true);
    expect(rowCovers(rows[0]!, reqs[1]!)).toBe(false);
    expect(rowCovers(rows[1]!, reqs[1]!)).toBe(true);
  });
});
