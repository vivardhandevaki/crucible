/**
 * crucible eval — the pipeline eval suite (impl plan §6.1).
 *
 * Runs the frozen benchmark work orders under evals/benchmarks/ and reports a
 * scorecard. Two tiers:
 *
 *   STATIC (default, deterministic, CI-safe) — fixture integrity, traceability-
 *   lite, manifest/kind consistency, and the harness-invariant checks that catch
 *   a prompt/settings/rubric regression before merge. This is what the
 *   `harness-evals` CI check gates on.
 *
 *   LIVE (--live, opt-in) — actually runs the implementer in the sandbox against
 *   a scratch clone of a Crucible consumer repo (--repo) and scores the observed
 *   pipeline outcome. Needs Docker + CLAUDE_CODE_OAUTH_TOKEN; missing prerequisites
 *   are reported as skips, never failures. The scratch clone's origin is removed
 *   so a live run can never push or open a PR against a real remote.
 *
 * Exit: 0 all green · 1 a check failed · 3 environment (no benchmarks/assets).
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CmdContext, CmdResult } from "../lib/context.js";
import type { Check } from "./validate.js";
import { resolveAssets } from "../lib/assets.js";
import { parseWorkorder } from "../core/workorder.js";
import {
  validateEvalManifest,
  manifestConsistency,
  fixtureConsistency,
  invariantChecks,
  scoreLive,
  type EvalManifest,
  type HarnessAssets,
  type SpecDelta,
} from "../core/evals.js";
import { parse as parseYaml } from "yaml";
import { cmdPackage } from "./package.js";
import { cmdRun } from "./run.js";

interface EvalRoots {
  harnessDir: string; // where prompts/, sandbox/, rubric/ live
  benchmarksDir: string; // evals/benchmarks
}

function resolveEvalRoots(): EvalRoots | null {
  const assets = resolveAssets();
  if (!assets) return null;
  const harnessDir = join(assets.scaffoldDir, "..", ".."); // repo root (monorepo) or <pkg>/assets (published)
  return { harnessDir, benchmarksDir: join(harnessDir, "evals", "benchmarks") };
}

interface LoadedBenchmark {
  dir: string;
  name: string; // benchmark directory name
  parse: ReturnType<typeof validateEvalManifest>;
}

function loadBenchmarks(benchmarksDir: string, only?: string): LoadedBenchmark[] {
  if (!existsSync(benchmarksDir)) return [];
  return readdirSync(benchmarksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(benchmarksDir, d.name, "eval.yaml")))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => {
      const dir = join(benchmarksDir, d.name);
      let parse: ReturnType<typeof validateEvalManifest>;
      try {
        parse = validateEvalManifest(parseYaml(readFileSync(join(dir, "eval.yaml"), "utf8")));
      } catch (e) {
        parse = { ok: false, errors: [`eval.yaml: ${(e as Error).message}`] };
      }
      return { dir, name: d.name, parse };
    })
    .filter((b) => !only || (b.parse.ok && b.parse.manifest.id === only) || b.name === only);
}

function specDeltas(changeDir: string): SpecDelta[] {
  const specsDir = join(changeDir, "specs");
  if (!existsSync(specsDir)) return [];
  const out: SpecDelta[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name.endsWith(".md")) out.push({ file: e.name, text: readFileSync(join(d, e.name), "utf8") });
    }
  };
  walk(specsDir);
  return out;
}

function readHarnessAssets(harnessDir: string): HarnessAssets {
  const read = (...p: string[]): string => {
    const f = join(harnessDir, ...p);
    return existsSync(f) ? readFileSync(f, "utf8") : "";
  };
  return {
    implementer: read("prompts", "implementer.md"),
    reviewer: read("prompts", "reviewer.md"),
    settings: read("sandbox", "claude-settings.template.json"),
    rubricYml: read("rubric", "rubric.yml"),
  };
}

/** Static checks for one benchmark's frozen fixture. */
function benchmarkChecks(b: LoadedBenchmark): Check[] {
  if (!b.parse.ok) return [{ name: `eval.yaml valid (${b.name})`, ok: false, detail: b.parse.errors.join("; ") }];
  const m = b.parse.manifest;
  const woFile = join(b.dir, m.workorder);
  const changeDir = join(b.dir, m.change);
  if (!existsSync(woFile)) return [{ name: "workorder.yaml present", ok: false, detail: `${m.workorder} missing` }];
  const oraclesMd = join(changeDir, "oracles.md");
  const woParse = parseWorkorder(readFileSync(woFile, "utf8"));
  return [
    ...manifestConsistency(m),
    ...fixtureConsistency(m, woParse, specDeltas(changeDir), existsSync(oraclesMd) ? readFileSync(oraclesMd, "utf8") : "(missing)"),
  ];
}

/**
 * Live tier: seed the fixture into a scratch clone of a consumer repo, package
 * and run, and score the observed outcome. Any missing prerequisite -> skip.
 * The scratch clone's origin is removed, so this can never push or open a PR.
 */
