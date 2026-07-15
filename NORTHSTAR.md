# NORTHSTAR.md — how the finished Crucible works

**Status:** aspirational reference. This document describes the **final, polished
version** of the framework — the destination every phase and backlog item moves
toward. Where today's behaviour falls short of a step below, the gap is tracked in
[BACKLOG.md](BACKLOG.md); the mapping is in [§5](#5-the-gap-between-here-and-there).
Companions: [CRUCIBLE-CONCEPT.md](CRUCIBLE-CONCEPT.md) (why),
[CRUCIBLE-USAGE-WALKTHROUGHS.md](CRUCIBLE-USAGE-WALKTHROUGHS.md) (day-in-the-life),
[site/index.html](site/index.html) (the public explanation of the same north star).

---

## 1. The definition of done

Crucible is finished when all of the following hold for a consumer project:

1. **One-time setup is the only terminal work.** After the prerequisites in §2 are
   done once, the entire feature lifecycle — propose → spec → oracles → implement →
   gate → review → merge → archive — completes **inside the Console with zero
   manual CLI commands**. The CLI remains the complete, equivalent fallback
   (statelessness doctrine, ADR 0003): anything the Console does, §4 shows the
   terminal path for.
2. **Every transition is recorded where it happens.** The work-order manifest
   (`workorder.yaml`) reflects reality through the *whole* machine —
   `DRAFT_SPEC` to `ARCHIVED` — with no state the machinery forgets to record and
   no step where the Board silently goes stale.
3. **Every gate passes honestly.** Governance PRs (spec/oracle approvals) merge on
   green checks, not owner bypass. Implementation PRs pass all 11 required checks
   or don't merge. No red-but-expected checks anywhere.
4. **The sandbox is hermetic in fact, not just intent.** Pinned image, fresh per
   run, protected paths denied by permissions *and* the container boundary, and
   network egress restricted to an explicit allowlist (the model API and the
   artifact mirror only).
5. **The harness is self-guarding.** `harness-evals` runs on every harness change
   and is a required check after calibration; the calibration protocol
   ([CALIBRATION.md](CALIBRATION.md)) has been completed and auto-merge is on.
6. **The runtime layer closes the loop** (Phase 7): merge → canary → SLO watch →
   auto-rollback, with `CANARY`/`DONE` recorded and postmortems feeding the ratchet.

## 2. Prerequisites — the one-time setup (terminal allowed here)

Per machine: `git`, `gh` (logged in), `claude` (logged in), Node ≥ 22, Docker,
`npm i -g @fission-ai/openspec @crucible/cli`.

Per project (once):

```bash
mkdir my-system && cd my-system && git init
crucible init --owner <gh-handle>            # scaffold + oracle-driven schema + skills
gradle wrapper --gradle-version 9.6.1        # java profile bootstrap
git add -A && git commit -m "chore: crucible init" && git push -u origin main
settings/apply.sh                            # branch protection: the 11 required checks
claude setup-token                           # mint once
gh secret set CLAUDE_CODE_OAUTH_TOKEN        # reviewer CI job + sandbox runs
export CRUCIBLE_REPO=$PWD && npm run console  # from the framework repo; open the Console
```

From this point on, the north star is: **you never type another command.**

## 3. End to end, Console only

One feature — `TODO-1 · "Add a todo item"` — from intent to archived, without
leaving the browser. Every step names its gatekeeper; the Console is never one of
them (it is a view + remote control, never the state machine).

| # | Screen | You do | Machinery does | State after |
|---|--------|--------|----------------|-------------|
| 1 | **New Feature** | Enter ID/title/slug → **Create** | `crucible new` scaffolds `workorders/TODO-1-*/workorder.yaml` | `DRAFT_SPEC` |
| 2 | **New Feature** (spec chat) | Describe intent; answer the agent's edge-case probes; watch the SHALL/MUST delta render live | Chat drafts the OpenSpec artifacts (proposal + spec delta) | `DRAFT_SPEC` |
| 3 | **New Feature** | **Approve Spec** | Console opens a labelled governance PR to the protected path; gates show neutral-green on it; you merge it *in the Console*; the Console detects the merge, **syncs the worktree and records the transition** | `SPEC_APPROVED` |
| 4 | **Oracle Review** (oracle chat) | Optionally describe what to cover → **Draft oracles** | Chat emits `oracles.md` (the map) **and** the implementation files under `/oracles/**`, parsed and rendered for review | `ORACLES_AUTHORED` |
| 5 | **Oracle Review** | Read the traceability table (unmapped SHALLs show red and block) and each oracle's source, line by line — *this is the real code review* → **Approve Oracles** | Governance PR with map + implementations; you merge in-Console; transition recorded; traceability linter green | `ORACLES_APPROVED` |
| 6 | **Oracle Review / chat** | Skim the drafted `design.md` + `tasks.md` for scope sanity | The same chat flow completes the planning artifacts (`tasks` unblocks once oracles exist — the `oracle-driven` schema enforces the order) | `ORACLES_APPROVED` |
| 7 | **Run Monitor** | **Validate** (precondition report renders green) → **Package** → **Start Implementation** | Bundle assembled; fresh sandbox from the pinned image, egress-allowlisted, bundle read-only; the log pane **streams live** | `PACKAGED → IMPLEMENTING` |
| 8 | — (walk away) | Nothing | Agent implements inside `modules_allowed`, writes its own tests under your oracles; the **runner** (never the agent) pushes and opens the PR; the Gauntlet's 11 checks run; red gates feed back into a new attempt; the reviewer agent (separate context) posts its verdict; deterministic routing labels auto-merge or requests you | `PR_OPEN → GATES_GREEN → AI_REVIEWED → ROUTED_*` |
| 9 | **Review Queue** (risk-routed PRs only) | Read diff · verdict · spec side by side; **Approve** (or request changes → new attempt) | Platform merges on all-green; the Console records the post-merge transition | `MERGED` |
| 10 | — | Nothing | CD: canary deploy, SLO watch, auto-rollback on breach (Phase 7) | `CANARY → DONE` |
| 11 | **Board** | **Archive** on the done card | Archive guard confirms all PRs merged; spec deltas fold into the living specs; transition recorded | `ARCHIVED` |

**Escalation (the failure path, also Console-only):** if the agent hits genuine
ambiguity it writes `escalation.md` and stops; the Run Monitor shows the card with
the agent's options; you pick one, **amend the spec/oracles in the same chat
flows** (steps 2–5), the Console records the resolution transition
(`ESCALATED → SPEC_APPROVED | ORACLES_APPROVED | PACKAGED`), and you re-package and
re-run from the Run Monitor. Ambiguity is a spec bug; the fix is always upstream.

**Steady-state hygiene:** the Review Queue shows the weekly `crucible audit`
sample; a red `harness-evals` scorecard blocks harness PRs; every escaped defect
ends as a ratchet commit (new oracle / rubric line / ArchUnit rule).

## 4. The same flow, terminal only (the fallback that must always work)

The Console adds ergonomics, never capability. Killing it mid-workflow loses
nothing — this sequence is the identical state machine through its native
interfaces:

```bash
# 1–2  propose + spec
crucible new TODO-1 --title "Add a todo item" --change add-todo-item
claude                                   # in the repo: /opsx:new add-todo-item, then
                                         # /opsx:continue — draft proposal + spec delta
# 3    approve the spec (approval = a merge, not a UI flag)
git checkout -b spec/add-todo-item && git add openspec/changes/add-todo-item && \
  git commit -m "spec(TODO-1): add todo item" && gh pr create --fill
gh pr merge --squash                     # you are the CODEOWNER
crucible validate TODO-1 --advance       # record SPEC_APPROVED

# 4–5  oracles (map + implementations), the mandatory human gate
claude                                   # /opsx:continue → oracles.md + /oracles/** impls
crucible validate TODO-1 --advance       # record ORACLES_AUTHORED
git checkout -b oracles/add-todo-item && git add openspec/changes/add-todo-item/oracles.md oracles/ && \
  git commit -m "oracles(TODO-1)" && gh pr create --fill && gh pr merge --squash
crucible validate TODO-1 --advance       # record ORACLES_APPROVED (checks impls on main)

# 6–7  plan, package, run
claude                                   # /opsx:continue → design.md + tasks.md
crucible package TODO-1                  # bundle + PACKAGED
crucible run TODO-1                      # sandbox; the RUNNER opens the PR → PR_OPEN

# 8    watch (optional)
crucible status TODO-1                   # or: gh pr checks --watch
crucible escalations                     # if the agent escalated

# 9    review only if routed to you
gh pr review --approve                   # verdict table is a PR comment; same 11 checks

# 10–11  archive after merge
claude                                   # /opsx:archive (guard: all PRs merged)
crucible audit --sample 0.1              # weekly hygiene
```

Everything both walkthroughs touch — `workorder.yaml`, approval commits, PR
labels, status checks — is the same artifact either way. That equivalence is the
statelessness doctrine, and it is tested (the §5.4 guarantee tests + the
Console-off fallback drill).

## 5. The gap between here and there

What already matches the north star: the state machine core (single-sourced,
126 CLI tests green), `init/new/validate/package/run/review/route/audit/eval`, the
three shared-core gates + reviewer + deterministic routing as reusable CI, the
sandbox runner with runner-opened PRs, escalation handling, the eval suite wired
into `harness-evals`, and the Console's Board / New Feature (spec chat + Approve
Spec) / Oracle Review (table + Approve Oracles) / Run Monitor / Review Queue with
the §5.4 statelessness guarantees (15 server tests green).

