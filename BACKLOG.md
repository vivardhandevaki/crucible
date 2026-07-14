# Backlog

Deferred, non-blocking work. Newest items at the top of each section. Keep entries
short: what, why, and any pointer. Promote to an issue/PR when picked up.

## Operational / setup

- **NVD API key for CVE scans.** Obtain a free key (https://nvd.nist.gov/developers/request-an-api-key)
  and set it as the `NVD_API_KEY` repo secret on each Crucible project. Without it the
  OWASP dependency-check NVD download is slow (tens of minutes) whenever it runs — the
  `java / cve` PR job (dependency-changing PRs only) and the weekly `cve-scan.yml` on
  `main`. Not required (both work keyless, just slow). Surfaced during the Phase 4 drill.

- **Publish the GHCR toolchain image.** `write:packages` token was never obtainable, so
  Java CI runs on pinned `setup-java`/`setup-gradle` instead of `crucible-toolchain`.
  Publishing the image makes CI a drop-in container swap and guarantees local/CI parity.
  See `toolchain/` and the v1 note in `.github/workflows/gauntlet-java.yml`.

## Framework hardening

- **Cache NVD data in the `cve` job.** Skipped `actions/cache` for the NVD DB to avoid a
  wrong pinned-SHA break; add it (keyed weekly) so the scan is fast on repeat runs even
  keyless. `.github/workflows/gauntlet-java.yml` (`cve` job).

- **Sync the framework-root `settings/apply.sh`** with the consumer template version
  (enforced-checks-by-default + labels + workflow-perms + auto-merge). Only the consumer
  scaffold copy was updated in v0.2.1.

- **Verify the sandbox permission-matcher assumptions** against future Claude Code
  releases. v0.2.1 relies on empirically-observed behaviour: trailing-glob (`src/**`,
  `workorders/**`) matches new-file writes; a leading `**/<file>` does not; `Edit(**/x)`
  matches existing files. If a release changes this, escalation/tasks writes could break.
  See the `_comment` in `sandbox/claude-settings.template.json`.
