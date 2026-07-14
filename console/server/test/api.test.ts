import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { rmSync } from "node:fs";
import { createApp } from "../src/app.js";
import { makeFixture } from "./fixture.js";

const cfg = makeFixture();
const app = createApp(cfg);
afterAll(() => rmSync(cfg.repoPath, { recursive: true, force: true }));

describe("read endpoints", () => {
  it("health reports the repo and degraded github/claude", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.repo).toBe(cfg.repoPath);
    expect(res.body.github).toBe(false); // no token in fixture
  });

  it("board lists the fixture work order with parsed state", async () => {
    const res = await request(app).get("/api/workorders");
    expect(res.status).toBe(200);
    expect(res.body.workorders).toHaveLength(1);
    expect(res.body.workorders[0]).toMatchObject({ id: "DEMO-1", state: "ORACLES_APPROVED", escalated: false });
  });

  it("workorder detail includes history and runlog index", async () => {
    const res = await request(app).get("/api/workorders/DEMO-1");
    expect(res.status).toBe(200);
    expect(res.body.workorder.history).toHaveLength(4);
    expect(res.body.runlog).toEqual([]);
  });

  it("404s an unknown work order", async () => {
    expect((await request(app).get("/api/workorders/NOPE")).status).toBe(404);
  });

  it("change endpoint returns OpenSpec artifacts", async () => {
    const res = await request(app).get("/api/changes/greeting");
    expect(res.status).toBe(200);
    expect(res.body.oracles).toContain("Traceability Table");
    expect(res.body.specDeltas).toHaveLength(1);
  });

  it("traceability computes coverage via the shared core parsers", async () => {
    const res = await request(app).get("/api/traceability/greeting");
    expect(res.status).toBe(200);
    expect(res.body.unmapped).toEqual([]); // the one SHALL is covered
    expect(res.body.rows[0]).toMatchObject({ reqId: "REQ-G-1", status: "APPROVED", implExists: true });
    expect(res.body.rows[0].implSource).toContain("class GTest");
  });

  it("review-queue degrades cleanly without a github token", async () => {
    const res = await request(app).get("/api/review-queue");
    expect(res.status).toBe(200);
    expect(res.body.github).toBe(false);
    expect(res.body.queue).toEqual([]);
  });
});
