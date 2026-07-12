# Crucible — Concept & Design Document

**Version:** 1.0
**Status:** Approved for implementation
**Audience:** The system owner (human engineer) and any AI agent working on or within the system.
**Companion document:** `CRUCIBLE-IMPLEMENTATION-PLAN.md` (the build plan; this document is the "why and what," that one is the "do this next").

---

## 1. Executive Summary

**Crucible is a workflow system for AI-driven software development in which humans author specifications and executable verification (oracles), AI agents author implementation, and a deterministic state machine — enforced by git, CI, and platform-level branch protection — guarantees that no code reaches production without passing through every mandatory verification step.**

The name: a crucible is a vessel that withstands extreme heat while the material inside is melted, purified, and tested. In this system, AI agents do fast, high-volume work *inside* a container of enforcement that never yields. Nothing leaves the crucible unverified.

The four design requirements, in priority order:

1. **Correctness & verifiability** — every requirement is judged by a machine-executable oracle; human trust is placed in oracles and gates, not in reading every diff.
2. **Extensibility** — architecture rules are enforced mechanically (not culturally), so hundreds of agent-authored PRs cannot erode structure; adding a new mandatory workflow step is "add a required status check," not "rewrite an orchestrator."
3. **Repeatability** — the agent harness is versioned code with its own regression suite; builds are hermetic; toolchain and OpenSpec versions are pinned; same inputs produce same results.
4. **Reliability** — pre-merge gates plus runtime verification (canary, SLO auto-rollback) plus a ratchet: every escaped defect becomes a new permanent oracle, rubric line, or architecture rule.

The core inversion Crucible makes relative to traditional development: **the artifact humans review shifts from code to the things that judge code.** Line-by-line human code review is retained only for a mechanically-identified high-risk slice (~15–20% of PRs) plus a random audit sample; everything else is verified by the Gauntlet (CI gates) and an adversarial reviewer agent.

---

## 2. Vocabulary & Glossary

Consistent names matter because agents read these documents. Use these terms exactly.

