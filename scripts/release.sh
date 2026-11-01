#!/usr/bin/env bash
#
# Release from this machine. The primary path is the "Release" GitHub
# Actions workflow (see RELEASING.md): it needs no npm login and no 2FA
# prompt, and publishes with provenance. Use this when CI is unavailable.
#
#   npm run release                    patch bump of every changed package
#   npm run release minor              new capability
#   npm run release -- js react        only these packages
#   npm run release -- --dry-run       show the plan, change nothing
#
# The plan, the dependent-range raising and the publish order all live in
# scripts/release-ci.mjs, shared with CI so the two cannot drift. npm asks
# for your 2FA on each publish.
set -euo pipefail
cd "$(dirname "$0")/.."

DRY=()
BUMP=patch
PKGS=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=(--dry-run) ;;
    --) ;;
    patch|minor|major) BUMP="$arg" ;;
    *) PKGS+=("${arg#@zevauth/}") ;;
  esac
done

PLAN_ARGS=(--bump "$BUMP")
if [ ${#PKGS[@]} -gt 0 ]; then
  PLAN_ARGS+=(--packages "$(IFS=,; echo "${PKGS[*]}")")
fi

node scripts/release-ci.mjs plan "${PLAN_ARGS[@]}" "${DRY[@]}"

if [ "$(node -p "require('./.release-plan.json').releases.length")" = "0" ]; then
  exit 0
fi

if [ ${#DRY[@]} -gt 0 ]; then
  echo
  echo "Dry run: nothing was changed or published."
  exit 0
fi

# Versions and ranges changed, so the lockfile has to follow before the gate.
npm install --package-lock-only --ignore-scripts --no-audit --no-fund

# Nothing is published unless all three pass.
npm run build
npm run typecheck
npm run verify

node scripts/release-ci.mjs publish

echo
echo "Published: $(node scripts/release-ci.mjs summary)"
echo "Commit the version changes and tag each release, e.g.:"
echo "  git commit -am \"Release: $(node scripts/release-ci.mjs summary)\""
echo "  for t in $(node scripts/release-ci.mjs summary); do git tag \"\$t\"; done && git push --follow-tags"
