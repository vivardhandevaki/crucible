# Crucible

**An opinionated framework — driven from a local web app — for building software
systems end-to-end with AI agents, inside a container of enforcement that never yields.**

Humans author **specifications** and executable **verification (oracles)**; AI agents
author **implementation**; and a **deterministic state machine — enforced by git, CI,
and platform-level branch protection — guarantees that no code reaches production
without passing through every mandatory verification step.** The artifact humans review
shifts from *code* to *the things that judge code*.

## How it's used

Crucible is a **reusable framework** plus a **local web app** (the primary interface).
You run it to build **software systems, each in its own repo**. Per feature:

1. **Propose** a feature in the web app.
2. **Review** the agent-drafted specs, oracles, and tasks; suggest modifications.
   *(Your approval of the oracles is a mandatory gate before any code is written.)*
3. The agent **implements** the code changes.
4. The framework **runs the rest** — Gauntlet gates → reviewer agent → routing → merge → canary.

New projects are scaffolded with `crucible init`, which emits the governed structure
(CODEOWNERS, the Gauntlet CI, the `oracle-driven` OpenSpec schema, `CLAUDE.md`) into a
fresh consumer repo. OpenSpec is the SDD mechanism inside the framework.

## Architecture (Model B — see [ADR 0001](./docs/adr/0001-model-b-framework.md))

- **This repo = the framework.** It holds the reusable machinery and is developed conventionally.
- **Consumer repos = your software systems.** Separate repos, scaffolded and governed by Crucible.
- **Distribution:** `@crucible/cli` (npm) · reusable GitHub workflows (`workflow_call`) ·
  GHCR toolchain image · the `crucible init` scaffold.

```
crucible/                     # THIS repo — the framework
├── packages/cli/             # @crucible/cli: the `crucible` binary + gate scripts + shared core
├── console/                  # the web app (primary interface; server + web)
├── schemas/oracle-driven/    # OpenSpec schema fork + oracle template (installed into consumers)
├── skills/  prompts/  rubric/  sandbox/  evals/   # the harness
├── toolchain/                # Dockerfile → published to GHCR
├── templates/project-scaffold/   # what `crucible init` emits into a consumer repo
├── .github/workflows/        # reusable Gauntlet / reviewer / runner + this repo's own ci
├── settings/                 # this repo's branch-protection-as-code
└── docs/adr/                 # architecture decision records
```

## Documents

| Document | Role |
|---|---|
| [`docs/adr/0001-model-b-framework.md`](./docs/adr/0001-model-b-framework.md) | The current architecture (framework + web app) and revised build order. |
| [`CRUCIBLE-CONCEPT.md`](./CRUCIBLE-CONCEPT.md) | Conceptual reference: principles, glossary, state machine, decision log. |
| [`CRUCIBLE-IMPLEMENTATION-PLAN.md`](./CRUCIBLE-IMPLEMENTATION-PLAN.md) | Original phased plan. *Structural specifics superseded by ADR 0001; gate/principle rationale still current.* |
| [`CRUCIBLE-USAGE-WALKTHROUGHS.md`](./CRUCIBLE-USAGE-WALKTHROUGHS.md) | Day-in-the-life procedures (from the consumer's point of view). |
| [`evals/README.md`](./evals/README.md) | The pipeline eval suite — benchmark work orders that guard the harness against regression (`crucible eval run`). |
| [`CALIBRATION.md`](./CALIBRATION.md) | The first-weeks calibration protocol and the exit criteria for enabling auto-merge. |

## The one operating rule

**No code without a work order; no work order without approved oracles** — including
hotfixes. The loop is fast enough that going around it never wins.

## Status

Phases 0–6 landed: skeleton & governance, OpenSpec fork, the language-agnostic core
+ `crucible` CLI, the Gauntlet, the sandbox runner + reviewer + routing, the Console,
and the **pipeline eval suite** (`crucible eval run` + `harness-evals` CI). Next up is
calibration (see [`CALIBRATION.md`](./CALIBRATION.md)) and Phase 7 (the runtime layer).
