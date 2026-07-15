# Backlog

Deferred, non-blocking work. Newest items at the top of each section. Keep entries
short: what, why, and any pointer. Promote to an issue/PR when picked up.
Gaps are measured against the finished-state reference in [NORTHSTAR.md](NORTHSTAR.md).

## Operational / setup

- **NVD API key for CVE scans.** Obtain a free key (https://nvd.nist.gov/developers/request-an-api-key)
  and set it as the `NVD_API_KEY` repo secret on each Crucible project. Without it the
  OWASP dependency-check NVD download is slow (tens of minutes) whenever it runs — the
  `java / cve` PR job (dependency-changing PRs only) and the weekly `cve-scan.yml` on
  `main`. Not required (both work keyless, just slow). Surfaced during the Phase 4 drill.

- **Publish the GHCR toolchain image.** `write:packages` token was never obtainable, so
  Java CI runs on pinned `setup-java`/`setup-gradle` instead of `crucible-toolchain`.
  Publishing the image makes CI a drop-in container swap and guarantees local/CI parity.
  See `toolchain/` and the v1 note in `.github/workflows/gauntlet-java.yml`.

## Framework hardening

- **Console: Package and record-advance actions missing from the UI.** The server
  exposes `POST /workorders/:id/package` and `validate` with `advance`/`to`, and the
  web client has `api.packageWo` + `validate(id, {advance})` — but **no screen calls
  either**. The Run Monitor renders only a non-advancing Validate and Start
  Implementation, so `ORACLES_APPROVED → PACKAGED` (and every CLI-advanceable
  transition) is impossible from the Console; the docs/site claim a Package button
  that doesn't exist. Add Package + "record transition" buttons to the Run Monitor
  (gate them on the validation report being green). Surfaced during the end-to-end
  review. See `console/web/src/screens/RunMonitor.tsx`, `console/web/src/lib/api.ts`,
  `console/server/src/routes/actions.ts`.

- **Console never syncs the local worktree.** Every Console read (board, artifacts,
  traceability) and every CLI shell-out (`validate`'s `git cat-file main:<path>`)
  reads the **local checkout**, but approvals merge on GitHub via the API — so after
  merging a spec/oracle PR the Console shows stale content and `validate` fails until
  the user runs `git pull` in a terminal. A console-only flow needs the server to
  fetch/pull (or read from `origin/main`) after detecting a merged approval PR —
  natural to build together with the record-transitions item below. See
  `console/server/src/read/*.ts`, `console/server/src/actions/approve.ts`,
  `packages/cli/src/commands/validate.ts`.

- **No Console path for planning artifacts (design.md / tasks.md), and the spec chat
  is not an OpenSpec session.** `crucible package` requires `tasks.md` in the change
  folder, but nothing in the Console can create it: the spec chat is a plain
  `claude -p` drafting prompt (no `/opsx` commands, no repo writes — contrary to
  Walkthrough 1 step 4, which should be corrected), and Approve Spec commits only the
  drafted delta plus files already on disk. Extend the chat flow (or add a
  "complete planning artifacts" action) to draft `proposal.md`/`design.md`/`tasks.md`
  and include them in an approval PR. See `console/server/src/actions/specChat.ts`,
  `console/server/src/actions/approve.ts`, `CRUCIBLE-USAGE-WALKTHROUGHS.md`.

- **Post-merge states are never recorded.** No machinery advances a manifest past
  `PR_OPEN`: the implementation PR merges with the work order still `PR_OPEN`, and
  `MERGED`/`CANARY`/`DONE`/`ARCHIVED` are unreachable in `workorder.yaml` (the Board's
  later columns only ever light up via PR metadata; `crucible status` never shows
  them; `/opsx:archive` doesn't touch the manifest). Add a recorder — a small
  post-merge workflow or a Console/CLI action (`crucible archive <id>`) — that walks
  the remaining edges with the append-only history intact. See
  `packages/cli/src/core/states.ts`, `packages/cli/src/commands/run.ts`,
  `console/server/src/read/workorders.ts`.

- **Escalation resolution flow in the Console is a stub.** The Run Monitor's
  "Resolve via spec change →" button just navigates to `/new` (a blank new-work-order
  form) — it doesn't amend the existing change, doesn't offer the
  `validate --to SPEC_APPROVED|ORACLES_APPROVED|PACKAGED` resolution edges, and loses
  the escalation context. Build the resolve path: open the spec/oracle chat scoped to
  the escalated change, then record the chosen resolution transition. See
  `console/web/src/screens/RunMonitor.tsx`, `packages/cli/src/commands/validate.ts`.

- **Sandbox egress allowlist.** The sandbox container runs on the default Docker
  network (the agent must reach Anthropic's API), so "network off" is currently
  aspiration, not fact — acknowledged in the `crucible run` header as a v1 honesty
  note. Add an egress-allowlist proxy (model API + artifact mirror only) so the
  hermetic-sandbox claim (D-10) holds structurally. See
  `packages/cli/src/commands/run.ts`, `toolchain/`.

- **Escalation notifications.** The walkthroughs promise "a notification fires
  (GitHub issue + your configured channel)" on escalation; nothing is implemented —
  the escalation is only visible in the Run Monitor card or `crucible escalations`.
  Either implement a minimal notifier (e.g. `gh issue create` from the runner) or
  soften the docs. See `packages/cli/src/commands/run.ts`,
  `CRUCIBLE-USAGE-WALKTHROUGHS.md`.

- **Version-string drift.** The CLI hardcodes `.version("0.1.0")` and writes
  `crucible_version: "0.1.0"` into consumer `crucible.yaml`, while releases are
  tagged `v0.2.1` (`CRUCIBLE_REF`) and all three `package.json`s still say `0.1.0`.
  Single-source the version (read `package.json`; bump on release) so
  `crucible --version`, the manifest, and the pinned workflow ref agree. See
  `packages/cli/src/index.ts`, `packages/cli/src/commands/init.ts`.

- **Oracle-authoring chat in the Console (agreed; implement together).** The Console drafts
  the spec via a chat (New Feature) but has no equivalent for oracles, so after `SPEC_APPROVED`
  the Oracle Review screen is an empty "No oracle map" state with no way forward. Add an
  oracle-drafting chat mirroring spec-chat, living on the Oracle Review empty state: an
  optional description box + "ask the agent to author the oracles," streamed like spec-chat.
  **Scope (chosen): draft the full oracles artifact — `oracles.md` map AND the oracle
  implementation files under `/oracles/`** — so it unblocks the `ORACLES_APPROVED` gate
  end-to-end (map-only would reference non-existent impls and stall at validate). Approach:
  `claude -p` emits `oracles.md` plus each impl file in a delimited multi-file format; the
  Console parses them into a file set, shows them for review, and Approve Oracles commits all
  of them in one PR (same stateless commit-via-PR path). Mirror the spec-chat plumbing:
  `console/server/src/actions/specChat.ts` → an `oracleChat` action, a `/oracle-chat` route in
  `console/server/src/routes/stream.ts`, `approveOracles` extended to accept drafted files
  (like `approveSpec`'s `specMarkdown`), and the chat UI in
  `console/web/src/screens/OracleReview.tsx`. Surfaced during the first end-to-end run.

- **Console doesn't record state transitions after an approval PR merges.** After the
  spec (or oracle) PR is merged, the work order stays `DRAFT_SPEC` because the transition
  is only recorded by `crucible validate <id> --advance` — and the Console, being stateless,
  never runs it and exposes no button for it. So the Board sits on the old state and the
  user is silently stuck until they run the CLI in a terminal. Fix: have the Console detect
  the merged approval PR and run `validate --advance` (or expose a "Record spec/oracle
  approval" action) so the pipeline advances without dropping to the CLI. Surfaced right
  after merging the first spec PR (TODO-2 stuck at `DRAFT_SPEC`). See
  `console/server/src/actions/approve.ts`, `console/server/src/read/workorders.ts`,
  `packages/cli/src/commands/validate.ts`.

- **Governance-PR gates are noisy (spec/oracle approvals show red).** The Console's
  Approve Spec / Approve Oracles PRs touch protected paths and are merged by the owner via
  the ruleset bypass, but all four implementation gates (`legitimacy`, `traceability`,
  `diff-size`, `reviewer-verdict`) go RED on them — there is no `Work-Order-ID` in the PR
  body and the work order is still `DRAFT_SPEC`, so the gates reject by construction.
  Merging then relies on owner bypass, leaving four red checks on every governance PR.
  Cleaner: have the Console label approval PRs (e.g. `spec-approval`/`harness-change`) *and*
  teach the gates to treat labeled / spec-only PRs as neutral-green, so governance PRs pass
  honestly instead of via bypass. Surfaced during the first end-to-end Console run (PR #1).
  See `console/server/src/actions/approve.ts` + `packages/cli/src/gates/{legitimacy,traceability,diffsize}.ts`.

- **Cache NVD data in the `cve` job.** Skipped `actions/cache` for the NVD DB to avoid a
  wrong pinned-SHA break; add it (keyed weekly) so the scan is fast on repeat runs even
  keyless. `.github/workflows/gauntlet-java.yml` (`cve` job).

- **Sync the framework-root `settings/apply.sh`** with the consumer template version
  (enforced-checks-by-default + labels + workflow-perms + auto-merge). Only the consumer
  scaffold copy was updated in v0.2.1.

- **Console UI smoke test (Playwright).** The server has integration + §5.4 guarantee
  tests, but there is no browser-level test that the five screens render and keyboard
  nav works. Add a Playwright smoke against a mocked API. `console/web`.

- **Live run-log streaming for the Console.** `crucible run` buffers the sandbox output
  and writes `transcript.jsonl` at the end, so the Run Monitor's log pane only fills once
  the run finishes. For true live logs, stream the container output to a growing file the
  Console can tail. `packages/cli/src/commands/run.ts` + `console/server`.

- **Verify the sandbox permission-matcher assumptions** against future Claude Code
  releases. v0.2.1 relies on empirically-observed behaviour: trailing-glob (`src/**`,
  `workorders/**`) matches new-file writes; a leading `**/<file>` does not; `Edit(**/x)`
  matches existing files. If a release changes this, escalation/tasks writes could break.
  See the `_comment` in `sandbox/claude-settings.template.json`.
