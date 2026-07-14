/**
 * crucible run <ID> — execute the implementer agent in a sandbox.
 *
 * The loop lives HERE (deterministic code), never in the agent:
 *   1. preconditions: PACKAGED (or PR_OPEN/IMPLEMENTING for a new attempt),
 *      bundle present, docker present, CLAUDE_CODE_OAUTH_TOKEN available
 *   2. fresh clone of the consumer repo -> work branch wo/<ID>
 *   3. render prompt + permission settings; run the pinned toolchain container
 *      with the bundle mounted read-only; capture the full transcript
 *   4. outcome: escalation.md -> ESCALATED · commits -> runner pushes branch
 *      and opens the PR (the agent never does) -> PR_OPEN · neither -> report
 *
 * Auth: the agent runs under the operator's Claude subscription via a
 * CLAUDE_CODE_OAUTH_TOKEN (minted once with `claude setup-token`), passed into
 * the container. No pay-as-you-go API key is involved.
 *
 * v1 honesty notes: the container runs on the default docker network (the
 * agent needs to reach Anthropic's servers; an egress-allowlist proxy is a
 * hardening follow-up). Iteration budget maps to --max-turns via TURNS_PER_ITERATION.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import type { CmdContext, CmdResult } from "../lib/context.js";
import { loadWorkorder, saveWorkorder } from "../lib/workorders.js";
import { resolveAssets } from "../lib/assets.js";
import type { Workorder } from "../core/workorder.js";

const TURNS_PER_ITERATION = 25;

function oauthToken(cwd: string): string | null {
  if (process.env["CLAUDE_CODE_OAUTH_TOKEN"]) return process.env["CLAUDE_CODE_OAUTH_TOKEN"];
  const envFile = join(cwd, ".env");
  if (!existsSync(envFile)) return null;
  const m = readFileSync(envFile, "utf8").match(/^CLAUDE_CODE_OAUTH_TOKEN=(.+)$/m);
  return m?.[1]?.trim() ?? null;
}

function render(template: string, wo: Workorder, woDirRel: string): string {
  return template
    .replaceAll("{{ID}}", wo.id)
    .replaceAll("{{TITLE}}", wo.title)
    .replaceAll("{{CHANGE_DIR}}", wo.change)
    .replaceAll("{{WORKORDER_DIR}}", `${woDirRel}/`)
    .replaceAll("{{MODULES_ALLOWED}}", wo.modules_allowed.join(", "))
    .replaceAll("{{MAX_ITERATIONS}}", String(wo.max_iterations))
    .replaceAll("{{MAX_DIFF_LINES}}", String(wo.max_diff_lines));
}

export async function cmdRun(ctx: CmdContext, id: string): Promise<CmdResult> {
  // --- Preconditions ---
  const loaded = loadWorkorder(ctx.cwd, id);
  if (!loaded || !loaded.result.ok) {
    return { exitCode: loaded ? 1 : 2, data: { error: `work order ${id} missing or invalid` }, lines: [`error: work order ${id} missing or invalid`] };
  }
  const wo = loaded.result.workorder;
  if (!["PACKAGED", "PR_OPEN", "IMPLEMENTING"].includes(wo.state)) {
    return { exitCode: 2, data: { error: `state ${wo.state}` }, lines: [`error: state is ${wo.state} — run requires PACKAGED (or PR_OPEN/IMPLEMENTING for a new attempt)`] };
  }
  const bundle = join(loaded.dir, "bundle");
  if (!existsSync(join(bundle, "bundle.yaml"))) {
    return { exitCode: 2, data: { error: "bundle missing" }, lines: [`error: no bundle — run: crucible package ${id}`] };
  }
  const token = oauthToken(ctx.cwd);
  if (!token) {
    return { exitCode: 3, data: { error: "CLAUDE_CODE_OAUTH_TOKEN not set" }, lines: ["environment error: CLAUDE_CODE_OAUTH_TOKEN not set (env or .env) — run `claude setup-token`"] };
  }
  if (!(await ctx.exec("docker", ["--version"])).ok) {
    return { exitCode: 3, data: { error: "docker unavailable" }, lines: ["environment error: docker unavailable"] };
  }
  const assets = resolveAssets();
  if (!assets) {
    return { exitCode: 3, data: { error: "framework assets not found" }, lines: ["environment error: framework assets not found"] };
  }
  const manifest = parseYaml(readFileSync(join(ctx.cwd, "crucible.yaml"), "utf8")) as { toolchain_image?: string };
  const image = manifest.toolchain_image ?? "ghcr.io/vivardhandevaki/crucible-toolchain:0.1.0";

  // --- Attempt directory ---
  const woDirRel = relative(ctx.cwd, loaded.dir);
  let attempt = 1;
  while (existsSync(join(loaded.dir, "runlog", `attempt-${attempt}`))) attempt++;
  const runlog = join(loaded.dir, "runlog", `attempt-${attempt}`);
  const workspace = join(runlog, "workspace");
  mkdirSync(runlog, { recursive: true });
  writeFileSync(join(runlog, ".gitignore"), "workspace/\n"); // transcript is committed; the clone is not

  // --- Fresh clone + work branch ---
  const branch = `wo/${wo.id}`;
  if (!(await ctx.exec("git", ["clone", "--quiet", ctx.cwd, workspace])).ok) {
    return { exitCode: 3, data: { error: "clone failed" }, lines: ["environment error: workspace clone failed"] };
  }
  await ctx.exec("git", ["-C", workspace, "checkout", "-qb", branch]);
  const baseSha = (await ctx.exec("git", ["-C", workspace, "rev-parse", "HEAD"])).stdout.trim();

  // --- Render harness inputs ---
  const harnessRoot = join(assets.scaffoldDir, "..", "..");
  const prompt = render(readFileSync(join(harnessRoot, "prompts", "implementer.md"), "utf8"), wo, woDirRel);
  const settings = render(readFileSync(join(harnessRoot, "sandbox", "claude-settings.template.json"), "utf8"), wo, woDirRel)
    .replace(/^\s*"_comment".*\n/m, "");
  writeFileSync(join(runlog, "prompt.md"), prompt);
  writeFileSync(join(runlog, "settings.json"), settings);

  // --- Record IMPLEMENTING (PACKAGED/PR_OPEN -> IMPLEMENTING is a legal edge) ---
  if (wo.state !== "IMPLEMENTING") {
    wo.history.push({ state: "IMPLEMENTING", at: ctx.now(), by: `crucible run (attempt ${attempt})` });
    wo.state = "IMPLEMENTING";
    saveWorkorder(loaded.dir, wo);
  }

  // --- The sandbox run ---
  const maxTurns = wo.max_iterations * TURNS_PER_ITERATION;
  const started = ctx.now();
  const result = await ctx.exec("docker", [
    "run", "--rm",
    "-v", `${workspace}:/workspace`,
    "-v", `${bundle}:/bundle:ro`,
    "-v", `${join(runlog, "prompt.md")}:/sandbox/prompt.md:ro`,
    "-v", `${join(runlog, "settings.json")}:/sandbox/settings.json:ro`,
    "-e", `CLAUDE_CODE_OAUTH_TOKEN=${token}`,
    "-w", "/workspace",
    image,
    "bash", "-c",
    `claude -p "$(cat /sandbox/prompt.md)" --settings /sandbox/settings.json --max-turns ${maxTurns} --output-format stream-json --verbose`,
  ]);
  writeFileSync(join(runlog, "transcript.jsonl"), result.stdout);
  writeFileSync(join(runlog, "meta.yaml"), [
    `attempt: ${attempt}`, `started: "${started}"`, `finished: "${ctx.now()}"`,
    `base_sha: ${baseSha}`, `max_turns: ${maxTurns}`, `agent_exit_ok: ${result.ok}`, "",
  ].join("\n"));

  // --- Outcome: escalation beats everything ---
  const escInWorkspace = join(workspace, woDirRel, "escalation.md");
  if (existsSync(escInWorkspace)) {
    cpSync(escInWorkspace, join(loaded.dir, "escalation.md"));
    wo.history.push({ state: "ESCALATED", at: ctx.now(), by: "implementer agent" });
    wo.state = "ESCALATED";
    wo.escalation = { file: "escalation.md", created_at: ctx.now() };
    saveWorkorder(loaded.dir, wo);
    return {
      exitCode: 0,
      data: { outcome: "escalated", attempt, runlog },
      lines: [`agent ESCALATED — see: crucible escalations`, `transcript: ${runlog}/transcript.jsonl`],
    };
  }

  // --- Outcome: commits -> the RUNNER pushes and opens the PR ---
  const count = Number((await ctx.exec("git", ["-C", workspace, "rev-list", "--count", `${baseSha}..HEAD`])).stdout.trim() || "0");
  if (count > 0) {
    await ctx.exec("git", ["-C", workspace, "push", "--quiet", "origin", `${branch}:${branch}`]); // clone origin = consumer repo
    await ctx.exec("git", ["push", "--quiet", "origin", branch]); // consumer -> GitHub
    const body = `## Crucible\n- Work-Order-ID: ${wo.id}\n- PR-Sequence:\n\n## Summary\n${wo.title} (attempt ${attempt}, ${count} commit(s) by the implementer agent)\n`;
    const pr = await ctx.exec("gh", ["pr", "create", "--head", branch, "--title", `${wo.id}: ${wo.title}`, "--body", body, "--label", "crucible", "--label", `wo:${wo.id}`]);
    wo.history.push({ state: "PR_OPEN", at: ctx.now(), by: "crucible run" });
    wo.state = "PR_OPEN";
    saveWorkorder(loaded.dir, wo);
    return {
      exitCode: 0,
      data: { outcome: "pr-open", attempt, commits: count, pr: pr.stdout.trim() },
      lines: [`agent produced ${count} commit(s); PR opened: ${pr.stdout.trim()}`, `the Gauntlet takes it from here`],
    };
  }

  return {
    exitCode: 2,
    data: { outcome: "no-progress", attempt, runlog },
    lines: [
      `agent made no commits and did not escalate (exit ok: ${result.ok})`,
      `state stays IMPLEMENTING — inspect ${runlog}/transcript.jsonl, then re-run or escalate manually`,
    ],
  };
}