| Term | Definition |
|---|---|
| **Crucible** | The entire workflow system: state machine + enforcement + harness + console. |
| **Work order** (`workorder.yaml`) | The per-feature orchestration manifest: state, scope (module map), constraints (diff cap, iteration budget), references to the OpenSpec change and oracle IDs. The authorization to do work. Named to be unambiguous next to OpenSpec's `tasks.md`. |
| **Oracle** | A machine-executable judge of a requirement: a property test, contract test, DB constraint, ArchUnit rule, or CI check. An oracle decides pass/fail automatically. Distinct from *intent* (the human goal) and *spec* (the precise written requirement). **"A requirement without an oracle is a wish."** |
| **Oracle map** (`oracles.md`) | Per-change traceability table mapping every normative requirement (SHALL/MUST) to one or more oracle IDs. An OpenSpec artifact in the change folder. |
| **Oracle implementations** | The actual test/constraint code, living on the protected `/oracles` path (human-approval-only via CODEOWNERS). |
| **The Gauntlet** | The full set of required CI status checks every PR must pass: build, style, ArchUnit, tests, mutation testing (PIT), SAST (Semgrep), dependency scan, traceability lint, diff-size, work-order legitimacy, reviewer-agent verdict. |
| **Harness** | Everything around the model that shapes agent behavior: CLAUDE.md, skills, prompt templates, sandbox runner, permission config, the `crucible` CLI, iteration budgets, escalation protocol. Treated as a product: versioned, reviewed, regression-tested. |
| **Implementer agent** | Stateless agent invoked in an ephemeral sandbox to implement one work order. Judged only by oracles and gates. Cannot modify specs, oracles, CI, or harness. |
| **Reviewer agent** | Separate agent (separate context — never sees the implementer's reasoning) that audits every diff against a concrete rubric and posts a machine-parseable verdict as a required status check. |
| **Routing** | Deterministic (no model call) script that sends each green PR to auto-merge or to human review based on a risk-path list and the reviewer verdict. |
| **Escalation** | Structured file (`escalation.md`) an agent writes when blocked or when the spec is ambiguous/contradictory. Ends the agent's run; a human resolves it as a spec/oracle fix, never as agent improvisation. |
| **The ratchet** | The rule that every escaped defect's postmortem must produce a new oracle, rubric line, or ArchUnit rule as a commit. The system only gets stricter. |
| **Crucible Console** | The local web app: a stateless view + remote control over the state machine. Never a source of truth. |
| **Pipeline eval suite** | Benchmark tasks with known-good outcomes, re-run whenever the model, prompts, or skills change — the harness's own regression tests. |

---

## 3. Problem Statement & Requirements

### 3.1 The problem

Modern models can implement most well-specified backend features autonomously. The naive response — "stop reviewing PRs, trust the model" — fails because verification effort is **conserved, not eliminated**: if a human stops reading code, trust must come from somewhere else, or it silently becomes *absence of verification*. The naive opposite — "review everything as before" — throws away the productivity gain and doesn't scale to agent-level PR volume.

Specific failure modes of unverified AI-driven development that Crucible is designed against:

- **Vacuous verification:** the agent writes both the code and the tests; tests describe what the code does, not what it should do. 40 green tests can encode one misunderstanding.
- **Reward hacking to green:** agents optimize "make the checks pass" and find degenerate paths — weakening assertions, editing fixtures, mocking away the failing component, installing a different library version globally, mutating shared environment state.
- **Blind spots of behavioral testing:** security vulnerabilities with no functional symptom, license/supply-chain risk in hallucinated or typosquatted dependencies, quietly quadratic algorithms that pass on small fixtures, PII in logs, semantic drift adjacent to the task.
- **Architectural erosion:** agents have no taste and no long-term memory of your architecture; without mechanical boundaries, hundreds of PRs converge on a ball of mud.
- **Process drift:** LLMs are unreliable at self-enforcing multi-step processes. "Usually follows the workflow" is exactly what repeatability forbids.
- **Correlated review errors:** an AI reviewer that shares the author agent's context inherits its rationalizations.

### 3.2 The requirements, made precise

| Requirement | Crucible's operationalization |
|---|---|
| Correctness & verifiability | Every SHALL/MUST maps to ≥1 oracle (enforced by a CI linter). Oracles are authored/approved by the human before implementation and are unmodifiable by agents. Mutation testing verifies the tests themselves. |
| Extensibility | ArchUnit-enforced module boundaries; small modules with contract-tested boundaries (regeneration-friendly); adding a workflow step = adding a required status check. |
| Repeatability | Hermetic sandboxes (pinned image, no network, fresh per run); harness-as-code with a pipeline eval suite; pinned OpenSpec/toolchain versions; deterministic routing and orchestration (no model calls in control flow). |
| Reliability | The Gauntlet pre-merge; canary + SLO auto-rollback post-merge; the ratchet ensures monotonic improvement; escalation protocol prevents agent thrashing. |

### 3.3 Context and constraints

- Owner is an experienced backend engineer, strongest in **Java** → Java is the implementation language for target systems (see Decision D-03).
- Owner is willing to read PRs and code where it adds value → human review is used as a **precision instrument** (risk-routed + sampled), not a coverage instrument.
- Owner already uses **OpenSpec** for spec-driven development → retained and extended via its first-class schema customization (see §7 and Decision D-07).
- Solo/small-team scale → orchestration is git + CI + a thin CLI; no heavyweight workflow engines (Temporal, LangGraph) at this stage.

---

## 4. Core Principles

These ten principles are the constitution of the system. When any design question arises during implementation, resolve it in favor of these, in this order of citation frequency:

1. **The loop lives in infrastructure, never in an agent's head.** Agents are stateless workers invoked at specific states with one job each. The orchestrator is deterministic code (scripts + CI), debuggable with `cat` and `git log`.
2. **Hand-offs are artifacts, not messages.** Each stage consumes files and produces files. "Done" = the output artifact exists and validates — never the agent's self-report.
3. **Convenience and enforcement are separate layers.** The CLI/Console make the workflow easy to follow; branch protection + CODEOWNERS + required status checks make it impossible not to follow. Deleting the CLI must leave the workflow enforced (just tedious). If enforcement lived only in tooling people can bypass, the first "quick fix" erodes the system.
4. **Direction emerges from preconditions.** No component knows the whole flow. Each step refuses to run unless the previous step's artifact exists and validates. Adding a step = adding a precondition/status check.
5. **Agents are judged only by oracles.** Anything in the intent or spec that never became an oracle is, from the agent's perspective, optional — and under optimization pressure, optional means gone. Hence: a requirement without an oracle is a wish.
6. **Humans own specs, oracles, and the harness; agents own implementation.** The protected paths (`/specs`, `/oracles`, `/harness`, `/ci`, `/skills`) are CODEOWNERS-guarded and unwritable from implementation branches.
7. **The test bench is deterministic AND tamper-proof.** Hermetic (declared inputs only), reproducible (same inputs → same outputs), sandboxed (fresh, isolated, destroyed after), and the thing under test — which is also an actor with a shell — cannot modify the bench.
8. **Independent verification: the reviewer never shares the author's context.** Different agent, different inputs (spec + diff + rubric; never the implementer's reasoning), concrete rubric, machine-parseable verdict.
9. **Small diffs, always.** ≤400 changed lines per PR (configurable per work order). Larger work is decomposed into a PR sequence proposed up front. Small diffs make every gate more discriminating and human review tractable.
10. **The ratchet: escaped defects become permanent gates.** Every postmortem closes with "which new oracle / rubric line / ArchUnit rule prevents recurrence," and that item is a commit, not a document.

