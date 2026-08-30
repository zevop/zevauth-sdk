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

# Which packages changed since their version was last set.
#
# The first version of this looked at uncommitted changes, which meant
# committing first — the right habit — made it report nothing to do.
# Now: find the commit that set each package's current version, and
# release the package if anything under it changed since. Name packages
# explicitly to override: `npm run release -- js react`.
EXPLICIT=""
for arg in "$@"; do
  case "$arg" in
    --dry-run|patch|minor|major) ;;
    *) EXPLICIT="$EXPLICIT @zevauth/${arg#@zevauth/}" ;;
  esac
done

if [ -n "$EXPLICIT" ]; then
  CHANGED="$EXPLICIT"
else
  CHANGED=""
  for dir in packages/*/; do
    name=$(node -p "require('./$dir/package.json').name")
    version=$(node -p "require('./$dir/package.json').version")
    # The commit that introduced the current version line.
    since=$(git log -1 --format=%H -S"\"version\": \"$version\"" -- "$dir/package.json" 2>/dev/null || true)
    if [ -z "$since" ]; then
      CHANGED="$CHANGED $name"          # never released from this history
    elif ! git diff --quiet "$since"..HEAD -- "$dir" || ! git diff --quiet -- "$dir"; then
      CHANGED="$CHANGED $name"          # committed or uncommitted changes since
    fi
  done
fi

if [ -z "$CHANGED" ]; then
  echo "Nothing changed in any package since its version was last set."
  echo "Name one to force it: npm run release -- js"
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
