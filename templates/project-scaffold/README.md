# project-scaffold — what `crucible init` emits into a consumer repo

This directory is the **template** for a Crucible-governed software system. `crucible init`
copies it into a new (or existing) consumer repo and performs token substitution +
dynamic setup. It is **not** used by the framework repo itself.

## Static files (copied verbatim, with token substitution)

| Path | Purpose | Tokens |
|---|---|---|
| `.github/CODEOWNERS` | Protects the consumer's trusted computing base. | `{{OWNER}}` |
| `.github/pull_request_template.md` | Carries the machine-parsed `Work-Order-ID` block. | — |
| `.github/workflows/gauntlet.yml` | Thin wrapper that calls the framework's **reusable** Gauntlet (`uses: vivardhandevaki/crucible/.github/workflows/gauntlet.yml@<ver>`). *(added in Phase 3)* | `{{CRUCIBLE_VERSION}}` |
| `settings/branch-protection.json` + `settings/apply.sh` | Consumer's ruleset (11 required checks + owner bypass) and its applier. | — |
| `ci/` | Consumer-local gate config: `dependency-allowlist.yml`, `semgrep/custom.yml`, `gates.yml`, `risk-paths.yml`. *(populated in Phase 3)* | — |
| dir skeleton | `specs/ oracles/{properties,contracts,constraints,arch} workorders/ src/` | — |

## Dynamic setup (performed by `crucible init`, not static files)

- Runs `openspec init` in the consumer repo and installs the **`oracle-driven`** schema
  + oracle template from the framework's `schemas/oracle-driven`.
- Writes `CLAUDE.md` from the framework template with project-specific values. *(Phase 4)*
- Sets the consumer's toolchain image pin to the published `ghcr.io/vivardhandevaki/crucible-toolchain:<ver>`.
- Applies branch protection (`settings/apply.sh`) once the owner confirms.

See ADR [`docs/adr/0001-model-b-framework.md`](../../docs/adr/0001-model-b-framework.md).
