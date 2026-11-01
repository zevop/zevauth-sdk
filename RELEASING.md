# Releasing

Releases run in GitHub Actions. Nothing needs to be installed or signed
in on your own machine, and npm never asks for a one-time code: npm
trusts the release workflow's identity directly (Trusted Publishing),
and every package is published with a provenance statement.

## Cutting a release

**From GitHub:** Actions → **Release** → **Run workflow**, then choose:

- **bump**: `patch` for fixes and additive changes, `minor` for anything
  that changes behaviour;
- **packages**: leave empty to release every package that changed since
  its last release, or name some (`js react`);
- **dry-run**: tick it first if you want to see the plan without
  publishing.

**From a terminal:**

```sh
gh workflow run release.yml -f bump=patch
gh workflow run release.yml -f bump=minor -f packages="js react"
gh workflow run release.yml -f dry-run=true
```

The workflow then:

1. **Plans.** It finds the packages that changed since their release tag
   and bumps them. If a bump moves a package outside the range another
   package depends on (on 0.x, any minor bump does), that range is
   raised to the new version and the dependent package is released too,
   so nobody is left resolving the old version.
2. **Gates.** It runs build, typecheck and every package's test suite.
   Nothing is published unless all three pass.
3. **Publishes** in dependency order, so no package is ever on npm before
   the version it requires. A version already on npm is skipped, so you
   can safely rerun a release that failed halfway.
4. **Commits** the new versions to `main` and **tags** each release
   (`@zevauth/react@0.2.8`).
5. **Opens a pull request in `zevop/zevauth-docs`** when `@zevauth/react`
   or `@zevauth/js` changed, so the docs previews use the new version.

## One-time setup

### 1. Tag the versions already on npm

The planner compares each package with its release tag. These versions
were published before the workflow existed, so tag them once:

```sh
git tag @zevauth/js@0.2.7
git tag @zevauth/backend@0.2.2
git tag @zevauth/react@0.2.7
git tag @zevauth/nextjs@0.2.1
git tag @zevauth/ui@0.1.0
git tag @zevauth/vue@0.1.0
git tag @zevauth/expo@0.1.0
git push --tags
```

Run this on the commit the packages were published from. Without these
tags, the planner falls back to the commit that set each version, and
may release `ui` and `vue` again for no reason.

### 2. Create the `npm` environment

GitHub → this repository → **Settings → Environments → New environment**,
named `npm`. Optionally add yourself as a required reviewer, so every
release waits for your approval before it publishes.

### 3. Add a trusted publisher on npm for each package

For each of `@zevauth/js`, `@zevauth/backend`, `@zevauth/react`,
`@zevauth/nextjs`, `@zevauth/ui`, `@zevauth/vue` and `@zevauth/expo`, open
the package on npmjs.com → **Settings → Trusted publishing → GitHub
Actions** and enter:

| Field | Value |
| --- | --- |
| Organization or user | `zevop` |
| Repository | `zevauth-sdk` |
| Workflow filename | `release.yml` |
| Environment name | `npm` |

After the first release from the workflow succeeds, you can set each
package's **Publishing access** to "Require two-factor authentication and
disallow tokens". The workflow keeps working, and nobody can publish from
a laptop with a stolen token.

### 4. Optional: the docs pull request

Create a fine-grained personal access token (or a GitHub App token) with
access to `zevop/zevauth-docs` only, and these permissions: **Contents**
read and write, **Pull requests** read and write. Save it in this
repository as the secret `DOCS_REPO_TOKEN`
(Settings → Secrets and variables → Actions).

Without it, the release still succeeds; the docs repository's Dependabot
opens the same update within a day.

### 5. If `main` is protected

The workflow pushes the release commit and tags with the built-in
`GITHUB_TOKEN`. If branch protection blocks that, allow GitHub Actions to
bypass it (Settings → Rules), or the commit step fails after publishing.
The packages are on npm by then; push the version change by hand.

## Releasing from your machine

`npm run release` still works when CI is unavailable. It uses the same
planner (`scripts/release-ci.mjs`), so the result is identical, but npm
asks for your 2FA on every package and there is no provenance:

```sh
npm run release -- --dry-run
npm run release
npm run release minor
npm run release -- js react
```

It prints the commit and tag commands to run afterwards.
