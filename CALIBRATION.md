# Calibration protocol

The first weeks of real use (impl plan §6.2). Calibration is how the harness earns
the right to merge without a human in the loop. Until the exit criteria below are
met, **the owner reviews every PR regardless of how routing classified it** — an
`auto` route during calibration is a recommendation to be checked, not a decision
to be trusted.

## The loop

For every merged PR during calibration, the owner records each human finding — a
bug, a smell, a scope problem, anything the pipeline let through — and classifies
its **root cause**, because a finding is only worth the ratchet it produces:

| Root cause | The finding means… | Ratchet (the required follow-up) |
|------------|--------------------|----------------------------------|
| **gate-should-have-caught** | an executable gate could have blocked this mechanically | a **ratchet PR**: add/tighten the oracle, ArchUnit rule, Semgrep rule, or gate that catches this class from now on |
| **rubric gap** | the reviewer had no rubric line pointing at this | a **rubric PR**: add a rubric item (a new `R<n>` in `rubric/rubric.yml`) for the escaped defect class |
| **spec ambiguity** | the spec/oracles under-specified the intent | a **template/skill PR**: sharpen the change template or a `crucible-*` skill so the ambiguity is surfaced during authoring, not implementation |

A finding without a ratchet is an incomplete calibration entry. The ratchet is the
product; the fix to the individual PR is incidental. Every ratchet PR that touches
`prompts/`, `rubric/`, `skills/`, `sandbox/`, or the CLI re-runs `harness-evals`
(the eval scorecard) — so the net that catches the next regression is itself
regression-tested.

## Log

Keep a running table here (one row per finding) during calibration:

| Date | PR | Finding | Root cause | Ratchet PR |
|------|----|---------|-----------|------------|
| _(first real finding goes here)_ | | | | |

## Exit criteria — enabling auto-merge

Auto-merge (the `ROUTED_AUTO → MERGED` edge actually merging without owner
approval) is enabled **only after all three hold**:

- **(a)** ≥ **10 real work orders** have completed a full cycle (not the benchmarks — real features in the target system).
- **(b)** the **last 5 low-risk PRs contained zero human findings** — the pipeline agreed with the human five times running on the routes it wants to automate.
- **(c)** the **weekly sample-audit is scheduled** — `crucible audit` runs on a cron so a deterministic sample of auto-merged PRs still reaches a human after the fact (auto-merge is a delegation, not an abdication).

Only when (a)+(b)+(c) hold does the owner:

1. flip the platform auto-merge affordance on (repo setting + `settings/apply.sh`), and
2. add **`harness-evals`** to the required status checks in
   `settings/branch-protection.json` (it ships **non-blocking** — see the workflow
   header) so a red scorecard blocks merge from then on.

## Mutation-threshold ratchet

The PIT mutation threshold starts intentionally low and tightens as the oracle
suite matures — a high bar on a thin suite only measures the suite, not the code:

```
75%  →  80%  →  85%
```

Advance one step when the changed-code mutation score has cleared the current
threshold with margin across several consecutive work orders. Record each bump as
a reviewed PR to the Java profile's PIT configuration (it is a gate change, so it
is owner-owned and re-runs the evals).

## After calibration

Run the whole-system acceptance checklist (impl plan §8): the structural-
impossibility drill, traceability spot-check, repeatability re-run, the Console-off
fallback drill, at least one postmortem→gate ratchet, and the deliberate prompt
regression caught by `harness-evals` before merge.
