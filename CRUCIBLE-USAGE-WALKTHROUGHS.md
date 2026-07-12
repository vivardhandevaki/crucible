# Crucible — Usage Walkthroughs

**Version:** 1.0
**Audience:** The system owner. This is the "day in the life" manual — concrete, step-by-step procedures for the situations you'll actually encounter.
**Companion documents:** `CRUCIBLE-CONCEPT.md` (why/what), `CRUCIBLE-IMPLEMENTATION-PLAN.md` (how it was built).

Conventions used below:
- **[You]** = a human action. **[Agent]** = an AI agent action. **[Auto]** = deterministic machinery (CLI, CI, platform).
- `State:` lines show the work order's state after the step, matching Appendix A of the implementation plan.
- Every Console action shows its terminal equivalent in parentheses — the fallback is always one command away.

---

## Walkthrough 1 — A Typical Feature, End to End (via the Console)

**Scenario:** Your Order Management System needs *partial cancellation*: cancel individual line items with a proportional refund, unless the item has shipped.

**Total human time: roughly 60–90 minutes, almost all of it in steps 2–4 (spec and oracles). Everything after step 6 is largely unattended.**

### Step 1 — Create the work order (2 min)

1. **[You]** Open the Console → **New Feature** screen.
2. **[You]** Fill the form: ID `OMS-142`, title "Partial cancellation of orders", change slug `partial-cancellation`. Click **Create**.
   *(Terminal: `crucible new OMS-142 --title "Partial cancellation of orders" --change partial-cancellation`)*
3. **[Auto]** `/workorders/OMS-142-partial-cancellation/workorder.yaml` is scaffolded.
   `State: DRAFT_SPEC`

### Step 2 — Draft the spec conversationally (20–40 min)

