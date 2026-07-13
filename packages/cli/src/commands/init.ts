/**
 * crucible init --owner <gh-handle> [--lang java]
 *
 * Turns the current repo into a Crucible-governed consumer project:
 *   1. openspec init (Claude tooling, non-interactive)
 *   2. install the oracle-driven schema + set it as the project default
 *   3. copy the project scaffold (CODEOWNERS w/ owner token, PR template,
 *      branch-protection ruleset + applier, dir skeleton)
 *   4. write crucible.yaml (framework version, language profile, toolchain pin)
 *
 * Existing files are never overwritten; each is reported and skipped.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { CmdContext, CmdResult } from "../lib/context.js";
import { resolveAssets } from "../lib/assets.js";

export const SUPPORTED_LANGS = ["java"] as const;
const TOOLCHAIN_IMAGE = "ghcr.io/vivardhandevaki/crucible-toolchain:0.1.0";
const CONSUMER_DIRS = [
  "workorders",
  "oracles/properties",
  "oracles/contracts",
  "oracles/constraints",
  "oracles/arch",
  "src",
];

function copyScaffold(scaffoldDir: string, cwd: string, owner: string): { copied: string[]; skipped: string[] } {
  const copied: string[] = [];
  const skipped: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const src = join(dir, entry.name);
      const rel = relative(scaffoldDir, src);
      if (entry.isDirectory()) {
        walk(src);
        continue;
      }
      if (entry.name === ".gitkeep" || rel === "README.md") continue; // scaffold docs stay in the framework
      const dest = join(cwd, rel);
      if (existsSync(dest)) {
        skipped.push(rel);
        continue;
      }
      mkdirSync(join(dest, ".."), { recursive: true });
      const content = readFileSync(src, "utf8").replaceAll("{{OWNER}}", `@${owner.replace(/^@/, "")}`);
      writeFileSync(dest, content, { mode: entry.name.endsWith(".sh") ? 0o755 : 0o644 });
      copied.push(rel);
    }
  };
  walk(scaffoldDir);
  return { copied, skipped };
}

export async function cmdInit(
  ctx: CmdContext,
  opts: { owner: string; lang: string },
): Promise<CmdResult> {
  if (!(SUPPORTED_LANGS as readonly string[]).includes(opts.lang)) {
    return {
      exitCode: 1,
      data: { error: `unsupported language profile '${opts.lang}'`, supported: SUPPORTED_LANGS },
      lines: [`error: unsupported language profile '${opts.lang}' (supported: ${SUPPORTED_LANGS.join(", ")})`],
    };
  }
  if (existsSync(join(ctx.cwd, "crucible.yaml"))) {
    return { exitCode: 2, data: { error: "crucible.yaml already exists" }, lines: ["error: this repo is already Crucible-initialized (crucible.yaml exists)"] };
  }
  if (!existsSync(join(ctx.cwd, ".git"))) {
    return { exitCode: 2, data: { error: "not a git repository" }, lines: ["error: run inside a git repository (git init first)"] };
  }
  const assets = resolveAssets();
  if (!assets) {
    return { exitCode: 3, data: { error: "framework assets not found" }, lines: ["environment error: cannot locate oracle-driven schema / project scaffold assets"] };
  }

  const lines: string[] = [];

  // 1. openspec init (skip when already initialized — idempotent re-runs).
  if (existsSync(join(ctx.cwd, "openspec", "config.yaml"))) {
    lines.push("openspec: already initialized — skipped");
  } else {
    const r = await ctx.exec("openspec", ["init", "--tools", "claude", "--force"]);
    if (!r.ok) {
      return { exitCode: 3, data: { error: "openspec init failed", stderr: r.stderr }, lines: [`environment error: openspec init failed: ${r.stderr.trim()}`] };
    }
    lines.push("openspec: initialized (tools: claude)");
  }

  // 2. Install the oracle-driven schema and make it the project default.
  const schemaDest = join(ctx.cwd, "openspec", "schemas", "oracle-driven");
  if (existsSync(schemaDest)) {
    lines.push("schema: openspec/schemas/oracle-driven already present — skipped");
  } else {
    cpSync(assets.schemaDir, schemaDest, { recursive: true });
    lines.push("schema: installed oracle-driven (proposal → specs → design → oracles → tasks)");
  }
  const configPath = join(ctx.cwd, "openspec", "config.yaml");
  if (existsSync(configPath)) {
    const config = readFileSync(configPath, "utf8");
    if (/^schema:/m.test(config)) {
      writeFileSync(configPath, config.replace(/^schema:.*$/m, "schema: oracle-driven"));
    } else {
      writeFileSync(configPath, `schema: oracle-driven\n${config}`);
    }
    lines.push("schema: set as project default in openspec/config.yaml");
  }

  // 3. Project scaffold (never overwrites).
  const { copied, skipped } = copyScaffold(assets.scaffoldDir, ctx.cwd, opts.owner);
  lines.push(`scaffold: copied ${copied.length} file(s)${skipped.length ? `, skipped ${skipped.length} existing` : ""}`);
  for (const d of CONSUMER_DIRS) mkdirSync(join(ctx.cwd, d), { recursive: true });
  lines.push(`dirs: ${CONSUMER_DIRS.join(", ")}`);

  // 4. crucible.yaml — the consumer's framework manifest.
  writeFileSync(
    join(ctx.cwd, "crucible.yaml"),
    [
      "# Crucible consumer manifest — created by `crucible init`. Do not hand-edit state here;",
      "# work orders live in workorders/. See https://github.com/vivardhandevaki/crucible",
      `crucible_version: "0.1.0"`,
      `language: ${opts.lang}`,
      `toolchain_image: ${TOOLCHAIN_IMAGE}`,
      `owner: "${opts.owner.replace(/^@/, "")}"`,
      `initialized_at: "${ctx.now()}"`,
      "",
    ].join("\n"),
  );
  lines.push("crucible.yaml: written");

  lines.push(
    "",
    "next steps:",
    "  1. review + commit the scaffold, push to GitHub",
    "  2. apply branch protection: settings/apply.sh",
    "  3. start your first feature: crucible new <ID> --title <t> --change <slug>",
  );
  return { exitCode: 0, data: { copied, skipped, lang: opts.lang }, lines };
}
