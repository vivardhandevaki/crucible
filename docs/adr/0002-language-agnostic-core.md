# ADR 0002 — Language-agnostic core; language support via profiles

- **Status:** Accepted
- **Date:** 2026-07-13
- **Deciders:** owner (@vivardhandevaki)

## Context

Crucible v1 targets **Java 21** consumer projects (D-03: owner expertise, best
machine-checkable ecosystem — jqwik, ArchUnit, PIT, Error Prone). But the owner's
requirement is that Crucible itself be **language- and framework-agnostic**, reliably
extensible to other stacks (Python/Django, TypeScript/Node, …) later.

## Decision

Split Crucible into a **language-neutral core** and **language profiles**:

**Core (never references a language):**
- The state machine (states, legal edges, gatekeepers).
- `workorder.yaml` schema and lifecycle (scope, constraints, history).
- The `crucible` CLI and orchestration (init/new/validate/package/run/status/escalations/audit).
- The enforcement model: CODEOWNERS, branch protection, required-check names,
  legitimacy/traceability/diff-size gates (these parse specs and diffs, not code).
- OpenSpec integration (`oracle-driven` schema — artifact flow is language-free).
- The escalation protocol, reviewer-verdict contract, routing rules.

**Language profile (all the stack-specific machinery), e.g. `java`:**
- Oracle implementation tooling and layout conventions (jqwik/ArchUnit/Liquibase for Java).
- Gauntlet gate *implementations*: build, style, mutation, SAST rulesets, dep scanning.
- Toolchain image contents beyond the shared base (JDK/Gradle for Java).
- Scaffold fragments (`src/` layout, build files) and skills (e.g. `java-conventions`).

Mechanics:
- Consumer repos declare their profile in `crucible.yaml` (written by `crucible init --lang java`).
- Gate *names* are stable and language-neutral (`build`, `style`, `tests`, `mutation`, …);
  profiles supply their implementations. Branch-protection config never changes per language.
- The oracle-type taxonomy (property/example/contract/db-constraint/archunit/ci-check/
  human-audit) is core; profiles map each type to concrete tooling. A profile MUST
  state which types it supports and how.

## Consequences

- v1 ships exactly one profile: **`java`**. Nothing in `packages/cli/src/core` may
  import from or special-case a profile.
- Adding a language later = adding a profile (gate implementations + scaffold fragments
  + toolchain layer + skills), not touching the core — the same "add a required status
  check, not rewrite the orchestrator" extensibility principle applied to languages.
- The reviewer rubric splits into core items (scope creep, secrets, semantic drift…)
  and profile items (e.g. Java concurrency idioms) when a second profile appears.
