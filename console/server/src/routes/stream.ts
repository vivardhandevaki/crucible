/**
 * SSE routes: the run log (tails the runlog transcript the detached runner
 * writes) and the spec-drafting chat (streams `claude`). Both are read-only
 * with respect to the repo.
 */

import { Router } from "express";
import type { Config } from "../config.js";
import { runSnapshot } from "../actions/run.js";
import { streamSpecChat, type ChatTurn } from "../actions/specChat.js";

function sseHeaders(res: import("express").Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

function send(res: import("express").Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function streamRoutes(cfg: Config): Router {
  const r = Router();

  // Tail the latest run attempt's transcript; emit new lines + a done event.
  r.get("/workorders/:id/runlog/stream", (req, res) => {
    sseHeaders(res);
    let sent = 0;
    const tick = (): void => {
      const snap = runSnapshot(cfg, req.params.id, sent);
      if (snap.attempt) {
        for (const line of snap.transcriptLines) send(res, "log", { line });
        sent += snap.transcriptLines.length;
        if (snap.finished) {
          send(res, "done", { attempt: snap.attempt, meta: snap.meta });
          clearInterval(timer);
          res.end();
        }
      } else {
        send(res, "waiting", { id: req.params.id });
      }
    };
    const timer = setInterval(tick, 1500);
    tick();
    req.on("close", () => clearInterval(timer));
  });

  // Stream a spec-drafting turn from `claude`.
  r.post("/spec-chat", (req, res) => {
    sseHeaders(res);
    const turns = (req.body?.turns ?? []) as ChatTurn[];
    const cancel = streamSpecChat(
      cfg,
      turns,
      (text) => send(res, "chunk", { text }),
      (err) => {
        if (err) send(res, "error", { message: err });
        else send(res, "done", {});
        res.end();
      },
    );
    req.on("close", cancel);
  });

  return r;
}