async function runLive(ctx: CmdContext, b: LoadedBenchmark, repo?: string): Promise<{ checks: Check[]; skipped?: string }> {
  if (!b.parse.ok) return { checks: [], skipped: "manifest invalid" };
  const m = b.parse.manifest;
  if (!repo) return { checks: [], skipped: "no --repo (a Crucible consumer repo) provided" };
  if (!existsSync(join(repo, "crucible.yaml"))) return { checks: [], skipped: `${repo} is not a Crucible consumer repo` };

  const woYaml = readFileSync(join(b.dir, m.workorder), "utf8");
  const woParse = parseWorkorder(woYaml);
  if (!woParse.ok) return { checks: [], skipped: "fixture work order invalid (static tier reports it)" };
  const wo = woParse.workorder;

  const scratch = mkdtempSync(join(tmpdir(), `crucible-eval-${wo.id}-`));
  try {
    const clone = join(scratch, "repo");
    if (!(await ctx.exec("git", ["clone", "--quiet", repo, clone])).ok) return { checks: [], skipped: `clone of ${repo} failed` };
    // Sever the remote: a live eval must never reach a real GitHub repo.
    await ctx.exec("git", ["-C", clone, "remote", "remove", "origin"]);

    const woDir = join(clone, "workorders", `${wo.id}-eval`);
    mkdirSync(woDir, { recursive: true });
    writeFileSync(join(woDir, "workorder.yaml"), woYaml);
    cpSync(join(b.dir, m.change), join(clone, wo.change), { recursive: true });

    const cctx: CmdContext = { ...ctx, cwd: clone };
    const pkg = await cmdPackage(cctx, wo.id);
    if (pkg.exitCode !== 0) return { checks: [{ name: `package ${wo.id}`, ok: false, detail: pkg.lines[0] ?? "package failed" }] };
    const runR = await cmdRun(cctx, wo.id);
    if (runR.exitCode === 3) return { checks: [], skipped: `environment: ${runR.lines[0] ?? "sandbox unavailable"}` };
    const outcome = (runR.data as { outcome?: string }).outcome as EvalManifest["expected"]["outcome"] | undefined;
    if (!outcome) return { checks: [{ name: `run ${wo.id}`, ok: false, detail: runR.lines[0] ?? "no outcome" }] };
    return { checks: scoreLive(m, { outcome }) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export interface EvalOptions {
  mode: "run" | "list";
  live: boolean;
  only?: string;
  repo?: string;
}

export async function cmdEval(ctx: CmdContext, opts: EvalOptions): Promise<CmdResult> {
  const roots = resolveEvalRoots();
  if (!roots) {
    return { exitCode: 3, data: { error: "framework assets not found" }, lines: ["environment error: framework assets not found — run from the framework repo"] };
  }
  const benchmarks = loadBenchmarks(roots.benchmarksDir, opts.only);
  if (benchmarks.length === 0) {
    return { exitCode: 3, data: { error: "no benchmarks" }, lines: [`environment error: no benchmarks under ${roots.benchmarksDir}${opts.only ? ` matching "${opts.only}"` : ""}`] };
  }

  // --- list ---
  if (opts.mode === "list") {
    const rows = benchmarks.map((b) =>
      b.parse.ok
        ? `  ${b.parse.manifest.id.padEnd(18)} ${b.parse.manifest.kind.padEnd(12)} ${b.parse.manifest.title}`
        : `  ${b.name.padEnd(18)} INVALID      ${b.parse.errors.join("; ")}`,
    );
    return {
      exitCode: 0,
      data: { benchmarks: benchmarks.map((b) => (b.parse.ok ? b.parse.manifest : { name: b.name, errors: (b.parse as { errors: string[] }).errors })) },
      lines: [`benchmarks (${benchmarks.length}):`, ...rows],
    };
  }

  // --- run ---
  const sections: Array<{ title: string; checks: Check[]; skipped?: string }> = [];

  // Suite-level harness invariants (once).
  sections.push({ title: "harness invariants", checks: invariantChecks(readHarnessAssets(roots.harnessDir)) });

  // Per-benchmark static (+ optional live).
  for (const b of benchmarks) {
    const label = b.parse.ok ? `${b.parse.manifest.id} — ${b.parse.manifest.title}` : `${b.name} (INVALID)`;
    sections.push({ title: `static · ${label}`, checks: benchmarkChecks(b) });
    if (opts.live) {
      const live = await runLive(ctx, b, opts.repo);
      sections.push({ title: `live · ${label}`, checks: live.checks, ...(live.skipped ? { skipped: live.skipped } : {}) });
    }
  }

  // --- scorecard ---
  const lines: string[] = [`harness eval scorecard${opts.live ? " (static + live)" : " (static)"} — ${benchmarks.length} benchmark(s)`, ""];
  let failed = 0;
  let total = 0;
  for (const s of sections) {
    if (s.skipped) {
      lines.push(`  [skip] ${s.title}: ${s.skipped}`);
      continue;
    }
    const pass = s.checks.filter((c) => c.ok).length;
    const secFailed = s.checks.length - pass;
    failed += secFailed;
    total += s.checks.length;
    lines.push(`  [${secFailed === 0 ? "ok" : "FAIL"}] ${s.title}: ${pass}/${s.checks.length}`);
    for (const c of s.checks.filter((c) => !c.ok)) lines.push(`         ✗ ${c.name}: ${c.detail}`);
  }
  lines.push("", `RESULT: ${failed === 0 ? "PASS" : "FAIL"} — ${total - failed}/${total} checks green${failed ? `, ${failed} failing` : ""}`);

  return {
    exitCode: failed === 0 ? 0 : 1,
    data: {
      result: failed === 0 ? "PASS" : "FAIL",
      benchmarks: benchmarks.length,
      checks: { total, failed },
      sections: sections.map((s) => ({ title: s.title, ...(s.skipped ? { skipped: s.skipped } : { checks: s.checks }) })),
    },
    lines,
  };
}
