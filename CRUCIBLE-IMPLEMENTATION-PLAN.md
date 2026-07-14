# Crucible — Implementation Plan

**Version:** 1.0
**Status:** Ready to execute
**Audience:** Claude Code (primary executor) and the system owner (reviewer of every line in Phases 0–4; see Review Discipline below).
**Companion document:** `CRUCIBLE-CONCEPT.md` — read it first. It defines all terminology (work order, oracle, Gauntlet, harness, ratchet, Console), the ten core principles, the state machine, and the decision log. This plan does not restate rationale; when in doubt about *why*, consult the concept doc. When in doubt about *what to do when the concept doc is silent*, apply Core Principles §4 of the concept doc, then escalate to the owner.

---

## 0. How to Execute This Plan

### 0.1 Ground rules for the executing agent

1. **Phases are ordered and gated.** Do not begin phase N+1 until phase N's acceptance criteria (each phase's final section) all pass and the owner has approved.
2. **Everything is a PR.** Even during bootstrap, work lands via branches and PRs once branch protection exists (Phase 0 step 4 onward). No direct pushes to `main`.
3. **Review discipline:** Phases 0–4 build the trusted computing base (harness + Gauntlet). The owner reviews **every line** of these phases. Phase 5 (Console) and later are fed through the Crucible loop itself as its first real work orders.
4. **Small PRs:** ≤400 changed lines per PR throughout this plan. Propose a PR sequence at the start of any phase.
5. **Pin everything:** every tool, plugin, action, base image, and npm/Gradle dependency gets an exact version. No `latest`, no version ranges.
6. **When blocked or when this plan is ambiguous/contradictory:** stop and write a structured escalation (format in §4.6) rather than improvising. Ambiguity is a plan bug.
7. **Naming:** use the glossary terms from the concept doc exactly. The manifest file is `workorder.yaml`, never `task.yaml`.

### 0.2 Deliverable overview by phase

| Phase | Deliverable | Owner review mode |
|---|---|---|
| 0 | Repo skeleton, governance (CODEOWNERS, branch protection, PR template), pinned toolchain image | Line-by-line |
| 1 | OpenSpec integration: pinned install, `oracle-driven` schema fork, oracle template, config | Line-by-line |
| 2 | `workorder.yaml` schema + `crucible` CLI v1 | Line-by-line |
| 3 | The Gauntlet: full CI workflow with all gates, incl. traceability linter and legitimacy check | Line-by-line |
| 4 | Harness: CLAUDE.md, skills, prompt templates, sandbox runner, reviewer rubric + CI job, routing | Line-by-line |
| 5 | Crucible Console (web app) | Via the Crucible loop (Console is the shakedown project) |
| 6 | Pipeline eval suite + calibration protocol | Line-by-line (small) |
| 7 | Runtime layer interfaces (canary/rollback/postmortem) | Line-by-line (mostly config) |

### 0.3 Technology stack (pinned decisions — do not relitigate)

| Concern | Choice | Notes |
|---|---|---|
| Target-system language | Java 21 (LTS) | Gradle (Kotlin DSL), single monorepo |
| Test stack | JUnit 5, jqwik (property tests), ArchUnit | Contract tests generated from OpenAPI specs |
| Mutation testing | PIT via gradle plugin | Changed-code scope; threshold starts 75% |
| SAST | Semgrep (pinned version) | Java ruleset + `/ci/semgrep/custom.yml` |
| Dependency scanning | OWASP dependency-check Gradle plugin | Plus `/ci/dependency-allowlist.yml` policy |
| Static analysis | Error Prone + Checkstyle + Spotless | Fail-on-warning in CI |
| SDD framework | OpenSpec (OPSX), version pinned | Custom schema `oracle-driven` |
| CI/CD platform | GitHub Actions + branch protection + CODEOWNERS | Enforcement primitives per D-02 |
| Agent runtime | Claude Code (headless `claude -p` for automation) | Permission config denies protected paths |
| `crucible` CLI | Node.js 22 LTS + TypeScript, distributed as a local package in `/harness/cli` | Chosen over Java for glue-script ergonomics and shared language with the Console; ~500 lines |
| Console backend | Node.js 22 + Express + TypeScript, stateless | Reads git + GitHub REST API (Octokit); triggers CLI / workflow_dispatch |
| Console frontend | React 18 + Vite + TypeScript | No component-library dependency beyond headless primitives; styling per §5.5 |
| Container | Docker; single `crucible-toolchain` image used locally, in CI, and in sandboxes | Dockerfile in `/harness/toolchain/` |
| Secrets | Local `.env` (gitignored) for owner PAT + `CLAUDE_CODE_OAUTH_TOKEN` (Claude subscription, via `claude setup-token`); GitHub Actions secrets in CI | Never in repo |

---

