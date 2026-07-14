# ADR 0003 — The Crucible Console is built directly, not through the Crucible loop

- **Status:** Accepted
- **Date:** 2026-07-14
- **Deciders:** owner (@vivardhandevaki)

## Context

The implementation plan (Phase 5) originally specified that the Console be built
*through the Crucible loop itself* — each screen as an OpenSpec change with authored
property/contract oracles, a work order, and Gauntlet-gated PRs — as a "shakedown
cruise." In practice, dogfooding a UI application that way is very heavy for little
return: authoring machine-checkable oracles (and Playwright smoke oracles) per screen,
running each screen through the full spec→oracles→package→run→Gauntlet→routing loop,
for tooling that is itself a thin view over git+GitHub.

The Phase 4 acceptance drill already validated the loop end-to-end on a real work order,
so the loop does not need the Console to prove itself.

## Decision

Build the Console **directly, as a normal application**, not through the Crucible loop.

- No per-screen OpenSpec changes, authored oracles, work orders, or Gauntlet-gated
  work-order PRs for the Console.
- The Console is still developed against the **stateless doctrine** (plan §5.1 /
  concept §10.1): git + GitHub are the only sources of truth; the only writers are the
  `crucible` CLI, the GitHub API, and the approval-PR flow.
- It still ships with tests — a server/UI suite plus the **three §5.4 negative-guarantee
  tests** (no non-CLI repo writes; no state surviving restart; a run survives Console
  death). These are cheap and encode the doctrine, so they stay.
- The spec-chat panel uses the **`claude` CLI under the owner's subscription**
  (`CLAUDE_CODE_OAUTH_TOKEN`), not the pay-as-you-go Anthropic API — consistent with the
  subscription-auth decision (v0.2.0).

## Consequences

- The Crucible loop remains reserved for the **software systems Crucible builds**, not
  the Crucible tooling itself. This is the same boundary as ADR 0001 (framework vs.
  consumer repos): the framework/tooling is authored directly; consumer systems go
  through the loop.
- The planned `console-build` / `console-tests` Gauntlet job pair is not added; the
  Console's own tests run in its package's CI instead.
- Calibration friction is still surfaced through real terminal + GitHub use (concept
  §10.4); the Console is refined against felt friction, just not gated by the loop.