Plus one operating rule that protects all of the above: **no code without a work order; no work order without approved oracles.** Hotfixes go through the loop too — the loop is fast precisely so there is never a reason to go around it.

---

## 5. Architecture: Four Layers

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 4 — RUNTIME VERIFICATION (per deploy)                    │
│   Canary deploys · SLO monitoring · auto-rollback · postmortem │
│   ratchet feeding new oracles/rules back into Layer 1          │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 3 — EXECUTION LOOP (per work order)                      │
│   Task packaging · ephemeral sandbox · implementer agent ·     │
│   PR · Gauntlet · reviewer agent · deterministic routing ·     │
│   auto-merge or human review                                   │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 2 — SPEC LAYER (per feature, human-owned)                │
│   OpenSpec change (proposal → specs → design → ORACLES →       │
│   tasks) · oracle map · oracle implementations on protected    │
│   path · human approval commits                                │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 1 — FOUNDATION (built once, evolved deliberately)        │
│   Repo structure · CODEOWNERS · branch protection · pinned     │
│   toolchain image · Gauntlet CI definitions · Harness          │
│   (CLI, CLAUDE.md, skills, prompts, rubric, sandbox runner) ·  │
│   pipeline eval suite                                          │
└─────────────────────────────────────────────────────────────────┘
```

The Crucible Console (web app) sits beside all four layers as a **stateless view and remote control** — it reads state from git + the GitHub API and triggers actions that already exist in Layer 1/3 tooling. See §10.

---

## 6. The State Machine

### 6.1 States and transitions

Each feature is a work order that moves through explicit states. State is stored durably in `workorder.yaml` (the `state:` field), advanced only by the `crucible` CLI or humans, and cross-checked by CI.

```
DRAFT_SPEC ──► SPEC_APPROVED ──► ORACLES_AUTHORED ──► ORACLES_APPROVED
   ──► PACKAGED ──► IMPLEMENTING ──► PR_OPEN ──► GATES_GREEN
   ──► AI_REVIEWED ──► ROUTED:{AUTO_MERGE | HUMAN_REVIEW} ──► MERGED
   ──► CANARY ──► DONE ──► ARCHIVED

Failure edges:
  IMPLEMENTING ──► ESCALATED ──► (spec/oracle fix) ──► back to the
                                  appropriate earlier state
  GATES_RED    ──► IMPLEMENTING (with failure output as new input)
  REVIEW_FLAGGED ──► HUMAN_REVIEW
  CANARY_ROLLBACK ──► postmortem ──► ratchet commit ──► new work order