## Phase 0 — Repository Skeleton & Governance

### 0.A Directory layout (create exactly this)

```
/
├── .github/
│   ├── CODEOWNERS
│   ├── pull_request_template.md
│   └── workflows/
│       ├── gauntlet.yml            # Phase 3
│       ├── reviewer.yml            # Phase 4
│       └── crucible-run.yml        # Phase 4 (workflow_dispatch sandbox runner)
├── openspec/                       # Phase 1 (OpenSpec init + schema fork)
├── specs/                          # living specs (OpenSpec archive target) — PROTECTED
├── oracles/                        # oracle implementations — PROTECTED
│   ├── properties/                 # jqwik property tests (Gradle module `oracles`)
│   ├── contracts/                  # contract test definitions
│   ├── constraints/                # SQL/Liquibase constraint definitions
│   └── arch/                       # ArchUnit rules (part of `oracles` module)
├── workorders/                     # one dir per work order
├── harness/                        # PROTECTED
│   ├── cli/                        # the `crucible` CLI (Phase 2)
│   ├── prompts/                    # per-state prompt templates (Phase 4)
│   ├── rubric/                     # reviewer rubric + verdict schema (Phase 4)
│   ├── sandbox/                    # runner scripts + Claude Code settings (Phase 4)
│   ├── toolchain/                  # Dockerfile + pinned versions manifest
│   └── evals/                      # pipeline eval suite (Phase 6)
├── ci/                             # PROTECTED — gate configs & scripts
│   ├── scripts/                    # traceability-lint, legitimacy-check, diff-size, routing
│   ├── semgrep/custom.yml
│   └── dependency-allowlist.yml
├── console/                        # Phase 5 web app
│   ├── server/
│   └── web/
├── src/                            # target-system Java code (Gradle multi-module)
├── skills/                         # Claude Code skills — PROTECTED
├── settings/                       # branch-protection-as-code (see 0.C)
├── CLAUDE.md                       # Phase 4
├── settings.gradle.kts / build.gradle.kts
└── README.md
```

### 0.B Governance files

**`.github/CODEOWNERS`** — protected paths owned exclusively by the owner's GitHub handle (placeholder `@OWNER`, replace at bootstrap):

```
/specs/      @OWNER
/oracles/    @OWNER
/harness/    @OWNER
/ci/         @OWNER
/skills/     @OWNER
/openspec/schemas/  @OWNER
/.github/    @OWNER
CLAUDE.md    @OWNER
```

**`pull_request_template.md`** — must contain a machine-parseable block the legitimacy check reads:

```
## Crucible
- Work-Order-ID: <required, e.g. OMS-142>
- PR-Sequence: <n of m, if part of a decomposed sequence>
```

### 0.C Branch protection (as code)

Store the desired configuration in `settings/branch-protection.json` and apply it with a small script `settings/apply.sh` using `gh api` (so the config is versioned and re-appliable). Required settings for `main`:

- Require PRs; no direct pushes; no force pushes; no deletions.
- Required status checks (exact names; the Gauntlet jobs in Phase 3 must emit these): `build`, `style`, `archunit`, `tests`, `mutation`, `sast`, `deps`, `traceability`, `diff-size`, `legitimacy`, `reviewer-verdict`.
- Require CODEOWNERS review for protected paths.
- Enforce for admins: **true** (the owner must not be able to bypass — D-02).

Note: some checks won't exist until Phases 3–4; apply the config incrementally per phase, with the full list active by end of Phase 4.

### 0.D Toolchain image

`/harness/toolchain/Dockerfile`: base `eclipse-temurin:21-jdk` (pinned digest), plus pinned: Gradle, Node 22, OpenSpec CLI, Semgrep, git, gh CLI, Claude Code. Also `/harness/toolchain/versions.lock.md` — a human-readable manifest of every pinned version, updated only via reviewed PRs. Build and tag `crucible-toolchain:<version>`; CI and sandbox both reference the tag, never `latest`.

### Phase 0 acceptance criteria

1. Repo layout exists exactly as specified; empty dirs have `.gitkeep`.
2. Branch protection active; a test PR from a non-owner context cannot merge without checks (verify with a dummy required check).
3. A direct push to `main` is rejected; a PR touching `/oracles/` cannot merge without owner review.
4. `docker build` of the toolchain image succeeds; `versions.lock.md` matches the image contents.

---

## Phase 1 — OpenSpec Integration

### 1.1 Install & pin

`openspec init` in the repo with Claude Code as the configured tool; pin the OpenSpec version in the toolchain image and in `versions.lock.md`. Select the **expanded** profile (needed for `/opsx:verify`).

### 1.2 Fork the schema

Run `openspec schema fork spec-driven oracle-driven`, then edit `openspec/schemas/oracle-driven/schema.yaml` to exactly:

