---
name: crucible-escalation-protocol
description: When and how to stop work and escalate in a Crucible-governed repo — the escalation.md format, what qualifies as a genuine blocker, and what happens after. Use when a spec is ambiguous, contradictory, or impossible to satisfy alongside existing oracles.
---

# Escalation protocol

Ambiguity is a **spec bug**. The fix is always upstream (spec/oracle change by
the owner) — never a downstream workaround. Escalating well is a success mode,
not a failure.

## Escalate when

- Two requirements (or a requirement and an approved oracle) **contradict**.
- A SHALL is **ambiguous** in a way that changes the implementation.
- The task is **impossible** within the module map / constraints.
- A test or oracle appears **wrong** — you may not edit it; escalate.

## Do NOT escalate for

- Hard work. "The spec is demanding" is not a contradiction.
- Design freedom the spec deliberately leaves you (that's yours, within scope).
- Gate failures with clear causes — fix the code and iterate.

## Format (`workorders/<ID>-<slug>/escalation.md`)

```markdown
# Escalation — <ID>
- Blocking: <requirement/oracle IDs, e.g. REQ-AR-2, ORA-SET-3a>
- Problem: <one precise paragraph: what contradicts/blocks what, and why it
  cannot be resolved by implementation choices>
- Options:
  1. <concrete resolution A> — <trade-offs>
  2. <concrete resolution B> — <trade-offs>
  3. <optional C> — <trade-offs>
- Attempted: <what you tried; iterations used of the budget>
```

All four fields are mandatory. Options must be **decidable** — write them so the
owner can pick one in a minute. Then **stop working**; writing the file ends the
run.

## What happens next (context, not your job)

The owner resolves it as a spec/oracle PR; the work order re-enters at the right
earlier state (`crucible validate --advance --to <state>`); a fresh sandbox gets
an unambiguous spec. Your escalation file is permanent git history — six months
later it documents why the decision went the way it did.

## The prime rule

Escalate **early** — at the moment of discovery, not after burning the budget. A
wrong guess that passes tests is strictly worse than a question: it ships a
misunderstanding with green checkmarks on it.