```

### 6.2 Gatekeepers table — who is allowed to advance each transition

This table is the heart of enforcement. **Every transition has a gatekeeper that is not the agent.**

| Transition | Gatekeeper | Mechanism |
|---|---|---|
| DRAFT_SPEC → SPEC_APPROVED | Human | Merge of spec delta to protected `/specs`-adjacent path (OpenSpec change folder) via a PR only the CODEOWNER can approve. Approval = a git commit, not a UI flag. |
| SPEC_APPROVED → ORACLES_AUTHORED | OpenSpec schema | `oracles` artifact exists (`oracles.md` in change folder). OpenSpec marks artifact DONE on filesystem presence. |
| ORACLES_AUTHORED → ORACLES_APPROVED | Human + linter | Oracle *implementations* merged to protected `/oracles` path (CODEOWNERS) **and** traceability linter green (every SHALL has ≥1 resolving oracle ID). Note: OpenSpec's DONE (file exists) is deliberately too weak here; Crucible requires both conditions. |
| ORACLES_APPROVED → PACKAGED | `crucible validate` | Script refuses unless: work order schema-valid, OpenSpec artifacts DONE, oracle approval commit present, module map non-empty. |
| PACKAGED → IMPLEMENTING | `crucible run` | Spins the pinned, network-restricted, ephemeral container; injects state-specific prompt; enforces iteration budget. |
| IMPLEMENTING → PR_OPEN | Sandbox runner | Runner (not the agent) opens the PR with work-order labels; PR template carries the work-order ID. |
| PR_OPEN → GATES_GREEN | Platform | GitHub branch protection **required status checks**: the full Gauntlet. Nobody — owner included — can merge around them. |
| GATES_GREEN → AI_REVIEWED | Reviewer CI job | Reviewer agent runs as CI (never "someone remembers to invoke it"); machine-parseable verdict posted as a required status check. Red verdict blocks merge like a failing test. |
| AI_REVIEWED → ROUTED | Routing script | Deterministic: touched-paths ∩ risk list, reviewer verdict flags, diff size. No model call. All clear → auto-merge label; any flag → owner added as required reviewer. |
| ROUTED → MERGED | Platform or human | Auto-merge on all-green (low-risk route) or human approval (risk route). |
| MERGED → CANARY → DONE | CD pipeline | Canary + SLO watch + auto-rollback. |
| DONE → ARCHIVED | Human via `/opsx:archive` | Guarded by a check that all associated PRs are merged — the living specs must never claim behavior that never shipped. |
| IMPLEMENTING → ESCALATED | Agent (the one transition it may trigger) | Writing a valid `escalation.md` ends the run. Resolution is always a human spec/oracle change. |

### 6.3 Hand-off artifacts

The work-order directory is the spine of every hand-off:

```
/workorders/OMS-142-partial-cancellation/
  workorder.yaml         # state, refs, scope, constraints (schema in impl. plan)
  escalation.md          # exists only if the agent escalated (structured format)
  review-verdict.json    # reviewer agent output (also posted as status check)
  runlog/                # sandbox run transcripts, per attempt (audit trail)
```

The OpenSpec change folder holds the feature's *content* artifacts:

```
openspec/changes/partial-cancellation/
  proposal.md            # why
  specs/**/spec.md       # requirement deltas (SHALL/MUST + scenarios)
  design.md              # technical approach
  oracles.md             # REQ → oracle-ID traceability map  ← Crucible's addition
  tasks.md               # implementation checklist (agent's inner plan)
```

`workorder.yaml` references the change folder; the packaging step reads OpenSpec artifacts as inputs. **`tasks.md` is the implementation checklist inside the work; `workorder.yaml` is the authorization and scope around the work.** They are different layers and both exist.

---

## 7. OpenSpec Integration

Decision: **keep OpenSpec** (see D-07 for full rationale). Its OPSX workflow is schema-driven and schemas are user-definable — a declarative version of Crucible's "chain of preconditions." What OpenSpec deliberately does not do is enforce (its philosophy is "fluid not rigid; dependencies are enablers, not gates"), which is fine: **OpenSpec provides direction; Crucible's CI provides legitimacy.**

### 7.1 The `oracle-driven` schema fork

Fork the default `spec-driven` schema and insert `oracles` as a first-class artifact between `specs` and `tasks`:

```yaml
# openspec/schemas/oracle-driven/schema.yaml
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
    requires: [specs]            # oracles judge requirements, not designs
  - id: tasks
    generates: tasks.md
    requires: [specs, design, oracles]   # ← no tasks without oracles
