/**
 * Boot the Console server on localhost only. No exposure surface — the Console
 * is an owner's-machine instrument, not a hosted service.
 */

import { loadConfig } from "./config.js";
import { createApp } from "./app.js";

const cfg = loadConfig();
const app = createApp(cfg);

// Bind localhost by default. In a container, HOST=0.0.0.0 while the compose port
// mapping (127.0.0.1:7317:7317) keeps exposure to the host's loopback only.
const host = process.env["HOST"] ?? "127.0.0.1";
app.listen(cfg.port, host, () => {
  console.log(`[console] http://localhost:${cfg.port}  repo=${cfg.repoPath}  github=${cfg.ghSlug ?? "off"}`);
});
