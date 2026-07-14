/**
 * The three §5.4 doctrine guarantees, as tests. If any fails, the Console has
 * stopped being a safe view/remote-control over git+GitHub.
 */

import { describe, expect, it, afterAll } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import request from "supertest";
import { createApp } from "../src/app.js";
import { startRun } from "../src/actions/run.js";
import { makeFixture } from "./fixture.js";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const cfg = makeFixture();
afterAll(() => rmSync(cfg.repoPath, { recursive: true, force: true }));

describe("§5.4 guarantee 1 — no repo writes off the read path", () => {
  // The read layer and read/stream routes must never call fs write APIs.
  const readPathFiles = [
    "read/workorders.ts", "read/artifacts.ts", "routes/read.ts", "routes/stream.ts", "lib/github.ts",
  ];
  const WRITE_APIS = /\b(writeFileSync|writeFile|appendFile\w*|mkdirSync|rmSync|unlink\w*|rename\w*|createWriteStream)\b/;
  for (const f of readPathFiles) {
    it(`${f} performs no filesystem writes`, () => {
      const src = readFileSync(join(srcDir, f), "utf8");
      expect(WRITE_APIS.test(src), `${f} must not write to the filesystem`).toBe(false);
    });
  }
});

describe("§5.4 guarantee 2 — no state survives a restart", () => {
  it("two fresh app instances render the identical board", async () => {
    const a = await request(createApp(cfg)).get("/api/workorders");
    const b = await request(createApp(cfg)).get("/api/workorders"); // simulate a restart
    expect(b.body).toEqual(a.body);
  });
});

describe("§5.4 guarantee 3 — a run is decoupled from the Console process", () => {
  it("the runner is spawned detached and unref'd", () => {
    const runSrc = readFileSync(join(srcDir, "actions", "run.ts"), "utf8");
    expect(runSrc).toMatch(/detached:\s*true/);
    expect(runSrc).toMatch(/\.unref\(\)/);
  });

  it("startRun launches without blocking on the run", () => {
    const r = startRun(cfg, "DEMO-1"); // crucibleBin is a trivial node stub in the fixture
    expect(r.started).toBe(true);
    expect(r.command).toBe("crucible run DEMO-1");
  });
});
