/**
 * Assemble the Console server. Exported separately from boot so tests can drive
 * it in-process. Stateless: the app closes over config only; every request reads
 * live from git + GitHub.
 */

import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.js";
import { GitHub } from "./lib/github.js";
import { readRoutes } from "./routes/read.js";
import { actionRoutes } from "./routes/actions.js";
import { streamRoutes } from "./routes/stream.js";

export function createApp(cfg: Config): Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const gh = new GitHub(cfg);

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      repo: cfg.repoPath,
      github: gh.available,
      githubSlug: cfg.ghSlug,
      claude: cfg.claudeToken !== null,
    });
  });

  app.use("/api", streamRoutes(cfg)); // SSE first (own headers)
  app.use("/api", readRoutes(cfg, gh));
  app.use("/api", actionRoutes(cfg, gh));

  // Production: serve the built SPA (console/web/dist). Dev uses Vite + proxy.
  const webDist = new URL("../../web/dist", import.meta.url).pathname;
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (_req, res) => res.sendFile(join(webDist, "index.html")));
  }

  // Structured error handler — never a blank 500.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message, hint: "The Console is stateless — a restart is always safe." });
  });

  return app;
}
