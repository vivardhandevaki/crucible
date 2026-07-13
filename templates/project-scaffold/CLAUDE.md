# CLAUDE.md — Crucible-governed project

This repository is governed by **Crucible**: humans author specs and oracles,
AI agents author implementation, and a deterministic state machine — enforced by
git, CI, and branch protection — decides what merges. Full concept:
https://github.com/vivardhandevaki/crucible

## The operating rule

**No code without a work order; no work order without approved oracles.**
Hotfixes included. The loop is fast so going around it never wins.

## Vocabulary (use these terms exactly)

- **Work order** (`workorders/<ID>-<slug>/workorder.yaml`) — the authorization and
  scope for a unit of work: state, module map, constraints.
- **Oracle** — a machine-executable judge of a requirement (property test,
  contract test, DB constraint, ArchUnit rule). *A requirement without an oracle
  is a wish.* Map: `oracles.md` in the change folder. Implementations: `/oracles`.
- **The Gauntlet** — the required CI checks every PR must pass.
- **Escalation** — the structured file that ends a run when the spec is
  ambiguous or contradictory. Resolution is always a spec/oracle fix by the owner.

## Policy

- All changes use the **`oracle-driven`** OpenSpec schema
  (proposal → specs → design → oracles → tasks). `tasks` is blocked until
  `oracles.md` exists.
- **Never edit** `/oracles`, `/openspec/specs`, `/openspec/schemas`, `/ci`,
  `/.github`, `/settings`, or this file on implementation branches. These are
  CODEOWNERS-protected; the `legitimacy` gate rejects such diffs anyway.
- **Never weaken, delete, or skip a test or assertion.** If a test seems wrong,
  escalate — do not edit it.
- **Never add a dependency** outside `ci/dependency-allowlist.yml`. A new
  dependency is a separate allowlist PR the owner reviews.
- Archive a change (`/opsx:archive`) only after all its PRs are MERGED.

## Working here

- Language profile: **{{LANG}}** (see `crucible.yaml`). Build/test:
  `./gradlew build` · fast subset: `./gradlew test --tests '<pattern>'` ·
  oracles included in the standard test task.
- Skills: see `.claude/skills/` (`crucible-writing-oracles`,
  `crucible-escalation-protocol`, `crucible-java-conventions`).
- Workflow status: `crucible status` · escalations: `crucible escalations`.

## Escalation protocol

Write `workorders/<ID>-<slug>/escalation.md` with: the blocking requirement/
oracle IDs · a precise description of the ambiguity/contradiction/impossibility ·
2–3 concrete resolution options with trade-offs · what was attempted. Then STOP.
Escalate early on genuine ambiguity; never improvise around a spec problem.
