#!/usr/bin/env bash
#
# apply.sh — apply all GitHub-side governance for a Crucible repo, idempotently:
#   1. the branch-protection ruleset (settings/branch-protection.json), INCLUDING
#      required status checks — so nothing merges until the Gauntlet is green;
#   2. the Crucible labels the runner/router rely on (crucible, risk:*, harness-change);
#   3. the default workflow token permission = write (the reviewer reusable workflow
#      needs contents:write + pull-requests:write for routing/auto-merge; without it
#      the call fails at startup).
#
# The ruleset name is read from the config's `.name` field, so this same script
# serves the framework repo and (when copied by `crucible init`) consumer repos.
#
# Required status checks are applied BY DEFAULT. The Gauntlet runs on every PR, so
# the contexts always report; requiring them up front is safe and is the whole point
# of Crucible. `--no-checks` exists only for the rare bootstrap-before-CI case.
#
# Usage:
#   settings/apply.sh                 # full enforcement (recommended, default)
#   settings/apply.sh --no-checks     # ruleset without required checks (bootstrap only)
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

WITH_CHECKS=1
[ "${1:-}" = "--no-checks" ] && WITH_CHECKS=0

# --- 1. Ruleset -----------------------------------------------------------------
# Drop the private _comment key always; drop required_status_checks only with --no-checks.
PAYLOAD="$(jq \
  --argjson withChecks "$WITH_CHECKS" '
    del(._comment)
    | if $withChecks == 1
      then .
      else .rules |= map(select(.type != "required_status_checks"))
      end
  ' "$CONFIG")"

if [ "$WITH_CHECKS" -eq 1 ]; then
  echo "Applying ruleset '$RULESET_NAME' to $REPO WITH required status checks (enforced)."
else
  echo "Applying ruleset '$RULESET_NAME' to $REPO WITHOUT required status checks (bootstrap only)."
  echo "  -> re-run without --no-checks to enforce the Gauntlet."
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

# --- 2. Labels ------------------------------------------------------------------
# The runner labels every PR `crucible`; the router reads `risk:*`; `harness-change`
# is the protected-path escape hatch. (Per-work-order `wo:<ID>` labels are created
# on demand by `crucible run`.) --force makes this idempotent.
ensure_label() { gh label create "$1" -R "$REPO" --color "$2" --description "$3" --force >/dev/null 2>&1 || true; }
ensure_label "crucible"       "5319e7" "Crucible-managed PR"
ensure_label "auto-merge"     "0e8a16" "Routed AUTO — auto-merge enabled"
ensure_label "harness-change" "fbca04" "Modifies the Crucible harness (protected paths)"
for r in auth money data api deps; do ensure_label "risk:$r" "d93f0b" "Risk path: $r"; done
echo "Labels ensured: crucible, auto-merge, harness-change, risk:{auth,money,data,api,deps}."

# --- 3. Workflow token permissions ---------------------------------------------
# The reviewer reusable workflow requests contents:write + pull-requests:write;
# a read-only default caps it and fails the reusable-workflow call at startup.
gh api --method PUT "repos/${REPO}/actions/permissions/workflow" \
  -f default_workflow_permissions=write -F can_approve_pull_request_reviews=true >/dev/null
echo "Default workflow token permission set to: write."

# --- 4. Allow auto-merge --------------------------------------------------------
# Deterministic routing enables auto-merge on clean PRs; without this repo setting
# that enablement silently no-ops and a fully-green PR sits unmerged.
gh api --method PATCH "repos/${REPO}" -F allow_auto_merge=true >/dev/null
echo "Auto-merge enabled at the repository level."

echo "Done. Verify: gh api repos/${REPO}/rulesets --jq '.[].name'"