```yaml
name: oracle-driven
artifacts:
  - id: proposal
    generates: proposal.md
    requires: []
  - id: specs
    generates: specs/**/*.md
    requires: [proposal]
  - id: design
    generates: design.md
    requires: [proposal]
  - id: oracles
    generates: oracles.md
    requires: [specs]
  - id: tasks
    generates: tasks.md
    requires: [specs, design, oracles]
```

Validate with `openspec schema validate oracle-driven`. Set the project default schema to `oracle-driven` in OpenSpec's project config so every `/opsx:new` / `/opsx:propose` uses it.

### 1.3 The `oracles` artifact template

Create the template at the schema's template path for `oracles` with this required structure (the agent drafting `oracles.md` must follow it exactly; the traceability linter in Phase 3 parses this format):

```markdown
# Oracle Map — <change-name>

## Traceability Table
| REQ ID | Requirement (verbatim SHALL/MUST line) | Oracle ID(s) | Oracle Type | Implementation Path | Status |
|--------|----------------------------------------|--------------|-------------|--------------------|--------|
| REQ-<CHANGE>-1 | ... | ORA-<CHANGE>-1a | property | oracles/properties/... | DRAFT |

Rules encoded in the template's instruction block:
1. Every SHALL/MUST in this change's spec deltas MUST have a row. No row → the change cannot proceed (CI-enforced).
2. Oracle Type ∈ {property, example, contract, db-constraint, archunit, ci-check}.
3. Prefer `property` over `example` wherever the requirement quantifies over inputs.
4. Requirements that resist automation must be either (a) sharpened until checkable, (b) explicitly downgraded to guidance (moved out of SHALL/MUST), or (c) typed `human-audit` with justification — never silently unmapped.
5. Oracle IDs are stable and unique: ORA-<CHANGE>-<n><letter>.
6. Draft oracle implementations under /oracles/** on a branch; they require owner approval to merge (CODEOWNERS). Status column: DRAFT → IMPLEMENTED → APPROVED (approved = merged to main under /oracles).
7. Do NOT modify existing files under /oracles; additions only, unless the owner explicitly directs otherwise in the proposal.
```

### 1.4 Policy line

Add to the (future) CLAUDE.md content list (Phase 4): "All changes use the `oracle-driven` schema. Never edit `/specs`, `/oracles`, `/ci`, `/harness`, `/skills` on implementation branches. Archive (`/opsx:archive`) only after all associated PRs are MERGED."

### Phase 1 acceptance criteria

1. `openspec schema validate oracle-driven` passes; `openspec templates --schema oracle-driven` resolves an `oracles` template.
2. A dry-run change (`/opsx:new demo-change` → `/opsx:continue` repeatedly) produces artifacts in order and reports `tasks` BLOCKED until `oracles.md` exists; then delete the demo change.
3. OpenSpec version appears in `versions.lock.md` and the toolchain image.

---

## Phase 2 — `workorder.yaml` & the `crucible` CLI

### 2.1 `workorder.yaml` schema

Create `/harness/cli/schema/workorder.schema.json` (JSON Schema draft 2020-12) enforcing:

```yaml
# Example instance — /workorders/OMS-142-partial-cancellation/workorder.yaml
id: OMS-142                        # ^[A-Z]+-\d+$
title: Partial cancellation of orders
state: ORACLES_APPROVED            # enum: DRAFT_SPEC | SPEC_APPROVED | ORACLES_AUTHORED |
                                   #   ORACLES_APPROVED | PACKAGED | IMPLEMENTING | PR_OPEN |
                                   #   GATES_GREEN | AI_REVIEWED | ROUTED_AUTO | ROUTED_HUMAN |
                                   #   MERGED | CANARY | DONE | ARCHIVED | ESCALATED
change: openspec/changes/partial-cancellation/   # must exist
oracles: [ORA-PC-1a, ORA-PC-1b, ORA-PC-2a, ORA-PC-4a, ORA-PC-5a, ORA-PC-5b]
modules_allowed: [src/order-core, src/refund-service, src/order-api]
paths_forbidden: [specs/, oracles/, ci/, harness/, skills/, openspec/schemas/, .github/]
max_diff_lines: 400
max_iterations: 6
pr_sequence: []                    # optional: planned decomposition, list of {n, scope}
escalation: null                   # or {file: escalation.md, created_at: ...}
history: []                        # append-only [{state, at, by}] — audit trail
```

`paths_forbidden` defaults are injected by the CLI and cannot be removed (schema: must be a superset of the protected list).

### 2.2 CLI commands (TypeScript, `/harness/cli`, binary name `crucible`)

Implement with a proper arg parser, exit codes (0 ok, 1 validation failure, 2 precondition failure, 3 environment failure), `--json` output mode on every command, and unit tests for every precondition branch.

