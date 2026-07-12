# Crucible toolchain image.
#
# One image used identically locally, in CI (reusable Gauntlet workflows), and in
# agent sandboxes. Everything is pinned; downloads are checksum-verified at build.
# Published to GHCR as ghcr.io/vivardhandevaki/crucible-toolchain:<version>.
#
# Rebuild + version bumps happen only via reviewed PRs; toolchain/versions.lock.md
# is the human-readable manifest and must match this file.

# Base: Eclipse Temurin JDK 21 (LTS), pinned by digest (tag resolved 2026-07-12).
FROM eclipse-temurin:21-jdk@sha256:1eeacc8c295ed4805f6ffead2417b1936aad296b02ea9e56b457230befc9e98d

# --- Pinned tool versions (mirror in versions.lock.md) ---
ARG NODE_VERSION=22.23.1
ARG GRADLE_VERSION=9.6.1
ARG SEMGREP_VERSION=1.169.0
ARG GH_VERSION=2.96.0
ARG OPENSPEC_VERSION=1.6.0
ARG CLAUDE_CODE_VERSION=2.1.207

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ENV DEBIAN_FRONTEND=noninteractive

# --- OS packages ---
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        git curl ca-certificates unzip xz-utils python3 python3-venv jq gnupg; \
    rm -rf /var/lib/apt/lists/*

# --- Node.js (official tarball, checksum-verified) ---
RUN set -eux; \
    arch=x64; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${arch}.tar.xz"; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"; \
    grep " node-v${NODE_VERSION}-linux-${arch}.tar.xz\$" SHASUMS256.txt | sha256sum -c -; \
    tar -xJf "node-v${NODE_VERSION}-linux-${arch}.tar.xz" -C /usr/local --strip-components=1 --no-same-owner; \
    rm "node-v${NODE_VERSION}-linux-${arch}.tar.xz" SHASUMS256.txt; \
    node --version; npm --version

# --- Gradle (checksum-verified) ---
RUN set -eux; \
    curl -fsSLO "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip"; \
    sha256_expected="$(curl -fsSL "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip.sha256")"; \
    echo "${sha256_expected}  gradle-${GRADLE_VERSION}-bin.zip" | sha256sum -c -; \
    unzip -q "gradle-${GRADLE_VERSION}-bin.zip" -d /opt; \
    ln -s "/opt/gradle-${GRADLE_VERSION}/bin/gradle" /usr/local/bin/gradle; \
    rm "gradle-${GRADLE_VERSION}-bin.zip"; \
    gradle --version

# --- GitHub CLI (release tarball, checksum-verified) ---
RUN set -eux; \
    curl -fsSLO "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz"; \
    curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_checksums.txt" -o gh_checksums.txt; \
    grep " gh_${GH_VERSION}_linux_amd64.tar.gz\$" gh_checksums.txt | sha256sum -c -; \
    tar -xzf "gh_${GH_VERSION}_linux_amd64.tar.gz"; \
    install "gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh; \
    rm -rf "gh_${GH_VERSION}_linux_amd64" "gh_${GH_VERSION}_linux_amd64.tar.gz" gh_checksums.txt; \
    gh --version

# --- Semgrep (isolated venv; Ubuntu marks the system env externally-managed) ---
RUN set -eux; \
    python3 -m venv /opt/semgrep; \
    /opt/semgrep/bin/pip install --no-cache-dir --upgrade pip; \
    /opt/semgrep/bin/pip install --no-cache-dir "semgrep==${SEMGREP_VERSION}"; \
    ln -s /opt/semgrep/bin/semgrep /usr/local/bin/semgrep; \
    semgrep --version

# --- npm global tools: OpenSpec (SDD) + Claude Code (agent runtime) ---
RUN set -eux; \
    npm install -g --no-fund --no-audit \
        "@fission-ai/openspec@${OPENSPEC_VERSION}" \
        "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"; \
    openspec --version; \
    claude --version

LABEL org.opencontainers.image.title="crucible-toolchain" \
      org.opencontainers.image.description="Pinned, hermetic toolchain for the Crucible framework (JDK 21, Gradle, Node, Semgrep, gh, OpenSpec, Claude Code)." \
      org.opencontainers.image.source="https://github.com/vivardhandevaki/crucible" \
      org.opencontainers.image.version="0.1.0"

WORKDIR /work
CMD ["bash"]
