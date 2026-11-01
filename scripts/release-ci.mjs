#!/usr/bin/env node
/**
 * Release planning and publishing for the @zevauth/* workspaces.
 *
 * Shared by the GitHub Actions release workflow (the primary path, where
 * npm Trusted Publishing signs in with the workflow's OIDC identity) and
 * scripts/release.sh (the local fallback, where npm asks for your 2FA).
 *
 *   node scripts/release-ci.mjs plan --bump patch|minor [--packages js,react] [--dry-run]
 *   node scripts/release-ci.mjs publish [--provenance] [--dry-run]
 *   node scripts/release-ci.mjs summary
 *
 * ── plan ───────────────────────────────────────────────────────────
 * Works out what to release, bumps versions and writes the plan to
 * .release-plan.json. A package is released when it changed since the
 * commit that set its current version (or is named with --packages).
 *
 * Then dependents. On a 0.x line a minor bump moves out of every `^0.y`
 * range that points at the old line, so `@zevauth/nextjs` would keep
 * resolving the old `@zevauth/react` and its users would never get the
 * release. Any workspace whose `@zevauth/*` range no longer accepts the
 * new version has the range raised to `^new` and is itself patch-bumped
 * and released, repeating until nothing moves. A range that still
 * accepts the new version is left alone: rewriting it would force a
 * republish of every package on every patch for no gain.
 *
 * ── publish ────────────────────────────────────────────────────────
 * Publishes the planned packages in dependency order, so nothing is
 * ever on npm before the version it requires. A version already on npm
 * is skipped, which makes a re-run after a partial failure safe.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PLAN_FILE = join(ROOT, '.release-plan.json');
const DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];

const [command, ...rest] = process.argv.slice(2);
const flags = parseFlags(rest);

function parseFlags(args) {
  const out = { bump: 'patch', packages: [], dryRun: false, provenance: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--bump') out.bump = args[++i];
    else if (a === '--packages') out.packages = (args[++i] ?? '').split(/[,\s]+/).filter(Boolean);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--provenance') out.provenance = true;
    else throw new Error(`Unknown argument ${a}`);
  }
  if (!['patch', 'minor', 'major'].includes(out.bump)) throw new Error(`--bump must be patch, minor or major, not ${out.bump}`);
  out.packages = out.packages.map((p) => (p.startsWith('@zevauth/') ? p : `@zevauth/${p}`));
  return out;
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

function loadWorkspaces() {
  const dirs = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'packages', d.name, 'package.json')))
    .map((d) => d.name);
  const byName = new Map();
  for (const dir of dirs) {
    const file = join(ROOT, 'packages', dir, 'package.json');
    const json = JSON.parse(readFileSync(file, 'utf8'));
    if (json.private) continue;
    byName.set(json.name, { name: json.name, dir: `packages/${dir}`, file, json });
  }
  return byName;
}

function internalDeps(ws, all) {
  const deps = new Set();
  for (const field of DEP_FIELDS) {
    for (const name of Object.keys(ws.json[field] ?? {})) if (all.has(name)) deps.add(name);
  }
  return deps;
}

function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) throw new Error(`Cannot read version ${v}`);
  return m.slice(1, 4).map(Number);
}

function bumpVersion(v, kind) {
  const [maj, min, pat] = parse(v);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

/**
 * Whether `range` accepts `version`, for the shapes these packages use:
 * `^x.y.z`, `>=x.y.z` and exact versions. Anything else is treated as
 * not accepting, so it gets raised rather than silently left behind.
 */
function accepts(range, version) {
  const v = parse(version);
  const r = range.trim();
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  if (r.startsWith('>=')) return cmp(v, parse(r.slice(2))) >= 0;
  if (r.startsWith('^')) {
    const base = parse(r.slice(1));
    if (cmp(v, base) < 0) return false;
    if (base[0] > 0) return v[0] === base[0];
    if (base[1] > 0) return v[0] === 0 && v[1] === base[1];
    return v[0] === 0 && v[1] === 0 && v[2] === base[2];
  }
  if (/^\d/.test(r)) return cmp(v, parse(r)) === 0;
  return false;
}

/**
 * Changed since this version was released.
 *
 * The release tag (`@zevauth/react@0.2.7`) marks exactly what went to
 * npm, so it is the baseline when it exists. Without one, fall back to
 * the commit that introduced the current version line, which over-reports
 * when a package.json was edited after its version was set but before it
 * was published; tagging the current versions once removes the guesswork.
 */
