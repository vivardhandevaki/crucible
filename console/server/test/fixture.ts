/** Build a throwaway Crucible consumer repo on disk for server tests. */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../src/config.js";

export function makeFixture(): Config {
  const root = mkdtempSync(join(tmpdir(), "console-fix-"));
  writeFileSync(join(root, "crucible.yaml"), 'crucible_version: "0.2.1"\nlanguage: java\nowner: "tester"\n');

  const woDir = join(root, "workorders", "DEMO-1-greeting");
  mkdirSync(woDir, { recursive: true });
  writeFileSync(join(woDir, "workorder.yaml"), [
    "id: DEMO-1", "title: Demo greeting", "state: ORACLES_APPROVED",
    "change: openspec/changes/greeting/",
    "oracles:", "  - ORA-G-1a",
    "modules_allowed:", "  - src/app",
    "paths_forbidden: [oracles/, openspec/specs/, openspec/schemas/, ci/, .github/, settings/, CLAUDE.md]",
    "max_diff_lines: 400", "max_iterations: 6", "pr_sequence: []", "escalation: null",
    "history:",
    "  - state: DRAFT_SPEC", "    at: 2026-07-14T01:00:00Z", "    by: o",
    "  - state: SPEC_APPROVED", "    at: 2026-07-14T02:00:00Z", "    by: o",
    "  - state: ORACLES_AUTHORED", "    at: 2026-07-14T03:00:00Z", "    by: o",
    "  - state: ORACLES_APPROVED", "    at: 2026-07-14T04:00:00Z", "    by: o",
    "",
  ].join("\n"));

  const specDir = join(root, "openspec", "changes", "greeting", "specs", "hello");
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, "spec.md"), [
    "# Greeting", "", "## ADDED Requirements", "",
    "### Requirement: Personalised greeting",
    "The system SHALL return a greeting for a non-blank name.", "",
    "#### Scenario: greets", "- **WHEN** greet(\"Ada\")", "- **THEN** \"Hello, Ada!\"", "",
  ].join("\n"));

  const changeDir = join(root, "openspec", "changes", "greeting");
  writeFileSync(join(changeDir, "oracles.md"), [
    "# Oracle Map — greeting", "", "## Traceability Table", "",
    "| REQ ID | Requirement (verbatim SHALL/MUST) | Oracle ID(s) | Oracle Type | Implementation Path | Status |",
    "|---|---|---|---|---|---|",
    "| REQ-G-1 | Personalised greeting | ORA-G-1a | property | oracles/contracts/GTest.java | APPROVED |",
    "",
  ].join("\n"));
  writeFileSync(join(changeDir, "tasks.md"), "# Tasks\n\n## Task 1\nImplement it.\n");

  const oracleDir = join(root, "oracles", "contracts");
  mkdirSync(oracleDir, { recursive: true });
  writeFileSync(join(oracleDir, "GTest.java"), "class GTest {}\n");

  return {
    port: 0,
    repoPath: root,
    ghSlug: null,
    githubToken: null,
    claudeToken: null,
    crucibleBin: ["node", "-e", "process.exit(0)"],
  };
}