```

With `/opsx:continue`, the agent is walked through artifacts in dependency order and `tasks` stays BLOCKED until `oracles.md` exists. The `oracles` artifact gets its own instruction template (full template content in the implementation plan) encoding: the mandatory traceability table format, the oracle-type taxonomy (property test / example test / contract test / DB constraint / ArchUnit rule / CI check), the rule that every SHALL/MUST must appear, and the instruction that drafted oracle *code* goes under `/oracles/**` and is flagged for human approval.

### 7.2 Two-layer oracles

- `oracles.md` (change folder) = the **map**. An OpenSpec artifact; agents may draft it.
- `/oracles/**` (protected path) = the **implementations**. Agents may draft; only the human CODEOWNER can merge. This keeps OpenSpec doing authoring and lifecycle, without asking it to be a security boundary.

### 7.3 Operational rules

- Pin the OpenSpec version in the toolchain image; treat `openspec update` as a reviewed harness change (upstream describes OPSX as evolving; schema/template behavior shifting mid-project is a repeatability leak).
- `/opsx:archive` only after MERGED (checked mechanically), because archiving merges deltas into the living specs.
- Adopt `/opsx:verify` (expanded profile) as a cheap pre-archive sanity pass — an agent judgment, useful but never a gate; the Gauntlet remains the verifier.
- CLAUDE.md carries one line of policy ("all changes use the `oracle-driven` schema; never edit `/oracles` or `/specs` on implementation branches") — belt; CI is the suspenders.

---

## 8. The Verification Stack (the Gauntlet) — What Each Gate Catches

Each gate exists because it catches a failure mode the others miss. None is optional; together they are what replaces routine line-by-line human review.

| Gate | Tooling (Java target) | Failure mode it uniquely catches |
|---|---|---|
| Compile + strict types | JDK (pinned) + Error Prone | Hallucinated interfaces become compile errors instead of runtime surprises; illegal states made unrepresentable. |
| Style/format | Checkstyle + Spotless | Removes style from the reviewer agent's job (don't spend model calls on what linters do deterministically). |
| Architecture rules | ArchUnit test module | Structural erosion across many PRs: layer violations, forbidden dependencies, "only `OrderStateMachine` may mutate order status," no field injection. This is where extensibility is mechanically defended. |
| Unit/property/contract tests | JUnit 5 + jqwik + contract tests from OpenAPI | Behavioral correctness, including the human-authored oracles. Property tests ("for any valid input, the ledger balances") catch whole classes example tests miss. |
| Mutation testing | PIT (changed-code scope, threshold ratcheted 75%→85%) | **Tests the tests.** Vacuous agent-written tests and quietly weakened assertions show up as surviving mutants. The main structural defense against reward-hacking to green. |
| SAST | Semgrep (Java ruleset + custom rules) | Security flaws with no functional symptom: injection, path traversal, hardcoded secrets, weak crypto. Behavioral tests are blind to these. |
| Dependency scan + allowlist | OWASP dependency-check (or Snyk) + allowlist policy file | Known CVEs, license risk, and hallucinated/typosquatted packages ("slopsquatting"). Agents cannot add a dependency that isn't allowlisted or explicitly approved. |
| Traceability lint | Custom ~100-line script | A SHALL/MUST without a resolving oracle ID. Enforces "a requirement without an oracle is a wish" mechanically. |
| Diff-size check | Trivial script reading `workorder.yaml` | Oversized changes that make every other gate less discriminating. |
| Work-order legitimacy | Custom script | PRs with no work order, work order in wrong state, or touched paths outside the module map (scope creep, protected-path writes). This is what makes bypassing the CLI hit a wall. |
| Reviewer agent verdict | Claude via CI job + rubric | Judgment-only findings: semantic drift from spec, weakened tests PIT's threshold missed, suspicious dependency *usage*, concurrency soundness, PII in logs, scope smell. |

Sandbox properties backing all of the above: pinned image (same locally, in CI, in agent runs), fresh per run, network off except the artifact mirror, agent permission config denies protected paths, container as backstop. If the environment is declared, immutable-by-default, and rebuilt from scratch, the only way to green is through the actual code.

---

## 9. The Human Role

Steady-state, the owner's work is exclusively judgment work:

1. **Author/approve specs** (with an agent as drafting partner — the agent surfaces edge cases; the human makes the calls).
2. **Author or line-by-line review oracles.** This is the real "code review," done up front, on the artifact with maximal leverage.
3. **Review risk-routed PRs** (~15–20%): anything touching auth/authz, payments/money movement, data deletion/migration, public API surface, dependency additions, concurrency primitives — plus anything the reviewer agent flags. These reviews are fast (gates already proved behavior); the human reads for what machines can't judge: is the transaction boundary *sensible*, is this a design we want to live with, does it create extensibility debt.
4. **Random 10% sample audits** of auto-merged PRs — statistical process control on the pipeline itself.
5. **Resolve escalations** — always as a spec/oracle fix.
6. **Improve the harness** — rubric lines, ArchUnit rules, skills, prompts — driven by the ratchet.

Line-by-line human review is mandatory for exactly one category of code with no exceptions: **the harness itself and the Gauntlet definitions** — the trusted computing base of everything downstream.

---

## 10. The Crucible Console (Web App)

### 10.1 The one architectural rule

**The Console is a view and remote control over the state machine, never the state machine itself.** All authoritative state lives in git + GitHub (workorder.yaml files, approval commits, PR labels and status checks). The Console reads that state and triggers the same CLI/CI actions available from a terminal. Consequences, by design:

- **No database.** Git is the database. Nothing can drift out of sync with reality; there is no second source of truth to reconcile.
- **Full terminal fallback, always.** If the Console dies, the workflow is 100% operable via `crucible` CLI + GitHub's own UI (PR pages already show status checks, review queues, labels). Nothing is trapped in the app.
- **Zero added authority.** Every button maps to an existing CLI/CI action; every displayed fact derives from git/GitHub. Approvals triggered from the Console still travel through PRs to protected paths, so CODEOWNERS and branch protection still apply.
- **Local-first.** Runs on the owner's machine (`npm run dev` / one Docker command); credentials via a local env file (GitHub PAT); no hosting, no exposure surface.

### 10.2 Screens (detailed component specs in the implementation plan)

1. **Board** — kanban of work orders by state, from scanning `/workorders/*/workorder.yaml` + GitHub API for PR/check status.
2. **New Feature** — form → `crucible new`; then a spec-drafting chat panel (Claude API) with the spec delta rendering live beside it; **Approve Spec** commits via a PR on the owner's behalf.
3. **Oracle Review** — the REQ → oracle traceability table; red rows for unlinked SHALLs; oracle source rendered inline; **Approve Oracles** via the same commit-through-PR mechanism.
4. **Run Monitor** — **Start Implementation** triggers `crucible run` (workflow_dispatch or local runner); streams sandbox logs; surfaces escalations as actionable cards with response affordances.
5. **Review Queue** — risk-routed PRs: diff, reviewer verdict per rubric item, and spec side by side; approve / request-changes via GitHub API.

### 10.3 UI/UX doctrine

Clean, simple, utilitarian, minimalist, elegant. Concretely: one accent color; generous whitespace; system font stack or one workhorse typeface; dense-but-legible tables; no dashboards-for-dashboards'-sake; every screen answers one question ("where is everything," "what needs me," "what is the agent doing"); keyboard-first where cheap; empty states that teach. The app should feel like a well-made instrument panel, not a product.

### 10.4 Sequencing caution

The Console is built **last** (Phase 5 of the plan) and is itself fed through the Crucible loop as its first multi-PR project — a low-risk, well-specifiable shakedown cruise. Terminal + GitHub's UI carry the calibration weeks; the Console is then designed against *felt* friction rather than imagined friction.

---

## 11. Decision Log

| # | Decision | Rationale | Alternatives rejected |
|---|---|---|---|
| D-01 | Orchestration = git + CI + thin CLI; state machine encoded in artifacts | Deterministic, auditable via git history, debuggable with cat/git log; matches solo/small-team scale | Temporal/LangGraph/agent swarms (premature complexity); mega-prompt self-enforced workflow (violates repeatability — LLMs don't reliably self-enforce process) |
| D-02 | Enforcement in platform primitives (branch protection, required checks, CODEOWNERS), not in the CLI | Enforcement must survive bypassing the tooling — including by the owner tempted by a "quick fix." CLI = convenience; CI = legitimacy | CLI-only enforcement (skippable = convention, not system) |
| D-03 | Java for target systems | Owner's expertise for risk-routed review; best-in-class machine-checkable ecosystem (ArchUnit, PIT, Error Prone, jqwik); strict typing turns hallucinated interfaces into compile errors; "verbosity" is machine-checkable structure | Trend-driven language choice |
| D-04 | Human review as precision instrument: risk-routing + 10% sampling, not full coverage and not zero coverage | Full coverage doesn't scale and adds little over strong gates; zero coverage leaves semantic/security blind spots. Risk list is mechanical, so routing is repeatable | "Never review PRs" (blind spots); "review everything forever" (throws away the gain) |
| D-05 | Oracles authored/approved by human before implementation; agents cannot modify them | Independence of the judge from the judged; prevents tests-describe-the-bugs; the one artifact where human line-by-line attention has maximal leverage | Agent-authored post-hoc tests as sole verification |
| D-06 | Mutation testing (PIT) as a required merge gate | Coverage is gameable by agents; mutation score is not. Main structural defense against vacuous tests and weakened assertions | Line-coverage thresholds alone |
| D-07 | Keep OpenSpec; extend via native schema fork (`oracle-driven`), not external hacks | OPSX schemas are a first-class, declarative version of our precondition chain; templates give a sanctioned home for oracle-authoring instructions; JSON CLI surface composes with our orchestrator. Skipping = rebuilding scaffolding/archival for zero gain | Dropping OpenSpec; enforcing oracles via CLAUDE.md instructions alone (policy without mechanism); external skill bolted around OpenSpec |
| D-08 | `workorder.yaml` (renamed from `task.yaml`) | Too similar to OpenSpec's `tasks.md`; "work order" names the role precisely: authorized, scoped, traceable unit of work with constraints | task.yaml, job.yaml, ticket.yaml |
| D-09 | Reviewer agent: separate context, concrete rubric, machine-parseable verdict, runs as CI | Shared context → correlated errors; vague prompts → vague LGTMs; human-invoked review → sometimes skipped | Same-context self-review; freeform review text; manual invocation |
| D-10 | Hermetic sandboxes: pinned image, no network, fresh per run, protected paths denied | Closes agents' degenerate paths to green structurally; kills "flaky because environment"; the bench must be tamper-proof because the thing under test has a shell | Shared dev environments; trust-based path restrictions |
| D-11 | Console is stateless (git+GitHub = source of truth), local-first, built last | Two sources of truth would break the enforcement model; terminal fallback must be total; design against felt friction | Console-with-DB as workflow engine; building the UI first |
| D-12 | Escalation protocol: structured file ends the run; humans resolve via spec/oracle change | Prevents thrashing and agent improvisation on ambiguity; ambiguity is a spec bug | Unlimited retries; agent "best judgment" on ambiguity |
| D-13 | The ratchet: postmortems close with a gate commit | Reliability must be monotonic; converts operational pain into permanent verification | Postmortems as documents |
| D-14 | Calibration period: owner reviews everything for ~2 weeks, then mechanically retreats | Rubric, risk list, and diff caps must be calibrated against the agent's *actual* failure modes, not hypothetical ones; trust is earned by gates catching things the human would have caught | Turning on auto-merge from day one |
| D-15 | System name "Crucible"; CI gates "the Gauntlet"; web app "Crucible Console" | Coherent metaphor (rigorous testing inside an unyielding vessel); low collision risk vs Foundry/Sentinel | Foundry, Ratchet, Sentinel, Loom |

---

## 12. Brainstorm Log — Questions Resolved Along the Way

Condensed record of the conceptual questions worked through in design, kept because agents (and future-you) will re-ask them.

- **Is invariants-first just TDD?** It borrows TDD's mechanism (checks before code) but not its granularity. It's closer to Design by Contract + BDD: business rules and system-level properties authored by the human, holding across all features. The agent is free to do classic red-green-refactor TDD in its inner loop underneath.
- **Is mutation testing like Chaos Monkey?** Same instinct ("deliberately break things, see if the safety net notices"), different layer: Chaos Monkey injects faults into running infrastructure to test operational resilience; mutation testing injects faults into source code, pre-merge, to test the strength of the test suite. Eventually both; mutation testing gates merges.
- **Are oracles the same as intents?** No — this distinction is the crux. Intent = the human-level goal in natural language. Spec = the sharpened, precise requirement. Oracle = the executable judge that decides pass/fail. Intent is what you want, the spec is what you said, the oracle is what actually decides. Agents are steered by specs but judged only by oracles.
- **Is the hermetic sandbox just a test bench?** Yes — with the determinism of a hardware rig, plus one extra property software benches don't usually need: tamper-proofness, because the device under test is also an actor with a shell.
- **Are skills part of the harness?** Squarely. Skills, CLAUDE.md, prompts, tool configs, guardrail scripts — all harness, all versioned, all reviewed like code, because a bad skill degrades every subsequent PR silently.
- **Is the reviewer agent a clean-code enforcer?** No — style is the cheap part and linters do it deterministically. The reviewer is an adversarial auditor with a checklist, pointed exclusively at what static tools can't see.
- **Is this "loop engineering"?** Directionally yes, precisely a *state machine*: different states have different owners (human, implementer, CI, reviewer), and failure transitions matter as much as the happy path. The flow's direction is the emergent result of each step's preconditions.
- **Won't specs-as-source-of-truth eventually mean regenerating code from specs?** Partially, and it's a useful north star: design modules small and contract-bounded enough that regeneration is *possible*. Not fully practical for large systems today (cost, migrations, data schemas), but the constraint is a good forcing function for extensibility regardless.

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Owner bypasses own workflow under time pressure | Enforcement in platform primitives (D-02); hotfixes go through the loop; the loop is kept fast enough that going around it never wins. |
| Reviewer agent rubber-stamps | Concrete rubric with per-item verdict + evidence; separate context; rubric grows via the ratchet; 10% human sampling audits the auto-merge stream. |
| Oracle set is weak → green but wrong | Mutation testing keeps tests honest; property-based oracles over examples; calibration period; every escaped defect adds an oracle. |
| Agent thrashing / runaway iterations | Iteration budget in workorder.yaml; escalation protocol; runlogs for audit. |
| OpenSpec upstream churn breaks the schema/templates | Version pinned in toolchain image; `openspec update` treated as reviewed harness change; schema fork is ours, not upstream's. |
| Model/prompt drift degrades output quality | Pipeline eval suite re-run on any model/prompt/skill change; harness changes are commits, bisectable. |
| Console becomes load-bearing and then breaks | Statelessness doctrine (§10.1); total terminal fallback tested as an acceptance criterion; Console built last and kept thin. |
| PIT runtime cost on large modules | Changed-code scope; threshold ratcheting; incremental analysis; run heaviest gates on merge queue if needed. |
| Correlated blind spots between implementer and reviewer models | Different context always; optionally different model for review; human risk-routing covers the highest-consequence categories regardless. |

---

## 14. Success Criteria

Crucible v1 is successful when, over a representative month of feature work:

1. **Zero merges** occur without a valid work order and green Gauntlet (verified by audit of git history — should be structurally impossible).
2. **100% of SHALL/MUST requirements** in merged changes have resolving oracles (traceability linter history).
3. The owner's time distribution shifts to specs/oracles/escalations/risk-review, with routine implementation PRs requiring no human reading beyond the sampled 10%.
4. At least one escaped defect has completed the full ratchet loop (postmortem → new oracle/rule as a commit → would-have-caught verified).
5. The pipeline eval suite exists and has caught at least one harness regression before it shipped (or demonstrably runs on every harness change).
6. The Console can be killed mid-workflow and every operation completes from terminal + GitHub UI with no data loss (fallback drill passed).

---

*End of concept document. Proceed to `CRUCIBLE-IMPLEMENTATION-PLAN.md` to build.*
