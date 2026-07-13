/**
 * Work-order parsing and validation — structural (JSON Schema) + semantic
 * (protected-path superset, legal-edge history, state/history consistency).
 *
 * Used by the CLI, the CI legitimacy gate, and the Console server alike.
 */

import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import workorderSchema from "./schema/workorder.schema.json" with { type: "json" };
import { findHistoryViolation, type State } from "./states.js";

/**
 * Protected paths of a Crucible consumer repo (Model B layout). Every work
 * order's paths_forbidden must be a superset of this list — the CLI injects
 * them at creation and validation rejects their removal.
 */
export const PROTECTED_PATHS: readonly string[] = [
  "oracles/",
  "openspec/specs/",
  "openspec/schemas/",
  "ci/",
  ".github/",
  "settings/",
  "CLAUDE.md",
] as const;

export interface HistoryEntry {
  state: State;
  at: string;
  by: string;
}

export interface Workorder {
  id: string;
  title: string;
  state: State;
  change: string;
  oracles: string[];
  modules_allowed: string[];
  paths_forbidden: string[];
  max_diff_lines: number;
  max_iterations: number;
  pr_sequence?: Array<{ n: number; scope: string }>;
  escalation?: { file: string; created_at: string } | null;
  history: HistoryEntry[];
}

export type ValidationResult =
  | { ok: true; workorder: Workorder }
  | { ok: false; errors: string[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
// format: date-time — validate lexically without pulling in ajv-formats.
ajv.addFormat("date-time", {
  type: "string",
  validate: (s: string) => !Number.isNaN(Date.parse(s)),
});
const structural = ajv.compile<Workorder>(workorderSchema);

function formatAjvError(e: ErrorObject): string {
  const path = e.instancePath || "(root)";
  return `${path}: ${e.message ?? "invalid"}`;
}

/** Structural + semantic validation of an already-parsed object. */
export function validateWorkorder(data: unknown): ValidationResult {
  if (!structural(data)) {
    return {
      ok: false,
      errors: (structural.errors ?? []).map(formatAjvError),
    };
  }
  const wo = data as Workorder;
  const errors: string[] = [];

  // 1. paths_forbidden must be a superset of the protected paths.
  const missing = PROTECTED_PATHS.filter((p) => !wo.paths_forbidden.includes(p));
  if (missing.length > 0) {
    errors.push(
      `paths_forbidden is missing protected path(s): ${missing.join(", ")} — protected paths cannot be removed`,
    );
  }

  // 2. History must walk legal edges from DRAFT_SPEC.
  const violation = findHistoryViolation(wo.history.map((h) => h.state));
  if (violation) {
    errors.push(`history[${violation.index}]: ${violation.message}`);
  }

  // 3. Current state must equal the last history entry (no hand-edited state).
  const last = wo.history[wo.history.length - 1];
  if (last && last.state !== wo.state) {
    errors.push(
      `state is ${wo.state} but the last history entry is ${last.state} — state must only advance via recorded transitions`,
    );
  }

  // 4. History timestamps must be non-decreasing.
  for (let i = 1; i < wo.history.length; i++) {
    if (Date.parse(wo.history[i]!.at) < Date.parse(wo.history[i - 1]!.at)) {
      errors.push(`history[${i}]: timestamp precedes history[${i - 1}]`);
    }
  }

  // 5. If state is ESCALATED, the escalation ref must be present (and vice versa).
  if (wo.state === "ESCALATED" && !wo.escalation) {
    errors.push("state is ESCALATED but escalation is not set");
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, workorder: wo };
}

/** Parse workorder.yaml text and validate. */
export function parseWorkorder(yamlText: string): ValidationResult {
  let data: unknown;
  try {
    data = parseYaml(yamlText);
  } catch (e) {
    return { ok: false, errors: [`invalid YAML: ${(e as Error).message}`] };
  }
  return validateWorkorder(data);
}

export function serializeWorkorder(wo: Workorder): string {
  return stringifyYaml(wo, { lineWidth: 0 });
}

/**
 * Append-only check between two versions of a history (e.g. merge base vs PR
 * head, used by the legitimacy gate): every entry of `before` must appear,
 * unmodified and in order, as a prefix of `after`.
 */
export function isHistoryAppendOnly(
  before: readonly HistoryEntry[],
  after: readonly HistoryEntry[],
): boolean {
  if (after.length < before.length) return false;
  return before.every((b, i) => {
    const a = after[i]!;
    return a.state === b.state && a.at === b.at && a.by === b.by;
  });
}
