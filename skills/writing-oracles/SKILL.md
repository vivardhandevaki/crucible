---
name: crucible-writing-oracles
description: How to draft oracles (executable judges of requirements) in a Crucible-governed repo — type selection, jqwik/ArchUnit/Liquibase idioms, the oracles.md table format, and the APPROVED-via-merge lifecycle. Use when drafting the oracles artifact or oracle implementations.
---

# Writing oracles

An oracle is an **executable judge** of a requirement — it decides pass/fail with
no human in the loop. You draft; only the owner merges (`/oracles` is protected).

## Choosing the type (strongest that fits)

| Type | Use when | Lives in |
|---|---|---|
| `property` | the requirement quantifies over inputs ("for any…", "never…") | `oracles/properties/` (jqwik) |
| `example` | one specific case matters (a reported bug, a boundary) | `oracles/properties/` (JUnit) |
| `contract` | API surface conformance | `oracles/contracts/` (from OpenAPI) |
| `db-constraint` | an invariant the database itself can enforce | `oracles/constraints/` (Liquibase) |
| `archunit` | structure: layering, injection, who may mutate what | `oracles/arch/` |
| `ci-check` | anything a script can verify in CI | `ci/` (owner adds) |
| `human-audit` | genuinely non-automatable — needs written justification | n/a |

Prefer `property` over `example`. A requirement that resists automation must be
sharpened, downgraded out of SHALL/MUST, or explicitly typed `human-audit` —
never silently unmapped.

## jqwik idioms for this stack

- One property per requirement facet; name it after the requirement:
  `@Property void refundNeverExceedsCapturedAmount(@ForAll("orders") Order o)`.
- Generators (`@Provide`) must cover the whole domain the SHALL quantifies over —
  a generator gap is how bugs escape (stacked-promo lesson). Generate structure,
  not just scalars.
- Fixed seed in CI (repeatability); the nightly job rotates seeds (exploration).
- Money: `BigDecimal` with the project rounding policy; assert to the cent.

## ArchUnit idioms

One rule per file, named for the law it enforces:
`layered_architecture_is_respected`, `only_state_machines_mutate_domain_state`
(annotation-driven), `no_field_injection`, `no_java_util_date`.

## The oracles.md table (parsed by CI — format is exact)

`| REQ ID | Requirement (verbatim SHALL/MUST) | Oracle ID(s) | Oracle Type | Implementation Path | Status |`

- Oracle IDs: `ORA-<CHANGE>-<n><letter>`, stable, unique.
- Status lifecycle: `DRAFT` → `IMPLEMENTED` (file exists on your branch) →
  `APPROVED` (merged to main under `/oracles` — only the owner's merge does this).
- Every SHALL/MUST in the change's spec deltas needs a row; the `traceability`
  gate rejects unmapped requirements.
- Additions only under `/oracles` — never modify existing oracle files.

## Quality bar (the owner reviews these line by line)

Ask of every oracle: *would it fail if the requirement were violated in the ways
that matter?* An oracle that can't fail is worse than none — it launders trust.
For bug-fix oracles: prove the oracle fails on current main before the fix.
