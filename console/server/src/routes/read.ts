/**
 * Read routes — pure views over git + GitHub. No writes happen here (enforced
 * by the no-fs-write negative-guarantee test over routes/).
 */

import { Router } from "express";
import type { Config } from "../config.js";
import type { GitHub } from "../lib/github.js";
import { readBoard, readDetail } from "../read/workorders.js";
import { readChange, readTraceability } from "../read/artifacts.js";

export function readRoutes(cfg: Config, gh: GitHub): Router {
  const r = Router();

  r.get("/workorders", async (_req, res) => {
    res.json({ workorders: await readBoard(cfg, gh), github: gh.available });
  });

  r.get("/workorders/:id", async (req, res) => {
    const detail = await readDetail(cfg, gh, req.params.id);
    if (!detail) return res.status(404).json({ error: `work order ${req.params.id} not found` });
    res.json(detail);
  });

  r.get("/changes/:slug", (req, res) => {
    const change = readChange(cfg, req.params.slug);
    if (!change) return res.status(404).json({ error: `change ${req.params.slug} not found` });
    res.json(change);
  });

  r.get("/traceability/:slug", (req, res) => {
    const trace = readTraceability(cfg, req.params.slug);
    if (!trace) return res.status(404).json({ error: `no oracles.md for ${req.params.slug}` });
    res.json(trace);
  });

  r.get("/review-queue", async (_req, res) => {
    if (!gh.available) return res.json({ queue: [], github: false, hint: "Set GITHUB_TOKEN to load the review queue." });
    res.json({ queue: await gh.reviewQueue(), github: true });
  });

  r.get("/review/:pr", async (req, res) => {
    const number = Number(req.params.pr);
    const pr = await gh.pr(number);
    if (!pr) return res.status(404).json({ error: `PR #${number} not found` });
    const [diff, body, verdict] = await Promise.all([gh.prDiff(number), gh.prBodyText(number), gh.reviewerVerdict(number)]);
    res.json({ pr, diff, body, verdict });
  });

  return r;
}
