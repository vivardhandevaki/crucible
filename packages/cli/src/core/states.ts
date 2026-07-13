/**
 * The Crucible state machine — the single authoritative implementation.
 *
 * Imported by the CLI, the CI gate scripts (legitimacy check), and the Console
 * server, so there is exactly one definition of the truth (impl plan §5.2,
 * Appendix A). Any transition not listed in EDGES is illegal.
 *
 * Language-agnostic by construction (ADR 0002): states describe the workflow,
 * never the target stack.
 */

export const STATES = [
  "DRAFT_SPEC",
  "SPEC_APPROVED",
  "ORACLES_AUTHORED",
  "ORACLES_APPROVED",
  "PACKAGED",
  "IMPLEMENTING",
  "PR_OPEN",
  "GATES_GREEN",
  "AI_REVIEWED",
  "ROUTED_AUTO",
  "ROUTED_HUMAN",
  "MERGED",
  "CANARY",
  "DONE",
  "ARCHIVED",
  "ESCALATED",
] as const;

export type State = (typeof STATES)[number];

export const INITIAL_STATE: State = "DRAFT_SPEC";

/** Terminal state: no outgoing edges. */
export const TERMINAL_STATE: State = "ARCHIVED";

/**
 * Legal edges, verbatim from impl plan Appendix A.
 * Format: [from, to, gatekeeper] — the gatekeeper is documentation surfaced in
 * error messages and the Console; enforcement lives in CI/platform, not here.
 */
export const EDGES: ReadonlyArray<readonly [State, State, string]> = [
  ["DRAFT_SPEC", "SPEC_APPROVED", "human: spec PR merged"],
  ["SPEC_APPROVED", "ORACLES_AUTHORED", "openspec: oracles artifact DONE"],
  ["ORACLES_AUTHORED", "ORACLES_APPROVED", "human: /oracles merged; linter green"],
  ["ORACLES_APPROVED", "PACKAGED", "crucible package"],
  ["PACKAGED", "IMPLEMENTING", "crucible run start"],
  ["IMPLEMENTING", "PR_OPEN", "runner opens PR"],
  ["IMPLEMENTING", "ESCALATED", "valid escalation.md"],
  ["PR_OPEN", "GATES_GREEN", "all Gauntlet checks green"],
  ["PR_OPEN", "IMPLEMENTING", "gate red -> new attempt"],
  ["GATES_GREEN", "AI_REVIEWED", "reviewer-verdict posted"],
  ["AI_REVIEWED", "ROUTED_AUTO", "routing: no flags"],
  ["AI_REVIEWED", "ROUTED_HUMAN", "routing: any flag/risk path"],
  ["ROUTED_AUTO", "MERGED", "platform auto-merge"],
  ["ROUTED_HUMAN", "MERGED", "owner approval"],
  ["ROUTED_HUMAN", "IMPLEMENTING", "owner requests changes"],
  ["MERGED", "CANARY", "CD"],
  ["CANARY", "DONE", "SLO watch passed"],
  ["CANARY", "ESCALATED", "rollback -> postmortem path"],
  ["DONE", "ARCHIVED", "/opsx:archive; all PRs merged check"],
  ["ESCALATED", "SPEC_APPROVED", "human resolution (spec fix)"],
  ["ESCALATED", "ORACLES_APPROVED", "human resolution (oracle fix)"],
  ["ESCALATED", "PACKAGED", "human resolution (repackage)"],
] as const;

export function isState(value: unknown): value is State {
  return typeof value === "string" && (STATES as readonly string[]).includes(value);
}

export function isLegalTransition(from: State, to: State): boolean {
  return EDGES.some(([f, t]) => f === from && t === to);
}

export function legalNextStates(from: State): State[] {
  return EDGES.filter(([f]) => f === from).map(([, t]) => t);
}

/** Gatekeeper description for a legal edge, or undefined if the edge is illegal. */
export function gatekeeperOf(from: State, to: State): string | undefined {
  return EDGES.find(([f, t]) => f === from && t === to)?.[2];
}

/**
 * Validate that a sequence of states (e.g. a work order's history) walks only
 * legal edges starting from INITIAL_STATE. Returns the first violation, or null.
 */
export function findHistoryViolation(
  sequence: readonly State[],
): { index: number; message: string } | null {
  if (sequence.length === 0) return null;
  const first = sequence[0]!;
  if (first !== INITIAL_STATE) {
    return { index: 0, message: `history must begin at ${INITIAL_STATE}, found ${first}` };
  }
  for (let i = 1; i < sequence.length; i++) {
    const from = sequence[i - 1]!;
    const to = sequence[i]!;
    if (!isLegalTransition(from, to)) {
      return {
        index: i,
        message: `illegal transition ${from} -> ${to} (legal from ${from}: ${legalNextStates(from).join(", ") || "none — terminal"})`,
      };
    }
  }
  return null;
}
