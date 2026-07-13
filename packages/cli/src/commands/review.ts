/**
 * crucible review — run the reviewer agent and produce review-verdict.json.
 *
 * Independence by construction (D-09): inputs are the diff, the spec deltas,
 * oracles.md, and the rubric — NEVER the implementer's transcript or reasoning.
 * Output is schema-validated JSON; anything malformed is a FAIL (fail-closed).
 * Exit: 0 for PASS/FLAG (FLAG forces the human route in routing), 1 for FAIL.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import type { CmdContext, CmdResult } from "../lib/context.js";
import { loadWorkorder } from "../lib/workorders.js";
import { resolveAssets } from "../lib/assets.js";
import { extractWorkOrderId } from "../gates/common.js";

const MAX_DIFF_CHARS = 180_000;

export interface Verdict {
  rubric_version: number;
  items: Array<{ id: string; verdict: "PASS" | "FLAG" | "FAIL"; evidence: string }>;
  overall: "PASS" | "FLAG" | "FAIL";
}

/** Parse + schema-validate agent output; null = malformed (caller fails closed). */
export function parseVerdict(raw: string, schema: object): Verdict | null {
  const jsonText = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const ajv = new Ajv2020({ allErrors: true });
  return ajv.compile(schema)(data) ? (data as Verdict) : null;
}

export function failClosed(reason: string, rubricVersion: number): Verdict {
  return {
    rubric_version: rubricVersion,
    items: [{ id: "R0", verdict: "FAIL", evidence: `fail-closed: ${reason}` }],
    overall: "FAIL",
  };
}

export async function cmdReview(
  ctx: CmdContext,
  opts: { base: string; prBody?: string; id?: string; model: string; out: string },
): Promise<CmdResult> {
  const id = opts.id ?? (opts.prBody ? extractWorkOrderId(opts.prBody) : null);
  if (!id) {
    return { exitCode: 1, data: { error: "no work-order ID" }, lines: ["review: RED — no work-order ID"] };
  }
  const loaded = loadWorkorder(ctx.cwd, id);
  if (!loaded || !loaded.result.ok) {
    return { exitCode: 1, data: { error: `work order ${id} not found or invalid` }, lines: [`review: RED — work order ${id} not found or invalid`] };
  }
  const wo = loaded.result.workorder;
  const assets = resolveAssets();
  if (!assets) {
    return { exitCode: 3, data: { error: "assets missing" }, lines: ["environment error: framework assets not found"] };
  }
  const harnessRoot = join(assets.scaffoldDir, "..", "..");
  const rubricYml = readFileSync(join(harnessRoot, "rubric", "rubric.yml"), "utf8");
  const rubric = parseYaml(rubricYml) as { version: number; items: Array<{ id: string; question: string; evidence: string }> };
  const schema = JSON.parse(readFileSync(join(harnessRoot, "rubric", "verdict.schema.json"), "utf8")) as object;

  // Assemble independent inputs.
  const diffR = await ctx.exec("git", ["diff", `${opts.base}...HEAD`]);
  if (!diffR.ok) {
    return { exitCode: 3, data: { error: "git diff failed" }, lines: [`environment error: cannot diff against ${opts.base}`] };
  }
  const truncated = diffR.stdout.length > MAX_DIFF_CHARS;
  const diff = truncated ? diffR.stdout.slice(0, MAX_DIFF_CHARS) : diffR.stdout;
  const changeDir = join(ctx.cwd, wo.change);
  const specsDir = join(changeDir, "specs");
  const specDeltas = existsSync(specsDir)
    ? (await ctx.exec("bash", ["-c", `find ${JSON.stringify(specsDir)} -name '*.md' -exec cat {} +`])).stdout
    : "(no spec deltas found)";
  const oraclesMd = existsSync(join(changeDir, "oracles.md")) ? readFileSync(join(changeDir, "oracles.md"), "utf8") : "(missing)";

  const prompt = readFileSync(join(harnessRoot, "prompts", "reviewer.md"), "utf8")
    .replaceAll("{{ID}}", wo.id)
    .replaceAll("{{SPEC_DELTAS}}", specDeltas)
    .replaceAll("{{ORACLES_MD}}", oraclesMd)
    .replaceAll("{{DIFF}}", diff)
    .replaceAll("{{TRUNCATION_NOTE}}", truncated ? " — TRUNCATED at 180k chars; FLAG R10 if material" : "")
    .replaceAll("{{RUBRIC}}", rubric.items.map((i) => `- **${i.id}** — ${i.question}\n  Evidence required: ${i.evidence}`).join("\n"))
    .replaceAll("{{RUBRIC_VERSION}}", String(rubric.version));

  // Run the reviewer agent (headless, JSON envelope).
  const agent = await ctx.exec("claude", ["-p", prompt, "--model", opts.model, "--output-format", "json", "--max-turns", "1"]);
  let verdict: Verdict;
  if (!agent.ok) {
    verdict = failClosed(`reviewer agent failed: ${agent.stderr.slice(0, 200)}`, rubric.version);
  } else {
    let inner = agent.stdout;
    try {
      const envelope = JSON.parse(agent.stdout) as { result?: string };
      if (typeof envelope.result === "string") inner = envelope.result;
    } catch { /* raw output — parseVerdict handles it */ }
    const parsed = parseVerdict(inner, schema);
    verdict = parsed ?? failClosed("verdict did not match schema", rubric.version);
    // Every rubric item must be answered — missing items fail closed.
    if (parsed) {
      const answered = new Set(parsed.items.map((i) => i.id));
      const missing = rubric.items.filter((i) => !answered.has(i.id)).map((i) => i.id);
      if (missing.length > 0) verdict = failClosed(`rubric items unanswered: ${missing.join(", ")}`, rubric.version);
    }
  }

  writeFileSync(join(ctx.cwd, opts.out), JSON.stringify(verdict, null, 2));
  const table = verdict.items.map((i) => `  ${i.id.padEnd(4)} ${i.verdict.padEnd(5)} ${i.evidence.slice(0, 100)}`);
  return {
    exitCode: verdict.overall === "FAIL" ? 1 : 0,
    data: { id, overall: verdict.overall, out: opts.out, verdict },
    lines: [`reviewer verdict: ${verdict.overall} (rubric v${verdict.rubric_version})`, ...table],
  };
}
