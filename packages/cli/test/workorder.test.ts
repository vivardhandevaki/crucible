import { describe, expect, it } from "vitest";
import {
  PROTECTED_PATHS,
  isHistoryAppendOnly,
  parseWorkorder,
  serializeWorkorder,
  validateWorkorder,
  type HistoryEntry,
  type Workorder,
} from "../src/core/workorder.js";

/** The impl-plan §2.1 example, adapted to the Model B consumer layout. */
function example(): Workorder {
  return {
    id: "OMS-142",
    title: "Partial cancellation of orders",
    state: "ORACLES_APPROVED",
    change: "openspec/changes/partial-cancellation/",
    oracles: ["ORA-PC-1a", "ORA-PC-1b", "ORA-PC-2a", "ORA-PC-4a", "ORA-PC-5a", "ORA-PC-5b"],
    modules_allowed: ["src/order-core", "src/refund-service", "src/order-api"],
    paths_forbidden: [...PROTECTED_PATHS],
    max_diff_lines: 400,
    max_iterations: 6,
    pr_sequence: [],
    escalation: null,
    history: [
      { state: "DRAFT_SPEC", at: "2026-07-10T09:00:00Z", by: "owner" },
      { state: "SPEC_APPROVED", at: "2026-07-10T10:30:00Z", by: "owner" },
      { state: "ORACLES_AUTHORED", at: "2026-07-11T09:00:00Z", by: "openspec" },
      { state: "ORACLES_APPROVED", at: "2026-07-11T11:00:00Z", by: "owner" },
    ],
  };
}

describe("structural validation (JSON Schema)", () => {
  it("accepts the plan's example work order", () => {
    const r = validateWorkorder(example());
    expect(r.ok).toBe(true);
  });

  it.each<[string, (wo: Workorder) => unknown]>([
    ["bad id format", (wo) => ({ ...wo, id: "oms_142" })],
    ["empty title", (wo) => ({ ...wo, title: "" })],
    ["unknown state", (wo) => ({ ...wo, state: "IN_PROGRESS" })],
    ["change outside openspec/changes", (wo) => ({ ...wo, change: "somewhere/else" })],
    ["malformed oracle id", (wo) => ({ ...wo, oracles: ["PC-1a"] })],
    ["zero max_diff_lines", (wo) => ({ ...wo, max_diff_lines: 0 })],
    ["missing history", (wo) => { const { history: _h, ...rest } = wo; return rest; }],
    ["unknown extra field", (wo) => ({ ...wo, sneaky: true })],
    ["history entry missing 'by'", (wo) => ({
      ...wo,
      history: [{ state: "DRAFT_SPEC", at: "2026-07-10T09:00:00Z" }],
    })],
  ])("rejects %s with a precise error", (_name, mutate) => {
    const r = validateWorkorder(mutate(example()));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("semantic validation", () => {
  it("rejects removal of a protected path from paths_forbidden", () => {
    const wo = example();
    wo.paths_forbidden = wo.paths_forbidden.filter((p) => p !== "oracles/");
    const r = validateWorkorder(wo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain("oracles/");
  });

  it("flags a hand-edited state that skips ahead of history (bypass drill)", () => {
    const wo = example();
    wo.state = "IMPLEMENTING"; // history still ends at ORACLES_APPROVED
    const r = validateWorkorder(wo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain("last history entry");
  });

  it("flags an illegal edge recorded in history", () => {
    const wo = example();
    wo.history = [
      { state: "DRAFT_SPEC", at: "2026-07-10T09:00:00Z", by: "owner" },
      { state: "PACKAGED", at: "2026-07-10T09:05:00Z", by: "owner" },
    ];
    wo.state = "PACKAGED";
    const r = validateWorkorder(wo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain("illegal transition DRAFT_SPEC -> PACKAGED");
  });

  it("flags out-of-order history timestamps", () => {
    const wo = example();
    wo.history[1]!.at = "2026-07-09T00:00:00Z"; // before history[0]
    const r = validateWorkorder(wo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain("precedes");
  });

  it("requires an escalation ref when state is ESCALATED", () => {
    const wo = example();
    wo.history.push(
      { state: "PACKAGED", at: "2026-07-11T12:00:00Z", by: "crucible" },
      { state: "IMPLEMENTING", at: "2026-07-11T12:05:00Z", by: "crucible" },
      { state: "ESCALATED", at: "2026-07-11T14:00:00Z", by: "agent" },
    );
    wo.state = "ESCALATED";
    wo.escalation = null;
    const r = validateWorkorder(wo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain("ESCALATED");
  });
});

describe("YAML round-trip", () => {
  it("serialize -> parse preserves the work order and validates", () => {
    const wo = example();
    const r = parseWorkorder(serializeWorkorder(wo));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.workorder).toEqual(wo);
  });

  it("reports invalid YAML as a parse error, not a crash", () => {
    const r = parseWorkorder("id: [unclosed");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("invalid YAML");
  });
});

describe("isHistoryAppendOnly (legitimacy gate primitive)", () => {
  const base: HistoryEntry[] = [
    { state: "DRAFT_SPEC", at: "2026-07-10T09:00:00Z", by: "owner" },
    { state: "SPEC_APPROVED", at: "2026-07-10T10:30:00Z", by: "owner" },
  ];

  it("accepts a pure append", () => {
    const after = [...base, { state: "ORACLES_AUTHORED", at: "2026-07-11T09:00:00Z", by: "openspec" } as HistoryEntry];
    expect(isHistoryAppendOnly(base, after)).toBe(true);
  });

  it("accepts identical histories", () => {
    expect(isHistoryAppendOnly(base, [...base])).toBe(true);
  });

  it("rejects a rewritten entry", () => {
    const after = [{ ...base[0]!, by: "agent" }, base[1]!];
    expect(isHistoryAppendOnly(base, after)).toBe(false);
  });

  it("rejects a deleted entry", () => {
    expect(isHistoryAppendOnly(base, [base[0]!])).toBe(false);
  });
});
