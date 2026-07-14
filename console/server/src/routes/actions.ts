/**
 * Action routes — every write goes through the CLI shell-out, the approval-PR
 * flow, or the GitHub review API. No route touches the repo filesystem directly.
 * Each response echoes the terminal-equivalent command for the ⌘ popover.
 */

import { Router } from "express";
import type { Config } from "../config.js";
import type { GitHub } from "../lib/github.js";
import { runCli } from "../actions/cli.js";
import { startRun } from "../actions/run.js";
import { approveSpec, approveOracles } from "../actions/approve.js";

export function actionRoutes(cfg: Config, gh: GitHub): Router {
  const r = Router();

  // crucible new <id> --title <t> --change <slug>
  r.post("/workorders", async (req, res) => {
    const { id, title, change } = req.body ?? {};
    if (!id || !title || !change) return res.status(400).json({ error: "id, title, change are required" });
    const result = await runCli(cfg, ["new", id, "--title", title, "--change", change]);
    res.status(result.ok ? 201 : 422).json(result);
  });

  r.post("/workorders/:id/validate", async (req, res) => {
    const args = ["validate", req.params.id];
    if (req.body?.advance) args.push("--advance");
    if (req.body?.to) args.push("--to", req.body.to);
    res.json(await runCli(cfg, args));
  });

  r.post("/workorders/:id/package", async (req, res) => {
    res.json(await runCli(cfg, ["package", req.params.id]));
  });

  // Detached — the run outlives the Console.
  r.post("/workorders/:id/run", (req, res) => {
    res.json(startRun(cfg, req.params.id));
  });

  r.post("/approve/spec/:slug", async (req, res) => {
    try {
      res.status(201).json({ ...(await approveSpec(cfg, gh, req.params.slug, { specMarkdown: req.body?.specMarkdown })), command: `git checkout -b spec/${req.params.slug} && gh pr create` });
    } catch (err) {
      res.status(422).json({ error: (err as Error).message });
    }
  });

  r.post("/approve/oracles/:slug", async (req, res) => {
    try {
      res.status(201).json({ ...(await approveOracles(cfg, gh, req.params.slug)), command: `git checkout -b oracles/${req.params.slug} && gh pr create` });
    } catch (err) {
      res.status(422).json({ error: (err as Error).message });
    }
  });

  r.post("/review/:pr/:decision", async (req, res) => {
    const decision = req.params.decision === "approve" ? "APPROVE" : "REQUEST_CHANGES";
    try {
      await gh.submitReview(Number(req.params.pr), decision, req.body?.body ?? "");
      res.json({ ok: true, command: `gh pr review ${req.params.pr} --${req.params.decision === "approve" ? "approve" : "request-changes"}` });
    } catch (err) {
      res.status(422).json({ error: (err as Error).message });
    }
  });

  return r;
}
