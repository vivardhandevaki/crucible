/**
 * GitHub read/remote helpers. Thin wrappers over Octokit; every call is
 * best-effort and degrades to a null/empty result so a token or network
 * problem renders as an inline degraded state, never a blank screen.
 */

import { Octokit } from "@octokit/rest";
import type { Config } from "../config.js";

/** The 11 required Gauntlet contexts, in board display order. */
export const GATE_CONTEXTS = [
  "gauntlet / legitimacy",
  "gauntlet / traceability",
  "gauntlet / diff-size",
  "java / build",
  "java / style",
  "java / archunit",
  "java / tests",
  "java / mutation",
  "java / sast",
  "review / reviewer-verdict",
  "java / deps",
] as const;

export interface PrSummary {
  number: number;
  state: string;
  title: string;
  url: string;
  headRef: string;
  labels: string[];
  checks: Record<string, "pass" | "fail" | "pending">;
  merged: boolean;
}

export class GitHub {
  private readonly kit: Octokit | null;
  private readonly owner: string | null;
  private readonly repo: string | null;

  constructor(cfg: Config) {
    const [owner, repo] = (cfg.ghSlug ?? "/").split("/");
    this.owner = owner || null;
    this.repo = repo || null;
    this.kit = cfg.githubToken ? new Octokit({ auth: cfg.githubToken }) : null;
  }

  get available(): boolean {
    return this.kit !== null && this.owner !== null && this.repo !== null;
  }

  private normalizeCheck(conclusion: string | null, status: string): "pass" | "fail" | "pending" {
    if (status !== "completed") return "pending";
    return conclusion === "success" || conclusion === "neutral" || conclusion === "skipped" ? "pass" : "fail";
  }

  /** All PRs (open + recently closed) keyed by head branch. */
  async prsByHeadRef(): Promise<Map<string, PrSummary>> {
    const out = new Map<string, PrSummary>();
    if (!this.available) return out;
    try {
      const prs = await this.kit!.paginate(this.kit!.pulls.list, {
        owner: this.owner!,
        repo: this.repo!,
        state: "all",
        per_page: 100,
      });
      for (const pr of prs) {
        const checks = await this.checksForRef(pr.head.sha);
        out.set(pr.head.ref, {
          number: pr.number,
          state: pr.state,
          title: pr.title,
          url: pr.html_url,
          headRef: pr.head.ref,
          labels: pr.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")).filter(Boolean),
          checks,
          merged: pr.merged_at !== null,
        });
      }
    } catch (err) {
      console.warn(`[console] github prsByHeadRef failed: ${(err as Error).message}`);
    }
    return out;
  }

  async checksForRef(sha: string): Promise<Record<string, "pass" | "fail" | "pending">> {
    const result: Record<string, "pass" | "fail" | "pending"> = {};
    if (!this.available) return result;
    try {
      const runs = await this.kit!.paginate(this.kit!.checks.listForRef, {
        owner: this.owner!,
        repo: this.repo!,
        ref: sha,
        per_page: 100,
      });
      for (const r of runs) {
        result[r.name] = this.normalizeCheck(r.conclusion, r.status);
      }
    } catch (err) {
      console.warn(`[console] github checksForRef failed: ${(err as Error).message}`);
    }
    return result;
  }

  async pr(number: number): Promise<PrSummary | null> {
    if (!this.available) return null;
    try {
      const { data: pr } = await this.kit!.pulls.get({ owner: this.owner!, repo: this.repo!, pull_number: number });
      const checks = await this.checksForRef(pr.head.sha);
      return {
        number: pr.number,
        state: pr.state,
        title: pr.title,
        url: pr.html_url,
        headRef: pr.head.ref,
        labels: pr.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")).filter(Boolean),
        checks,
        merged: pr.merged_at !== null,
      };
    } catch {
      return null;
    }
  }

  async prDiff(number: number): Promise<string | null> {
    if (!this.available) return null;
    try {
      const res = await this.kit!.pulls.get({
        owner: this.owner!,
        repo: this.repo!,
        pull_number: number,
        mediaType: { format: "diff" },
      });
      return res.data as unknown as string;
    } catch {
      return null;
    }
  }

  async prBodyText(number: number): Promise<string> {
    if (!this.available) return "";
    try {
      const { data } = await this.kit!.pulls.get({ owner: this.owner!, repo: this.repo!, pull_number: number });
      return data.body ?? "";
    } catch {
      return "";
    }
  }

  /** PRs the router sent to a human: any risk:* label, open. */
  async reviewQueue(): Promise<PrSummary[]> {
    const all = await this.prsByHeadRef();
    return [...all.values()].filter((p) => p.state === "open" && p.labels.some((l) => l.startsWith("risk:")));
  }

  async submitReview(number: number, event: "APPROVE" | "REQUEST_CHANGES", body: string): Promise<void> {
    if (!this.available) throw new Error("GitHub not configured (set GITHUB_TOKEN)");
    await this.kit!.pulls.createReview({
      owner: this.owner!,
      repo: this.repo!,
      pull_number: number,
      event,
      body: body || (event === "APPROVE" ? "Approved via Crucible Console." : "Changes requested via Crucible Console."),
    });
  }

  /** The reviewer agent posts its verdict as a PR comment ("## Reviewer verdict"). */
  async reviewerVerdict(number: number): Promise<string | null> {
    if (!this.available) return null;
    try {
      const comments = await this.kit!.paginate(this.kit!.issues.listComments, {
        owner: this.owner!, repo: this.repo!, issue_number: number, per_page: 100,
      });
      const hit = [...comments].reverse().find((c) => (c.body ?? "").startsWith("## Reviewer verdict"));
      return hit?.body ?? null;
    } catch {
      return null;
    }
  }

  async defaultBranch(): Promise<string> {
    if (!this.available) return "main";
    const { data } = await this.kit!.repos.get({ owner: this.owner!, repo: this.repo! });
    return data.default_branch;
  }

  /**
   * Create a branch off the default branch carrying `files`, and open a PR.
   * Approvals to protected paths (openspec/specs, /oracles) travel this way, so
   * CODEOWNERS + branch protection still apply — the Console adds no authority.
   */
  async createCommitPr(opts: {
    branch: string;
    title: string;
    body: string;
    message: string;
    files: Array<{ path: string; content: string }>;
  }): Promise<{ number: number; url: string }> {
    if (!this.available) throw new Error("GitHub not configured (set GITHUB_TOKEN)");
    const owner = this.owner!;
    const repo = this.repo!;
    const base = await this.defaultBranch();
    const { data: baseRef } = await this.kit!.git.getRef({ owner, repo, ref: `heads/${base}` });
    const baseSha = baseRef.object.sha;
    const { data: baseCommit } = await this.kit!.git.getCommit({ owner, repo, commit_sha: baseSha });

    const tree = await Promise.all(
      opts.files.map(async (f) => {
        const { data: blob } = await this.kit!.git.createBlob({ owner, repo, content: f.content, encoding: "utf-8" });
        return { path: f.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
      }),
    );
    const { data: newTree } = await this.kit!.git.createTree({ owner, repo, base_tree: baseCommit.tree.sha, tree });
    const { data: commit } = await this.kit!.git.createCommit({
      owner, repo, message: opts.message, tree: newTree.sha, parents: [baseSha],
    });
    await this.kit!.git.createRef({ owner, repo, ref: `refs/heads/${opts.branch}`, sha: commit.sha });
    const { data: pr } = await this.kit!.pulls.create({
      owner, repo, head: opts.branch, base, title: opts.title, body: opts.body,
    });
    return { number: pr.number, url: pr.html_url };
  }
}
