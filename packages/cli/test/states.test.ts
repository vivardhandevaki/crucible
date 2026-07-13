import { describe, expect, it } from "vitest";
import {
  EDGES,
  INITIAL_STATE,
  STATES,
  TERMINAL_STATE,
  findHistoryViolation,
  gatekeeperOf,
  isLegalTransition,
  isState,
  legalNextStates,
  type State,
} from "../src/core/states.js";

describe("state machine edges (Appendix A)", () => {
  it("declares every Appendix A edge as legal", () => {
    for (const [from, to] of EDGES) {
      expect(isLegalTransition(from, to)).toBe(true);
    }
  });

  it("has exactly 22 edges — additions must be deliberate", () => {
    expect(EDGES).toHaveLength(22);
  });

  it.each<[State, State]>([
    ["DRAFT_SPEC", "PACKAGED"], // skipping spec approval + oracles
    ["SPEC_APPROVED", "IMPLEMENTING"], // skipping oracles entirely
    ["ORACLES_AUTHORED", "PACKAGED"], // skipping human oracle approval
    ["MERGED", "IMPLEMENTING"], // no going back after merge
    ["ESCALATED", "IMPLEMENTING"], // escalation resolves upstream, never straight to code
    ["DONE", "IMPLEMENTING"],
    ["ARCHIVED", "DRAFT_SPEC"], // terminal
  ])("rejects illegal transition %s -> %s", (from, to) => {
    expect(isLegalTransition(from, to)).toBe(false);
  });

  it("ARCHIVED is terminal: no outgoing edges", () => {
    expect(legalNextStates(TERMINAL_STATE)).toEqual([]);
  });

  it("every non-terminal state has at least one outgoing edge", () => {
    for (const s of STATES) {
      if (s === TERMINAL_STATE) continue;
      expect(legalNextStates(s).length, `state ${s}`).toBeGreaterThan(0);
    }
  });

  it("every edge endpoint is a declared state", () => {
    for (const [from, to] of EDGES) {
      expect(isState(from)).toBe(true);
      expect(isState(to)).toBe(true);
    }
  });

  it("exposes the gatekeeper for a legal edge, undefined for an illegal one", () => {
    expect(gatekeeperOf("PR_OPEN", "GATES_GREEN")).toBe("all Gauntlet checks green");
    expect(gatekeeperOf("DRAFT_SPEC", "MERGED")).toBeUndefined();
  });
});

describe("findHistoryViolation", () => {
  it("accepts the full happy path", () => {
    const happy: State[] = [
      "DRAFT_SPEC", "SPEC_APPROVED", "ORACLES_AUTHORED", "ORACLES_APPROVED",
      "PACKAGED", "IMPLEMENTING", "PR_OPEN", "GATES_GREEN", "AI_REVIEWED",
      "ROUTED_HUMAN", "MERGED", "CANARY", "DONE", "ARCHIVED",
    ];
    expect(findHistoryViolation(happy)).toBeNull();
  });

  it("accepts the gate-red retry loop", () => {
    const retry: State[] = [
      "DRAFT_SPEC", "SPEC_APPROVED", "ORACLES_AUTHORED", "ORACLES_APPROVED",
      "PACKAGED", "IMPLEMENTING", "PR_OPEN", "IMPLEMENTING", "PR_OPEN",
    ];
    expect(findHistoryViolation(retry)).toBeNull();
  });

  it("rejects a history that does not start at DRAFT_SPEC", () => {
    const v = findHistoryViolation(["PACKAGED", "IMPLEMENTING"]);
    expect(v?.index).toBe(0);
    expect(v?.message).toContain("must begin at DRAFT_SPEC");
  });

  it("pinpoints a skipped state (the bypass drill)", () => {
    const v = findHistoryViolation(["DRAFT_SPEC", "SPEC_APPROVED", "PACKAGED"]);
    expect(v?.index).toBe(2);
    expect(v?.message).toContain("SPEC_APPROVED -> PACKAGED");
  });

  it("accepts an empty history (nothing to check)", () => {
    expect(findHistoryViolation([])).toBeNull();
  });
});