4. **[You]** In the same screen, the spec chat panel opens. Start the OpenSpec change from chat: `/opsx:new partial-cancellation` (the Console's chat is a normal Claude session with the spec-drafting prompt; OpenSpec slash commands work here as they do in any assistant chat).
5. **[Agent]** Drafts `proposal.md`, then spec deltas via `/opsx:continue`. It will probe edge cases — expect questions like: *What happens when the last remaining item is cancelled — does the order become CANCELLED? Partially shipped quantities of a single line? A cancel racing the shipping cutoff?*
6. **[You]** Answer, push back, decide. Watch the right-hand pane: the rendered spec delta updates live, SHALL/MUST lines highlighted. You're aiming for sharp normative statements, e.g.:
   - `REQ-PC-1`: A line item in ALLOCATED or PENDING SHALL be cancellable; SHIPPED or DELIVERED SHALL NOT.
   - `REQ-PC-2`: Refund SHALL equal (unit price × cancelled qty) − proportional discount, per the money-rounding policy.
   - `REQ-PC-4`: Cancellation SHALL be idempotent per (orderId, lineItemId, requestKey).
   - `REQ-PC-5`: The cancellation decision and shipping-state read SHALL be atomic.
7. **[You]** When satisfied, click **Approve Spec**.
   *(Terminal: commit the change folder on a branch, open a PR, approve it yourself as CODEOWNER, merge.)*
8. **[Auto]** The Console opens a PR to the protected path on your behalf; CODEOWNERS requires you; you approve; it merges. Your approval is now a git commit — durable, auditable.
   `State: SPEC_APPROVED`

### Step 3 — Draft the oracles (15–30 min)

9. **[You]** Still in chat: `/opsx:continue`. Because the project uses the `oracle-driven` schema, the next artifact offered is **oracles** (design can be created in parallel or next — order between them doesn't matter; `tasks` stays BLOCKED until both exist).
10. **[Agent]** Drafts `oracles.md` (the traceability table) and drafts oracle *implementations* on a branch under `/oracles/**`:
    - REQ-PC-1 → `ORA-PC-1a` jqwik property test: for any generated order and any subset of line items in any states, cancellation succeeds iff no selected item is SHIPPED/DELIVERED.
    - REQ-PC-2 → `ORA-PC-2a` property test asserting the ledger invariant: total refunds never exceed amount captured; math matches the rounding policy to the cent across generated discount structures.
    - REQ-PC-4 → `ORA-PC-4a` concurrency test: same request fired N times → exactly one refund row.
    - REQ-PC-5 → `ORA-PC-5a` interleaving test (ship vs cancel, exactly one wins) + `ORA-PC-5b` DB constraint changeset — two independent oracles for the highest-stakes requirement.
    `State: ORACLES_AUTHORED` (oracles.md exists)
11. **[You]** Open the **Oracle Review** screen. This is your real code review, done up front. Read the traceability table (any unmapped SHALL shows red at the top — there should be none), then read each oracle's source inline, line by line. Ask yourself: *would this test fail if the requirement were violated in the ways I care about?* Request changes in chat if not.
12. **[You]** Click **Approve Oracles**.
    *(Terminal: approve and merge the `/oracles` branch PR as CODEOWNER.)*
13. **[Auto]** Oracles merge to `main` under the protected path; the traceability linter is green.
    `State: ORACLES_APPROVED`

### Step 4 — Finish planning artifacts (5 min)

14. **[You]** `/opsx:continue` until `design.md` and `tasks.md` exist (tasks unblocks now that oracles are done). Skim both; `tasks.md` is the agent's own checklist — you're checking scope sanity, not wording.

### Step 5 — Package and launch (2 min)

15. **[You]** Open the **Run Monitor** screen for OMS-142. The state stepper shows where you are. Click **Validate** — the precondition report renders inline (schema valid, OpenSpec artifacts DONE, oracles merged on main, module map non-empty).
    *(Terminal: `crucible validate OMS-142 --advance`)*
16. **[You]** Click **Package**, then **Start Implementation**.
    *(Terminal: `crucible package OMS-142 && crucible run OMS-142`)*
    `State: PACKAGED → IMPLEMENTING`

### Step 6 — Walk away (0 min)

17. **[Auto]** Fresh sandbox from the pinned image, no network, bundle mounted read-only.
18. **[Agent]** Works through `tasks.md`: implements the state-machine change, refund calculation, endpoint; writes its own unit tests underneath your oracles; runs the suite; iterates. It cannot touch `/oracles`, `/specs`, `/ci` — the permission config denies it and the container backstops it.
19. **[Auto]** On local green, the runner (not the agent) pushes the branch and opens the PR with `Work-Order-ID: OMS-142` in the template.
    `State: PR_OPEN`
20. **[Auto]** The Gauntlet runs all eleven gates. Suppose PIT fails at 71% — the failure output goes back as input to a new attempt; the agent strengthens its tests; next push is green.
    `State: GATES_GREEN`
21. **[Auto]** The reviewer agent (separate context: diff + spec + rubric only) posts its verdict. Suppose all PASS except R7 (concurrency) → FLAG with evidence pointing at the transaction boundary.
    `State: AI_REVIEWED`
22. **[Auto]** Routing: this PR touches `refund/**` (risk list) *and* carries an R7 flag → human route. You get a notification.
    `State: ROUTED_HUMAN`

### Step 7 — Your 15-minute review

23. **[You]** Open the **Review Queue**. Three panes: the diff, the reviewer's verdict table, the spec delta. The gates already proved behavior — you read only for what machines can't judge: is the transaction boundary *sensible*, is the refund ledger design something you want to live with, any extensibility debt.
24. **[You]** Approve. *(Terminal/GitHub: normal PR approval.)*
25. **[Auto]** Merge → canary deploy → SLO watch passes.
    `State: MERGED → CANARY → DONE`

### Step 8 — Archive (1 min)

26. **[You]** In chat: `/opsx:archive`. The archive guard confirms all associated PRs are merged, then merges the spec deltas into the living specs.
    `State: ARCHIVED`

**What you did NOT do:** read the implementation while it was being written, babysit the sandbox, or manually check any gate. **What you DID do:** made every judgment call — requirements, oracle quality, the one risky design decision.

---

## Walkthrough 2 — The Same Flow, Terminal Only (Console Down or Not Yet Built)

**Scenario:** identical feature; the Console is unavailable. Nothing is lost — this is the same state machine through its native interfaces. Use this walkthrough during the calibration weeks (before the Console exists) and for the fallback drill.

1. **[You]** `crucible new OMS-142 --title "Partial cancellation of orders" --change partial-cancellation`
2. **[You]** Open Claude Code in the repo. Run `/opsx:new partial-cancellation`, then iterate the spec exactly as in Walkthrough 1 step 2 — the chat just lives in your terminal now.
3. **[You]** Approve the spec the git-native way: the change folder is committed on a branch → `gh pr create` → you approve as CODEOWNER → merge.
4. **[You]** `/opsx:continue` for oracles; review the oracle sources in your editor; approve and merge the `/oracles` PR the same way.
5. **[You]** `/opsx:continue` for design and tasks.
6. **[You]** `crucible validate OMS-142 --advance && crucible package OMS-142 && crucible run OMS-142`
   - Watch progress with `crucible status OMS-142`; tail the transcript in `/workorders/OMS-142-*/runlog/attempt-1/`.
7. **[Auto]** PR opens; Gauntlet and reviewer run exactly as before — they never depended on the Console.
8. **[You]** `crucible status` shows `ROUTED_HUMAN`. Review on the GitHub PR page — the reviewer verdict is right there as a PR comment table, the checks are the same eleven dots. Approve.
9. **[Auto]** Merge → canary → done. **[You]** `/opsx:archive`.

The only things the Console added were ergonomics: the live spec preview, the traceability table rendering, and the one-click approvals. Every source of truth you just touched — workorder.yaml, PRs, status checks, approval commits — is identical in both walkthroughs. That's the statelessness doctrine doing its job.

---

## Walkthrough 3 — When the Agent Escalates (Ambiguous Spec)

**Scenario:** Feature `OMS-155`, "auto-release payment holds after fulfillment." Mid-implementation, the agent discovers that REQ-AR-2 ("release SHALL occur within 5 minutes of fulfillment confirmation") contradicts an existing approved oracle that requires all ledger mutations to happen inside the nightly settlement batch.

1. **[Agent]** Stops (this is iteration 3 of 6 — it does not thrash to the budget). Writes `escalation.md` with the required structure: blocking REQ + oracle IDs, precise description of the contradiction, and options — *(A) relax REQ-AR-2 to "by next settlement batch"; (B) carve a real-time ledger path with a new invariant; (C) release the hold immediately but post the ledger entry at settlement* — each with trade-offs.
   `State: ESCALATED`
2. **[Auto]** Notification fires (GitHub issue + your configured channel). The Run Monitor shows an escalation card; terminal: `crucible escalations`.
3. **[You]** Read it. This is a genuine product decision — exactly the kind of thing that must never be agent improvisation. You pick (C).
4. **[You]** Resolve it *as a spec change*: in chat, amend the spec delta (REQ-AR-2 becomes two SHALLs: immediate hold release; ledger entry at settlement) and add/adjust the corresponding oracle. Approve both through the normal protected-path PRs.
   `State: ESCALATED → ORACLES_APPROVED` (via `crucible validate --advance`)
5. **[You]** `crucible package OMS-155 && crucible run OMS-155` — fresh sandbox, fresh attempt, now against an unambiguous spec. Flow continues as in Walkthrough 1.

**The rule this walkthrough demonstrates:** ambiguity is a spec bug. The fix is always upstream (spec/oracle), never a workaround downstream (code). The escalation file, your decision, and the amended spec are all permanent git history — six months from now you'll know exactly why holds release immediately but settle nightly.

---

## Walkthrough 4 — An Escaped Defect and the Ratchet (Plus the Hotfix Path)

**Scenario:** Two weeks after OMS-142 shipped, support reports a refund off by one cent on an order with a stacked promotion. The property test's generator never produced that discount shape.

### The hotfix (through the loop — never around it)

1. **[You]** `crucible new OMS-163 --title "Fix rounding on stacked-promo refunds" --change fix-stacked-promo-rounding`
2. **[You]** Spec is small — one MODIFIED requirement sharpening the rounding rule for stacked promos. Ten minutes in chat, approve.
3. **[You]** Oracle first, and this is the crucial move: extend the money property test's generator to produce stacked promotions, plus one example-based oracle pinning the exact reported order shape. **Confirm the new oracle fails against current `main`** (the Run Monitor's validate output and the oracle PR's CI run on a branch show this) — a fix oracle that doesn't fail before the fix proves nothing. Approve and merge.
4. **[You]** `crucible validate/package/run` — the agent's fix is judged by an oracle that demonstrably catches the bug. Gauntlet, review, routing (touches `refund/**` → your queue), merge, canary. Elapsed: the loop is fast enough that "going around it" would have saved minutes and cost the guarantee.

### The ratchet (what makes this different from ordinary bugfixing)

5. **[You]** Fill `/harness/POSTMORTEM.md` for the defect. The mandatory closing field — *"Ratchet commit:"* — links the oracle PR from step 3. In this case the generator extension IS the ratchet: the whole class of stacked-promo shapes is now permanently generated on every future run of every money-touching change.
6. **[You]** Ask the second-order question the postmortem prompts: *should the rubric or a gate have caught this?* Here, plausibly yes — add rubric line R11: "money-path changes: does the property generator cover all discount/promo shapes reachable in the domain model? Cite the generator." That's a one-line PR to `/harness/rubric/rubric.yml`.
7. **[Auto]** From this commit forward, the reviewer agent asks R11 on every money-path diff, forever. The system is now stricter than it was before the bug existed.

---

## Walkthrough 5 — A Ten-Minute Reference Card (Steady-State Cheat Sheet)

Your recurring interactions, condensed:

| Situation | What you do |
|---|---|
| New feature | Console **New Feature** (or `crucible new`) → spec chat → **Approve Spec** → oracle review → **Approve Oracles** → **Start Implementation** |
| "Where is everything?" | Console **Board** (or `crucible status`) |
| Notification: PR needs you | Console **Review Queue** (or the GitHub PR page) — read diff + verdict + spec; approve or request changes |
| Notification: escalation | Read options, decide, fix the spec/oracle, re-validate and re-run |
| Weekly hygiene | `crucible audit --sample 0.1` → skim the sampled auto-merged PRs; archive DONE changes with `/opsx:archive` |
| Escaped defect | Hotfix work order (oracle-first, prove it fails on main) + postmortem + ratchet commit |
| Harness/rule change (rubric line, ArchUnit rule, skill edit, threshold ratchet) | Ordinary PR labeled `harness-change` — touches protected paths, so it requires your CODEOWNERS review by construction; evals run on it automatically |
| Console broken / away from your machine | Walkthrough 2 — terminal + GitHub UI are the same state machine |

**The one rule that keeps all of this working:** no code without a work order, no work order without approved oracles — including hotfixes, including your own "quick" ideas. The loop is fast so that going around it never wins.

---

*End of usage walkthroughs.*
