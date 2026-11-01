/**
 * Bundles the package, React included.
 *
 * ── Why React is inside, not a peer ───────────────────────────────
 * This package exists for pages that are NOT React: a Vue app, a
 * Rails view, a script tag. Asking them to install and wire up React to
 * show a sign-in box would defeat the point, and a peer they do not use
 * is a version conflict waiting for whoever does. So it ships its own,
 * private copy. A React app should use `@zevauth/react` instead and
 * share the React it already has.
 *
 * Two outputs: an ES module for bundlers, and a script-tag build that
 * defines `window.ZevAuthUI`.
 */
import { build } from 'esbuild';
import { statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const shared = {
  entryPoints: ['src/index.tsx'],
  bundle: true,
  minify: true,
  sourcemap: true,
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  // React's development build is several times larger and warns in the
  // console; nobody debugging their own app wants ours.
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'linked',
};

await build({ ...shared, format: 'esm', outfile: 'dist/index.js' });
await build({ ...shared, format: 'iife', globalName: 'ZevAuthUI', outfile: 'dist/zevauth-ui.global.js' });

for (const file of ['dist/index.js', 'dist/zevauth-ui.global.js']) {
  const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
  console.log(`${file}  ${kb(statSync(file).size)}  (${kb(gzipSync(readFileSync(file)).length)} gzip)`);
}
