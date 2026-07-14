/**
 * Console configuration — resolved once at boot from the environment and the
 * target repo. The Console holds no other state; everything else is read live
 * from git + GitHub.
 */

import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { parse as parseYaml } from "yaml";

export interface Config {
  port: number;
  /** The Crucible consumer repo the Console operates on. */
  repoPath: string;
  /** GitHub "owner/repo" for the consumer repo, or null if not resolvable. */
  ghSlug: string | null;
  /** Owner PAT for the GitHub API (reads + reviews/labels/PRs). */
  githubToken: string | null;
  /** Subscription token for the spec-chat `claude` calls. */
  claudeToken: string | null;
  /** How to invoke the crucible CLI: ["node", "<dist>/index.js"]. */
  crucibleBin: string[];
}

function resolveGhSlug(repoPath: string): string | null {
  // Prefer crucible.yaml owner + repo dir name; fall back to the git remote.
  try {
    const url = execFileSync("git", ["-C", repoPath, "remote", "get-url", "origin"], {
      encoding: "utf8",
    }).trim();
    const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
    if (m) return `${m[1]}/${m[2]}`;
  } catch {
    /* no remote — Console still works read-only against the worktree */
  }
  return null;
}

function resolveCrucibleBin(): string[] {
  const require = createRequire(import.meta.url);
  // @crucible/cli exposes its entry via the "." export → dist/index.js.
  const entry = require.resolve("@crucible/cli");
  return ["node", entry];
}

/** Minimal .env loader (no dependency): populates process.env without overriding. */
function loadEnvFile(): void {
  for (const candidate of [join(process.cwd(), ".env"), join(process.cwd(), "console", ".env")]) {
    if (!existsSync(candidate)) continue;
    for (const line of readFileSync(candidate, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, "");
      }
    }
  }
}

export function loadConfig(): Config {
  loadEnvFile();
  const repoPath = resolve(process.env["CRUCIBLE_REPO"] ?? process.cwd());
  if (!existsSync(join(repoPath, "crucible.yaml"))) {
    // Not fatal — surface a clear boot warning; the board will render an empty state.
    console.warn(`[console] warning: no crucible.yaml at ${repoPath} (set CRUCIBLE_REPO)`);
  }
  let ghSlug = resolveGhSlug(repoPath);
  const manifestPath = join(repoPath, "crucible.yaml");
  if (existsSync(manifestPath)) {
    const manifest = parseYaml(readFileSync(manifestPath, "utf8")) as { owner?: string };
    if (!ghSlug && manifest.owner) ghSlug = `${manifest.owner}/${repoPath.split("/").pop()}`;
  }
  return {
    port: Number(process.env["CONSOLE_PORT"] ?? 7317),
    repoPath,
    ghSlug,
    githubToken: process.env["GITHUB_TOKEN"] ?? process.env["GH_TOKEN"] ?? null,
    claudeToken: process.env["CLAUDE_CODE_OAUTH_TOKEN"] ?? null,
    crucibleBin: resolveCrucibleBin(),
  };
}
