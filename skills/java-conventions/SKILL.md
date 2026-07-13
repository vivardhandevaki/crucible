---
name: crucible-java-conventions
description: Java conventions for Crucible-governed projects (java language profile) — package layout, error handling, injection, immutability, money, logging, and fast test loops. Use when implementing or reviewing Java code in a consumer repo.
---

# Java conventions (Crucible `java` profile)

These conventions are mechanically backed where possible (ArchUnit/Error Prone/
Semgrep); the rest is what the reviewer agent and the owner expect to see.

## Structure

- Layered: `api` → `service` → `domain` → `persistence`. No reverse or skip
  dependencies (ArchUnit-enforced).
- **Constructor injection only** — no field injection (ArchUnit-enforced).
- Domain state mutation only via designated state-machine classes
  (`@StateMutator` — ArchUnit-enforced).
- Small modules with contract-tested boundaries; one Gradle module per bounded
  concern. Regeneration-friendly beats clever.

## Errors

- **No swallowed exceptions.** Catch-and-continue on an integrity-relevant path
  is a rubric FAIL (R8).
- Domain errors as **sealed types** (`sealed interface RefundError permits …`),
  not exception control flow. Exceptions are for the truly exceptional.
- Fail loud at boundaries; validate inputs where they enter the system (R1).

## Data & values

- Immutability by default: `record` for values, `List.copyOf` at boundaries.
- Illegal states unrepresentable: prefer types over runtime checks
  (`Quantity` over raw `int`, `java.time` only — no `Date`/`Calendar`).
- **Money:** `BigDecimal` via the project's rounding-policy class; never
  `double`; assert to the cent in tests.

## Logging

- Structured, and **no PII** — no `email`, `phone`, `ssn`, `address` field
  values in log statements (Semgrep + rubric R6).
- Log decisions and state transitions, not loop bodies.

## Fast test loop (inside the sandbox)

- Targeted subset first: `./gradlew :module:test --tests 'RefundServiceTest'`.
- Full local suite (including `/oracles`) before declaring done:
  `./gradlew build`.
- Your own unit tests sit UNDER the oracles — they never replace them, and you
  never edit the oracles' assertions (escalate instead).