What's missing, mapped to §3 steps — details and file pointers live in
[BACKLOG.md](BACKLOG.md):

| §3 step | Gap today | Backlog entry |
|---------|-----------|---------------|
| 3, 5 | Governance PRs show four red gates; merged via owner bypass | *Governance-PR gates are noisy* |
| 3, 5 | Merged approval ≠ recorded transition; Board goes stale until `crucible validate --advance` in a terminal | *Console doesn't record state transitions* |
| 3, 5, 9 | Console never syncs the local worktree after a merge, so every read (and `validate`) sees stale files until a manual `git pull` | *Console never syncs the local worktree* |
| 4 | No oracle-authoring chat; Oracle Review is a dead end before `oracles.md` exists | *Oracle-authoring chat in the Console* |
| 6 | No Console path to `design.md`/`tasks.md` (and the spec chat is a plain drafting prompt, not an OpenSpec session) | *No Console path for planning artifacts* |
| 7 | No **Package** button and no advance affordance in the Run Monitor (the server routes exist; no screen calls them) | *Package and record-advance actions missing from the UI* |
| 7 | Run log fills only when the run finishes | *Live run-log streaming* |
| 7 | Sandbox runs on the default Docker network, not an egress allowlist | *Sandbox egress allowlist* |
| 9, 10, 11 | Nothing records `MERGED`/`CANARY`/`DONE`/`ARCHIVED` into the manifest; no Archive action | *Post-merge states are never recorded* |
| Escalation | The Run Monitor's resolve button just opens the New Feature form | *Escalation resolution flow is a stub* |
| Escalation | No notification fires on escalation | *Escalation notifications* |
| 10 | Runtime layer (canary/SLO/rollback) not built | Phase 7 (README roadmap) |
| §2 | CLI unpublished (`npm link` install); GHCR toolchain image unpublished | *Publish the GHCR toolchain image* + setup notes |

The ordering that gets to the north star fastest: worktree sync + record-advance
(unblocks the loop) → Package button → oracle chat + planning artifacts (kills the
last mid-loop terminal drops) → governance-PR labels/gates → post-merge recording +
archive → live log streaming → egress allowlist → Phase 7.