| Command | Behavior |
|---|---|
| `crucible new <ID> --title <t> --change <slug>` | Scaffolds `/workorders/<ID>-<slug>/workorder.yaml` in DRAFT_SPEC (from template); refuses if ID exists. Does NOT create the OpenSpec change (that happens in chat via `/opsx:new`); it records the linkage. |
| `crucible validate <ID>` | Runs the full precondition chain for the *next* transition: schema-validate workorder; check OpenSpec artifact states via `openspec` CLI (`--json`); for ORACLES_APPROVED, additionally verify every oracle ID resolves to a file merged on `main` under `/oracles` (git check, not filesystem check). Prints a precondition report; advances `state` only if all pass and `--advance` given. |
| `crucible package <ID>` | Precondition: state ≥ ORACLES_APPROVED. Assembles the implementation context bundle: spec deltas, oracles.md, oracle file paths, module map, constraints, relevant skills list → writes `/workorders/<ID>/bundle/` (gitignored). Sets state PACKAGED. |
| `crucible run <ID>` | Precondition: PACKAGED. Invokes the sandbox runner (Phase 4) with the bundle; enforces `max_iterations`; on completion collects the branch and opens the PR via `gh` with labels `crucible`, `wo:<ID>`; sets IMPLEMENTING → PR_OPEN. On agent escalation: writes/validates `escalation.md`, sets ESCALATED, notifies (Phase 4 hook). |
| `crucible status [<ID>]` | Table (or `--json`) of all work orders: state, PR, check summary (via `gh api`), age, escalations. This is the terminal fallback for the Console board. |
| `crucible escalations` | Lists open escalations with their structured content. |
| `crucible audit --sample 0.1` | Selects a deterministic-seeded random sample of auto-merged PRs since last audit for human review; records the audit in the work-order history. |

**Critical design note (D-02):** the CLI *advances* state; it never *enforces* it. All refusals here are convenience-layer. The authoritative enforcement is Phase 3's CI checks, which must reject illegitimate PRs even if the CLI was bypassed entirely.

### Phase 2 acceptance criteria

1. JSON Schema validates the example above; mutation of any required field fails validation with a precise error.
2. Each command's precondition failures produce exit code 2 and actionable messages; unit test coverage of every branch; the CLI test suite runs in CI.
3. `crucible validate` correctly distinguishes "oracles.md exists" (OpenSpec DONE) from "oracle implementations merged to main" (Crucible APPROVED) — test both states.
4. Bypass drill: hand-edit `state:` to skip a step; `crucible validate` flags history/state inconsistency (history is append-only; states must advance along legal edges).

---

## Phase 3 — The Gauntlet (CI)

One workflow `.github/workflows/gauntlet.yml` triggered on `pull_request`, with the following jobs. Every job name must exactly match the required-status-check names from Phase 0.C. All tool versions pinned; all jobs run in the `crucible-toolchain` image.

### 3.1 Jobs

1. **`build`** — Gradle build with Error Prone enabled, warnings as errors.
2. **`style`** — Spotless check + Checkstyle (config in `/ci/`), zero tolerance.
3. **`archunit`** — runs the `oracles/arch` test module. Starter rules (implement these five):
   - Layered architecture: `api` → `service` → `domain` → `persistence`; no reverse or skip dependencies.
   - No field injection (constructor injection only).
   - Domain state mutation only via designated state-machine classes (annotation-driven: `@StateMutator`).
   - No class outside `persistence` imports `javax.sql`/JDBC directly.
   - No usage of `java.util.Date`/`Calendar` (java.time only).
