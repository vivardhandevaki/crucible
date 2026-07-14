/**
 * @crucible/cli core — the one shared implementation of the state machine and
 * work-order truth, imported by CLI commands, CI gate scripts, and the Console.
 */

export {
  STATES,
  EDGES,
  INITIAL_STATE,
  TERMINAL_STATE,
  isState,
  isLegalTransition,
  legalNextStates,
  gatekeeperOf,
  findHistoryViolation,
  type State,
} from "./states.js";

export {
  PROTECTED_PATHS,
  validateWorkorder,
  parseWorkorder,
  serializeWorkorder,
  isHistoryAppendOnly,
  type Workorder,
  type HistoryEntry,
  type ValidationResult,
} from "./workorder.js";

export {
  parseOracleRows,
  parseRequirements,
  rowCovers,
  type OracleRow,
  type Requirement,
} from "./oracles.js";
