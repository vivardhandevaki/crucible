# ADR 0001 — Crucible as a distributable framework (Model B); web app as primary interface

- **Status:** Accepted
- **Date:** 2026-07-12
- **Deciders:** owner (@vivardhandevaki)

## Context

The three design docs (`CRUCIBLE-CONCEPT.md`, `CRUCIBLE-IMPLEMENTATION-PLAN.md`,
`CRUCIBLE-USAGE-WALKTHROUGHS.md`) describe a **self-hosting monorepo ("Model A")**:
one repo holding the Crucible machinery *and* the target system in `src/`, where
Crucible governs itself (the Console is built through its own loop, last).

During bootstrapping the owner clarified the intended product:

- A local **web app** is the **primary interface** for building software systems.
- Crucible is an **opinionated, reusable framework** (state machine + harness + gates)
  used to build **many separate software systems**, each its own repo.
- **OpenSpec** remains the SDD mechanism inside the framework.

Per-feature workflow the owner drives from the web app:
1. Propose a feature.
2. Review agent-drafted **specs, oracles, tasks**; modify.
3. Agent **implements** the code.
4. Framework runs the rest (Gauntlet → reviewer agent → routing → merge → canary).

## Decision

**Model B.** This repo is the **Crucible framework**, not a self-hosting monorepo.

- Target software systems live in **separate consumer repos**, scaffolded by `crucible init`.
- **Distribution:** `@crucible/cli` (npm) + **reusable GitHub workflows** (`workflow_call`)
  + **GHCR** toolchain image (`ghcr.io/vivardhandevaki/crucible-toolchain:<ver>`).
- The Model-A protected-path governance (CODEOWNERS over `specs/ oracles/ …`, the
  Gauntlet, `CLAUDE.md`, the `oracle-driven` schema, the dir skeleton) becomes the
  **output of `crucible init`** — see [`templates/project-scaffold/`](../../templates/project-scaffold/).
- This framework repo is governed **conventionally** (owner reviews all PRs; owner-bypass
  ruleset), **not** through the Crucible loop.
- The **web app is co-primary** with the core: it is a *thin view + remote control* that
  sits on a working core, so it is built **after** core/gates/harness but is a **headline
  deliverable**, not a last add-on.
- **Retained invariant:** human **approval of oracles is a mandatory gate before
  implementation** (the guarantee against agent-authored vacuous verification).

## Consequences

Path remapping vs the implementation plan (Model A → Model B):

| Impl-plan path (Model A) | Model B location |
|---|---|
| `harness/cli` | `packages/cli` |
| `harness/{prompts,rubric,sandbox,evals,toolchain}` | `prompts/ rubric/ sandbox/ evals/ toolchain/` |
| `ci/` (Gauntlet + scripts) | reusable `.github/workflows/*` + gate scripts in `packages/cli`; consumer `ci/` configs in `templates/project-scaffold/ci/` |
| `specs/ oracles/ workorders/ src/` | emitted into consumer repos (`templates/project-scaffold/`) |
| `console/` (Console) | `console/` (co-primary, still on top of the core) |
| `openspec/schemas/oracle-driven` | `schemas/oracle-driven` (framework); installed into consumers by `crucible init` |

The three design docs remain the **conceptual reference** (principles, state machine,
gate rationale, glossary). Their **structural** specifics (monorepo layout, "Console
built last") are **superseded by this ADR**. Full doc reconciliation is a tracked follow-up.

## Revised build order

| Phase | Deliverable |
|---|---|
| 0 | Framework skeleton + framework governance + toolchain image (GHCR) — *current* |
| 1 | OpenSpec integration: `oracle-driven` schema fork + oracle template (framework; installed by `init`) |
| 2 | **Crucible core:** `workorder` schema + state machine + `crucible` CLI incl. `crucible init` |
| 3 | The Gauntlet as **reusable workflows** + gate scripts; consumer scaffold references them |
| 4 | Harness: `CLAUDE.md` template, skills, prompts, sandbox runner, reviewer agent + rubric, routing |
| 5 | **Web app (Console):** the primary interface over the core |
| 6 | Pipeline eval suite + calibration |
| 7 | Runtime layer (canary/rollback/postmortem) |

The order is largely the docs' order because the web app is a control surface that
requires a working core; Model B's changes are the framework/consumer split, the
reusable-workflow distribution, `crucible init` as a first-class command, and conventional
governance of this repo.