4. **`tests`** — full unit + property + contract suite, including everything under `/oracles`. jqwik property tests run with a fixed seed in CI (repeatability) and a rotating seed in a scheduled nightly job (exploration); nightly failures file issues, not merge blocks.
5. **`mutation`** — PIT scoped to changed code (diff-aware), threshold **75%** initially; the threshold value lives in `/ci/gates.yml` so ratcheting it (→85%) is a reviewed one-line PR.
6. **`sast`** — Semgrep with pinned ruleset + `/ci/semgrep/custom.yml`. Starter custom rules: no `Runtime.exec`/`ProcessBuilder` outside `/harness`; no string-concatenated SQL; no `System.getenv` outside a designated config package; no logging of fields named like PII (`email`, `phone`, `ssn`, `address`) — a heuristic rule, tune during calibration.
7. **`deps`** — OWASP dependency-check (fail on CVSS ≥ 7) **plus** allowlist check: every coordinate in the dependency graph must appear in `/ci/dependency-allowlist.yml` (group-level entries allowed). New dependency = PR to the allowlist = owner review by CODEOWNERS.
8. **`traceability`** — `/ci/scripts/traceability-lint.ts`. Algorithm:
   a. For each active OpenSpec change referenced by an open work order: parse spec deltas for lines/headers containing SHALL/MUST (reuse OpenSpec's requirement header conventions).
   b. Parse `oracles.md` table; verify every requirement has ≥1 row; verify every Oracle ID's `Implementation Path` exists **on the PR's merge ref** for status ≥ IMPLEMENTED, and on `main` for APPROVED.
   c. Verify oracle IDs referenced in `workorder.yaml` ⊆ IDs in `oracles.md`.
   d. Any violation → fail with a table of unmapped requirements / dangling IDs.
9. **`diff-size`** — changed lines (adds+deletes, excluding lockfiles and generated dirs listed in `/ci/gates.yml`) ≤ `max_diff_lines` from the work order.
10. **`legitimacy`** — `/ci/scripts/legitimacy-check.ts`:
    a. PR body contains a valid `Work-Order-ID`; the work order exists and its state ∈ {IMPLEMENTING, PR_OPEN, GATES_GREEN, AI_REVIEWED, ROUTED_*} (i.e., a legal state for having an open PR).
    b. Every touched path is inside `modules_allowed` ∪ {`workorders/<ID>/`} and outside `paths_forbidden`. **Exception mechanism:** PRs labeled `harness-change` skip the module-map check but then *require* CODEOWNERS review by construction (they touch protected paths) — this is how Phases 0–4 and future harness PRs flow through the same pipeline.
    c. `workorder.yaml` history is append-only relative to the merge base.
11. **`reviewer-verdict`** — defined in Phase 4; reserved name here.

### 3.2 Routing script

`/ci/scripts/route.ts`, run as a post-Gauntlet job (not a required check itself; it *applies labels/reviewers*):

- Inputs: diff paths, `review-verdict.json`, risk list from `/ci/risk-paths.yml` (initial list: `**/auth/**`, `**/payment/**`, `**/refund/**`, `**/*Migration*`, `**/api/**` public-surface dirs, `ci/dependency-allowlist.yml`, anything concurrency-annotated `@ThreadSafe`/`synchronized` in the diff hunks).
- All clear → apply `auto-merge` label + enable GitHub auto-merge. Any hit → request owner review + label `risk:<category>`.
- Deterministic, zero model calls, unit-tested with fixture diffs.

### Phase 3 acceptance criteria

1. A fixture PR violating each gate (one per gate, 11 fixtures) fails exactly that gate with an actionable message; a clean fixture passes all.
2. Bypass drill (the important one): a hand-crafted branch pushed without the CLI, PR opened manually with no work order → `legitimacy` fails → merge impossible. A PR touching `/oracles` without owner approval cannot merge.
3. PIT and full Gauntlet complete in acceptable wall time on the fixture repo (< 15 min); document measured times.
4. Threshold/config changes require PRs to `/ci/` (CODEOWNERS-verified).

---

## Phase 4 — The Harness

### 4.1 CLAUDE.md (repo root; owner-reviewed word by word)

Contents (write it, don't just outline): project purpose (1 para, link to concept doc); the glossary terms; the operating rule ("no code without a work order; no work order without approved oracles"); the `oracle-driven` schema policy line from Phase 1.4; forbidden actions (protected paths; never weaken/delete a test or assertion — propose via escalation instead; never add a dependency outside the allowlist; never disable or bypass a gate); how to build/test locally (exact Gradle commands); the escalation protocol (§4.6); code conventions pointer to the skill.

### 4.2 Skills (in `/skills`, each a SKILL.md per Claude Code conventions)

1. **`java-conventions`** — package layout, error-handling policy (no swallowed exceptions; domain errors as sealed types), constructor injection, immutability defaults, money handling (`BigDecimal` + the rounding policy class), logging rules (no PII, structured), how to run the relevant test subset fast.
2. **`writing-oracles`** — how to draft each oracle type in this repo: jqwik generators and idioms, contract tests from OpenAPI, Liquibase constraint changesets, ArchUnit rule style; the oracles.md table format; the APPROVED-via-merge lifecycle.
3. **`escalation-protocol`** — when and how to stop (see §4.6).

### 4.3 Prompt templates (`/harness/prompts/`)

- `implementer.md` — parameterized by the bundle: "You are executing work order {ID} in state IMPLEMENTING. Inputs: spec deltas, oracle map, oracle implementations (read-only), module map, constraints. Your job ends when the local test suite (including oracles) passes, or you write a valid escalation.md, or you exhaust {max_iterations} iterations. You do not open PRs, advance states, or decide next steps. Work through tasks.md; keep the checklist current."
- `spec-drafting.md` — the Console's chat-panel system prompt: adversarial edge-case surfacing, SHALL/MUST discipline, never finalizes (the human approves).
- `reviewer.md` — see §4.5.

### 4.4 Sandbox runner (`/harness/sandbox/run.sh` + `crucible-run.yml` workflow_dispatch)

Fresh container from `crucible-toolchain:<pinned>`; fresh clone at the work-order branch point; mount bundle read-only; network policy: deny-all except the artifact mirror (document how: Docker network + proxy allowlist); Claude Code invoked headless with `/harness/sandbox/claude-settings.json` (allowed tools: file edit, Gradle test runs, git commit on the work branch; denied: protected paths, `gh`, network tools); iteration budget enforced by the runner (count agent turns / test-run cycles); on success, runner pushes branch + opens PR via `gh` with template fields filled; full transcript archived to `/workorders/<ID>/runlog/attempt-<n>/`. The runner runs either locally (owner's machine) or via the `crucible-run.yml` dispatch — identical behavior, one code path.

### 4.5 Reviewer agent (`.github/workflows/reviewer.yml` → required check `reviewer-verdict`)

- Inputs: the diff, the spec deltas, oracles.md, the rubric. **Never** the implementer's transcript or reasoning (D-09).
- Rubric v1 (`/harness/rubric/rubric.yml`) — each item: id, question, required evidence form. Initial items:
  R1 unvalidated input reaching query/command/path/deserialization (cite lines or "none found");
  R2 test files touched — any assertion weakened, deleted, or made vacuous;
  R3 new dependencies or version changes — list + justification check against allowlist PR;
  R4 touched paths vs the change's apparent intent — scope creep;
  R5 loops/recursion whose bound is data- or attacker-controlled;
  R6 secrets, tokens, or PII in code or log statements;
  R7 concurrency: shared mutable state, check-then-act races, transaction boundary vs the spec's atomicity requirements;
  R8 error handling: swallowed exceptions, catch-and-continue on integrity-relevant paths;
  R9 semantic drift: behavior changed adjacent to but outside the spec delta;
  R10 diff should be split (approaching size cap or mixing concerns).
- Output contract: `review-verdict.json` — `{rubric_version, items: [{id, verdict: PASS|FLAG|FAIL, evidence}], overall: PASS|FLAG|FAIL}`. FAIL blocks (red check); FLAG passes the check but forces the human route in routing; verdict JSON is schema-validated — malformed output = FAIL (fail-closed).
- The workflow posts the verdict as both a status check and a PR comment (human-readable table).

### 4.6 Escalation protocol (format shared by CLAUDE.md, skill, and CLI validation)

`escalation.md` required fields: work-order ID; blocking requirement/oracle IDs; precise description of the ambiguity/contradiction/impossibility; 2–3 concrete resolution options with trade-offs; what was attempted (iterations used). The runner validates structure; `crucible escalations` surfaces it; a webhook (simple: GitHub issue creation + optional Slack/email via Actions) notifies the owner. Resolution is a spec/oracle PR; the work order then re-enters at the appropriate earlier state via `crucible validate --advance`.

### Phase 4 acceptance criteria

1. End-to-end dry run on a toy feature in `src/` (e.g., a `money-utils` function with 2 SHALLs): spec → oracles → approval → package → run → PR → full Gauntlet → reviewer verdict → routed. Owner performs every human step through the terminal only.
2. Sandbox tamper drill: instruct a test agent (via a deliberately adversarial toy work order) to modify an oracle and to add a non-allowlisted dependency; verify permission denial in-sandbox AND gate failure if it somehow lands in the diff.
3. Escalation drill: a toy work order with contradictory SHALLs produces a valid `escalation.md` and stops before exhausting the budget.
4. Reviewer fail-closed drill: corrupt verdict JSON → check red.

---

## Phase 5 — Crucible Console

**This phase is executed through the Crucible loop itself**: each screen below becomes an OpenSpec change with oracles (yes — write property/contract oracles for the Console's API surface, and at minimum example-based oracles + a Playwright smoke oracle for the UI), a work order, and Gauntlet-gated PRs (add a `console-build`+`console-tests` job pair to the Gauntlet, path-filtered to `/console`). The Console is the shakedown cruise; expect and welcome friction — every friction point is a harness PR.

### 5.1 Architecture (restating the doctrine as constraints)

- **Stateless server.** No database, no persistent server-side state, no queues. Sources of truth: local git worktree (read via simple-git) + GitHub REST API (Octokit, owner PAT from `.env`). Writes happen only as: (a) shell-out to `crucible` CLI, (b) GitHub API calls that create PRs/reviews/labels, (c) `workflow_dispatch` triggers.
- **Local-first.** `npm run console` starts server (port 7317) + Vite dev server; production mode = single `node server` serving built assets. Also a `docker compose up console` path using the toolchain image. Binds to localhost only.
- **Fallback doctrine as a feature.** Every Console action's equivalent terminal command is displayed in the UI (a small `⌘` popover per action: "Terminal: `crucible run OMS-142`"). This keeps the fallback path exercised and documented automatically.
- **Failure containment.** GitHub API errors render as inline degraded states, never blank screens; git-read errors fall back to "open in terminal" hints; the server has no state to corrupt, so restart is always safe.

### 5.2 Server API (Express, all JSON, all thin)

```
GET  /api/workorders                 # scan /workorders/*/workorder.yaml + GH PR/check status
GET  /api/workorders/:id             # full detail incl. history, escalation, runlog index
GET  /api/changes/:slug              # OpenSpec artifacts (proposal, specs, design, oracles.md, tasks.md)
GET  /api/traceability/:slug         # parsed oracle map + per-row resolution status (reuses the linter's parser — share the module)
POST /api/workorders                 # → crucible new
POST /api/workorders/:id/validate    # → crucible validate [--advance]
POST /api/workorders/:id/package     # → crucible package
POST /api/workorders/:id/run         # → crucible run (or workflow_dispatch) ; SSE log stream at
GET  /api/workorders/:id/runlog/stream
POST /api/spec-chat                  # proxy to Anthropic API with spec-drafting.md prompt (streaming)
POST /api/approve/spec/:slug         # branch + commit + PR to protected path, on owner's behalf
POST /api/approve/oracles/:slug      # same mechanism for /oracles files
GET  /api/review-queue               # PRs labeled risk:* awaiting owner
POST /api/review/:pr/approve|request-changes
```

Shared code rule: the traceability parser, workorder schema, and state-machine edge definitions live in one shared TS package (`/harness/cli/src/core`) imported by CLI, CI scripts, and Console server — one implementation of the truth.

### 5.3 Screens

1. **Board** (`/`) — columns by state; cards show ID, title, PR + check dots (11 gates as a compact dot row), age, escalation badge. Click → detail. Auto-refresh 30s + manual.
2. **New Feature** (`/new`) — minimal form (ID, title, slug) → creates work order; then split view: left = streaming spec chat; right = live-rendered spec delta markdown with SHALL/MUST lines highlighted. Footer: **Approve Spec** (disabled until ≥1 SHALL exists) → opens the approval PR and links to it.
3. **Oracle Review** (`/wo/:id/oracles`) — the traceability table with resolution status per row (unmapped SHALLs in red at top); click a row → oracle source rendered inline (read from the branch); **Approve Oracles** → approval PR.
4. **Run Monitor** (`/wo/:id/run`) — state timeline (the machine's states as a horizontal stepper with the current state lit); Start/again buttons gated by `crucible validate` output shown inline; live log pane (SSE); escalation card with the structured fields and a "Resolve via spec change" affordance linking into the spec chat.
5. **Review Queue** (`/queue`) — list; detail = three-pane: diff (server-fetched from GH), reviewer verdict table (per rubric item with evidence), spec delta. Approve / Request changes.

### 5.4 What the Console must NOT do (write these as tests)

- No endpoint may write to the repo except via `crucible` CLI or an approval-PR flow. (Test: grep/lint rule + integration test.)
- No state may exist that survives a server restart and isn't reconstructable from git+GitHub. (Test: kill server mid-flow, restart, board identical.)
- Killing the Console mid-run must not affect the sandbox run. (Runner is decoupled; test it.)

### 5.5 UI/UX specification

Minimalist and utilitarian, per the concept doc §10.3: light neutral background, one accent color (suggest a deep amber — crucible heat — used only for interactive elements and the current state), system font stack, 4px spacing grid, tabular numerals for tables, subtle borders over shadows, no animation beyond 150ms state transitions, dark mode via `prefers-color-scheme`. Every screen has a defined empty state with the next command to run. Keyboard: `g b` board, `g q` queue, `j/k` list nav, `enter` open. Before building the frontend, consult the frontend-design skill available in the executing environment for the styling pass.

### Phase 5 acceptance criteria

1. All five screens function against the real repo; every action displays its terminal equivalent.
2. The three §5.4 negative tests pass.
3. Fallback drill (concept doc success criterion 6): complete one full feature cycle with the Console stopped, using only terminal + GitHub UI; then start the Console and verify the board reflects everything correctly.
4. Console PRs themselves flowed through the full Crucible loop (work orders + Gauntlet + reviewer) — verify in git history.

---

## Phase 6 — Pipeline Eval Suite & Calibration

### 6.1 Eval suite (`/harness/evals/`)

5–10 benchmark work orders with frozen inputs (spec + oracles + module map) and known-good outcome criteria (Gauntlet green within N iterations; no escalation for the unambiguous ones; escalation *required* for the deliberately ambiguous one; the adversarial one must not touch protected paths). Runner: `crucible eval run` executes them against a scratch clone and reports a scorecard. **Trigger policy:** run on every PR that touches `/harness`, `/skills`, prompts, or the pinned model version; results posted as a (non-blocking at first, blocking after calibration) status check `harness-evals`.

### 6.2 Calibration protocol (the first two weeks of real use)

Written as `/harness/CALIBRATION.md`: owner reviews **every** PR regardless of routing; each finding is classified (gate-should-have-caught → ratchet PR; rubric gap → rubric PR; spec ambiguity → template/skill PR); auto-merge is enabled only after: (a) ≥10 real work orders completed, (b) the last 5 low-risk PRs contained zero human findings, (c) the sample-audit command is scheduled (weekly). Ratchet PIT threshold 75→80→85 as the suite matures.

---

## Phase 7 — Runtime Layer (interfaces; environment-dependent)

Because deployment targets vary, implement interfaces + one reference implementation:

- Canary + auto-rollback: reference implementation for the owner's actual target (fill in at execution time — escalate to owner for the target choice: e.g., Argo Rollouts on k8s, or a simple blue-green script + health-gate for a VM/cloud-run style target). SLO definitions per service in `/ci/slo/*.yml` (latency p99, error rate, and per-feature business metrics where specified in the change's design.md).
- Postmortem template `/harness/POSTMORTEM.md` with the mandatory closing field: "Ratchet commit: <PR link adding the oracle/rubric-line/ArchUnit rule that prevents recurrence>" — a postmortem without a ratchet PR is incomplete by definition.

---

## 8. Whole-System Acceptance Checklist (run after Phase 6)

1. **Structural impossibility drill:** attempt to merge (a) a PR with no work order, (b) a PR from a work order without approved oracles, (c) a PR touching `/oracles` without owner review, (d) a PR with a weakened assertion (fixture), (e) a PR with a non-allowlisted dependency. All five must be blocked by CI, not by convention.
2. **Traceability:** pick any merged change; every SHALL resolves to a green oracle on `main`.
3. **Repeatability:** re-run a completed work order's sandbox from its bundle; the Gauntlet result is identical (allowing for the fixed-seed property tests).
4. **Fallback:** Console-off full-cycle drill passed (Phase 5.3).
5. **Ratchet:** at least one postmortem → gate commit exists (may be synthetic during calibration).
6. **Harness regression:** a deliberate prompt regression (e.g., delete the escalation instruction) is caught by the eval suite before merge.

---

## Appendix A — State machine edges (authoritative table for the shared core module)

```
DRAFT_SPEC        → SPEC_APPROVED       (human: spec PR merged)
SPEC_APPROVED     → ORACLES_AUTHORED    (openspec: oracles artifact DONE)
ORACLES_AUTHORED  → ORACLES_APPROVED    (human: /oracles merged; linter green)
ORACLES_APPROVED  → PACKAGED            (crucible package)
PACKAGED          → IMPLEMENTING        (crucible run start)
IMPLEMENTING      → PR_OPEN             (runner opens PR)
IMPLEMENTING      → ESCALATED           (valid escalation.md)
PR_OPEN           → GATES_GREEN         (all Gauntlet checks green)
PR_OPEN           → IMPLEMENTING        (gate red → new attempt)
GATES_GREEN       → AI_REVIEWED         (reviewer-verdict posted)
AI_REVIEWED       → ROUTED_AUTO         (routing: no flags)
AI_REVIEWED       → ROUTED_HUMAN        (routing: any flag/risk path)
ROUTED_AUTO       → MERGED              (platform auto-merge)
ROUTED_HUMAN      → MERGED              (owner approval)
ROUTED_HUMAN      → IMPLEMENTING        (owner requests changes)
MERGED            → CANARY              (CD)
CANARY            → DONE                (SLO watch passed)
CANARY            → ESCALATED           (rollback → postmortem path)
DONE              → ARCHIVED            (/opsx:archive; all PRs merged check)
ESCALATED         → {SPEC_APPROVED | ORACLES_APPROVED | PACKAGED}  (human resolution)
```

Any transition not in this table is illegal; the shared core module exposes `isLegalTransition(from, to)` used by CLI, legitimacy check, and Console alike.

## Appendix B — Initial risk-paths list (`/ci/risk-paths.yml` seed)

auth/authz code; payment/refund/ledger code; data deletion & migrations; public API surface (OpenAPI-managed dirs); dependency allowlist changes; concurrency-marked code; anything under a `security/` package; harness-change-labeled PRs (always human).

## Appendix C — First real work orders after go-live (suggested order)

1. A trivially small feature in the target system (calibration item 1).
2. Two medium CRUD-ish features (calibration items 2–3).
3. One deliberately concurrency-flavored feature (exercises R7 + risk routing).
4. The Console, screen by screen (Phase 5).

---

*End of implementation plan.*
