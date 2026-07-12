# crucible-toolchain — versions lock

Human-readable manifest of every pinned component in `toolchain/Dockerfile`.
**Must match the Dockerfile.** Update only via reviewed PRs (a version bump here is a
version bump there, and vice-versa).

- **Image:** `ghcr.io/vivardhandevaki/crucible-toolchain`
- **Version:** `0.1.0`
- **Built / resolved:** 2026-07-12
- **Platform:** linux/amd64
- **Published image digest:** _(filled in after `docker push` to GHCR)_

## Base image

| Component | Value |
|---|---|
| Base | `eclipse-temurin:21-jdk` |
| Pinned digest | `sha256:1eeacc8c295ed4805f6ffead2417b1936aad296b02ea9e56b457230befc9e98d` |
| OS | Ubuntu 26.04 LTS |
| JDK | OpenJDK 21.0.11 (Temurin, LTS) |

## Pinned tools (Dockerfile ARGs)

| Tool | Version | Install method | Verification |
|---|---|---|---|
| Node.js | 22.23.1 (LTS "Jod") | official tarball | SHASUMS256.txt |
| npm (bundled with Node) | 10.9.8 | — | — |
| Gradle | 9.6.1 | distribution zip | `.sha256` |
| Semgrep | 1.169.0 | pip in isolated venv (`/opt/semgrep`) | pip resolver |
| GitHub CLI (`gh`) | 2.96.0 | release tarball | `checksums.txt` |
| OpenSpec (`@fission-ai/openspec`) | 1.6.0 | `npm i -g` | npm registry |
| Claude Code (`@anthropic-ai/claude-code`) | 2.1.207 | `npm i -g` | npm registry |

## From base image (apt / bundled, recorded for reference)

| Tool | Version |
|---|---|
| git | 2.53.0 |
| python3 | 3.14.4 |

## Notes

- Consumer Java projects pin their **own** Gradle via the Gradle wrapper; the image's
  Gradle 9.6.1 is a convenience/CI tool, not the authority for any consumer build.
- OpenSpec 1.6.0 confirmed to expose the `openspec` binary, `openspec init`,
  `openspec config profile` (expanded `/opsx:` profile), and `openspec update`.
  **Phase 1 TODO:** confirm the exact `openspec schema fork` / `openspec schema validate`
  command surface for the `oracle-driven` fork (documented in OpenSpec `docs/customization.md`).
