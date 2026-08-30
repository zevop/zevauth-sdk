#!/usr/bin/env bash
#
# Bump, gate and publish only the packages that changed.
#
# The manual version was five commands and a shell loop, which is five
# chances to publish something that did not build. Here the gate runs
# before anything reaches npm, and a failure stops the whole thing.
#
#   npm run release              patch bump (a fix, no new surface)
#   npm run release minor        new capability
#   npm run release -- --dry-run show what would happen, touch nothing
#
# The dry run exists because this script publishes for real, and the only
# previous way to check it did the right thing was to let it.
#
# A minor bump on a 0.x line breaks the `^0.2.0` ranges the packages use
# on each other, so it prints a reminder rather than leaving you to find
# out from a customer's install.
set -euo pipefail

DRY=false
BUMP=patch
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=true ;;
    patch|minor|major) BUMP="$arg" ;;
  esac
done
cd "$(dirname "$0")/.."

# `|| true`, because grep exits 1 when nothing matches and `set -e`
# would kill the script before the friendly message below ever printed.
CHANGED=$(git status --short -- packages \
  | grep -oE 'packages/[a-z]+' | sort -u | sed 's|packages/|@zevauth/|' || true)

if [ -z "$CHANGED" ]; then
  echo "Nothing changed under packages/. Commit or edit something first."
  exit 0
fi

echo "Releasing ($BUMP):"
for p in $CHANGED; do echo "  $p"; done
echo

if [ "$DRY" = true ]; then
  echo "Dry run. Would bump ($BUMP), then build, typecheck, verify, and publish."
  exit 0
fi

# shellcheck disable=SC2086
npm version "$BUMP" $(printf -- '-w %s ' $CHANGED) --no-git-tag-version >/dev/null

# Nothing is published unless all three pass.
npm run build
npm run typecheck
npm run verify

if [ "$BUMP" = "minor" ] || [ "$BUMP" = "major" ]; then
  echo
  echo "NOTE: a $BUMP bump leaves the ^0.x ranges behind."
  echo "      Update the @zevauth/* dependency ranges in every package that"
  echo "      depends on one of these, and publish those too."
  echo
fi

for p in $CHANGED; do
  V=$(node -p "require('./packages/${p#@zevauth/}/package.json').version")
  echo "publishing $p@$V"
  npm publish -w "$p"
done