function changedSinceVersion(ws) {
  const tag = `${ws.name}@${ws.json.version}`;
  let since = '';
  try {
    since = sh('git', ['rev-list', '-n', '1', `refs/tags/${tag}`]);
  } catch {
    since = sh('git', ['log', '-1', '--format=%H', `-S"version": "${ws.json.version}"`, '--', `${ws.dir}/package.json`]);
  }
  if (!since) return true; // never released from this history
  const committed = sh('git', ['diff', '--name-only', `${since}..HEAD`, '--', ws.dir]);
  const uncommitted = sh('git', ['status', '--porcelain', '--', ws.dir]);
  return Boolean(committed || uncommitted);
}

function topoOrder(names, all) {
  const out = [];
  const seen = new Set();
  const visit = (n, stack = new Set()) => {
    if (seen.has(n)) return;
    if (stack.has(n)) throw new Error(`Dependency cycle through ${n}`);
    stack.add(n);
    for (const d of internalDeps(all.get(n), all)) if (names.has(d)) visit(d, stack);
    stack.delete(n);
    seen.add(n);
    out.push(n);
  };
  [...names].sort().forEach((n) => visit(n));
  return out;
}

function plan() {
  const all = loadWorkspaces();
  const unknown = flags.packages.filter((p) => !all.has(p));
  if (unknown.length) throw new Error(`Not a workspace: ${unknown.join(', ')}`);

  const chosen = flags.packages.length
    ? new Set(flags.packages)
    : new Set([...all.values()].filter(changedSinceVersion).map((w) => w.name));

  if (chosen.size === 0) {
    console.log('Nothing changed in any package since its version was last set.');
    writeFileSync(PLAN_FILE, JSON.stringify({ releases: [] }, null, 2) + '\n');
    return;
  }

  const next = new Map(); // name -> new version
  const reasons = new Map();
  for (const n of chosen) {
    next.set(n, bumpVersion(all.get(n).json.version, flags.bump));
    reasons.set(n, flags.packages.length ? 'named' : 'changed');
  }

  // Raise ranges that no longer accept a new version; cascade until stable.
  let moved = true;
  while (moved) {
    moved = false;
    for (const ws of all.values()) {
      for (const field of DEP_FIELDS) {
        for (const [dep, range] of Object.entries(ws.json[field] ?? {})) {
          const target = next.get(dep);
          if (!target || accepts(range, target)) continue;
          ws.json[field][dep] = `^${target}`;
          if (!next.has(ws.name)) {
            next.set(ws.name, bumpVersion(ws.json.version, 'patch'));
            reasons.set(ws.name, `depends on ${dep}@${target}`);
          }
          moved = true;
        }
      }
    }
  }

  const order = topoOrder(new Set(next.keys()), all);
  const releases = order.map((name) => {
    const ws = all.get(name);
    const from = ws.json.version;
    ws.json.version = next.get(name);
    return { name, dir: ws.dir, from, to: ws.json.version, reason: reasons.get(name) };
  });

  if (!flags.dryRun) {
    for (const ws of all.values()) writeFileSync(ws.file, JSON.stringify(ws.json, null, 2) + '\n');
  }
  writeFileSync(PLAN_FILE, JSON.stringify({ bump: flags.bump, dryRun: flags.dryRun, releases }, null, 2) + '\n');

  console.log(`Release plan (${flags.bump}${flags.dryRun ? ', dry run: package.json files untouched' : ''}):`);
  for (const r of releases) console.log(`  ${r.name.padEnd(20)} ${r.from} -> ${r.to}   (${r.reason})`);
}

function readPlan() {
  if (!existsSync(PLAN_FILE)) throw new Error('No .release-plan.json. Run `plan` first.');
  return JSON.parse(readFileSync(PLAN_FILE, 'utf8'));
}

function publish() {
  const { releases } = readPlan();
  for (const r of releases) {
    let onNpm = '';
    try {
      onNpm = sh('npm', ['view', `${r.name}@${r.to}`, 'version']);
    } catch {
      onNpm = '';
    }
    if (onNpm === r.to) {
      console.log(`skip ${r.name}@${r.to}: already on npm`);
      continue;
    }
    const args = ['publish', '-w', r.name, '--access', 'public'];
    if (flags.provenance) args.push('--provenance');
    if (flags.dryRun) args.push('--dry-run');
    console.log(`${flags.dryRun ? 'dry run: ' : ''}publishing ${r.name}@${r.to}`);
    execFileSync('npm', args, { cwd: ROOT, stdio: 'inherit' });
  }
}

/** One line per release, for commit messages, tags and job summaries. */
function summary() {
  const { releases } = readPlan();
  const line = releases.map((r) => `${r.name}@${r.to}`).join(' ');
  console.log(line);
}

const commands = { plan, publish, summary };
if (!commands[command]) {
  console.error('Usage: release-ci.mjs plan|publish|summary [--bump patch|minor] [--packages a,b] [--dry-run] [--provenance]');
  process.exit(2);
}
try {
  commands[command]();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
