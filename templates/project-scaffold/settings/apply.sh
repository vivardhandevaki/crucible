#!/usr/bin/env bash
#
# apply.sh — apply settings/branch-protection.json to the default branch as a
# GitHub ruleset. Idempotent: creates the ruleset if absent, updates it if present.
# The ruleset name is read from the config's `.name` field, so this same script
# serves both the framework repo and (when copied by `crucible init`) consumer repos.
#
# Phase-incremental status checks:
#   (default)      -> applies everything EXCEPT the required_status_checks rule.
#                     (The checks don't exist until their CI is built; requiring a
#                      non-existent check would block every PR forever.)
#   --with-checks  -> applies the full ruleset including required status checks.
#
# Usage:
#   settings/apply.sh                 # bootstrap (no required checks)
#   settings/apply.sh --with-checks   # once CI emits the checks
#   REPO=owner/name settings/apply.sh # override target repo (default: current)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="${SCRIPT_DIR}/branch-protection.json"

command -v gh >/dev/null || { echo "error: gh CLI not found" >&2; exit 3; }
command -v jq >/dev/null || { echo "error: jq not found" >&2; exit 3; }
[ -f "$CONFIG" ]         || { echo "error: $CONFIG not found" >&2; exit 3; }

REPO="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
RULESET_NAME="$(jq -r '.name' "$CONFIG")"

WITH_CHECKS=0
[ "${1:-}" = "--with-checks" ] && WITH_CHECKS=1

# Build the payload: drop the private _comment key always; drop the
# required_status_checks rule unless --with-checks was passed.
PAYLOAD="$(jq \
  --argjson withChecks "$WITH_CHECKS" '
    del(._comment)
    | if $withChecks == 1
      then .
      else .rules |= map(select(.type != "required_status_checks"))
      end
  ' "$CONFIG")"

if [ "$WITH_CHECKS" -eq 1 ]; then
  echo "Applying ruleset '$RULESET_NAME' to $REPO WITH required status checks."
else
  echo "Applying ruleset '$RULESET_NAME' to $REPO WITHOUT required status checks (bootstrap)."
  echo "  -> re-run with --with-checks once CI emits its checks."
fi

EXISTING_ID="$(gh api "repos/${REPO}/rulesets" --jq \
  ".[] | select(.name == \"${RULESET_NAME}\") | .id" 2>/dev/null || true)"

if [ -n "$EXISTING_ID" ]; then
  echo "Updating existing ruleset id=${EXISTING_ID}."
  echo "$PAYLOAD" | gh api --method PUT "repos/${REPO}/rulesets/${EXISTING_ID}" --input - >/dev/null
else
  echo "Creating new ruleset."
  echo "$PAYLOAD" | gh api --method POST "repos/${REPO}/rulesets" --input - >/dev/null
fi

echo "Done. Verify: gh api repos/${REPO}/rulesets --jq '.[].name'"
