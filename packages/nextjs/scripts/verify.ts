/**
 * The middleware's routing decisions, without a server.
 *
 * Token verification is covered by `verify-sdk-contract.ts` in
 * `zevauth-backend`, against real tokens and a real JWKS — nothing
 * meaningful about signatures can be proven here. What CAN be proven
 * here is the routing: which paths are protected, where a signed-out
 * visitor is sent, and that the sign-in page itself never redirects to
 * itself.
 */
import { createZevAuthMiddleware } from '../src/server/middleware.js';

let passed = 0;
let failed = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.error(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/*
 * No token means signed out, which is the whole point of these cases,
 * and it needs no network. The signed-in path is exercised by overriding
 * `onRequest`, which receives the resolved auth.
 */
const config = { environmentId: 'env_test_x', apiUrl: 'http://127.0.0.1:1' };

function request(path: string) {
  return new Request(`https://app.example.com${path}`);
}

async function main() {
  console.log('\n\x1b[1mProtected and public routes\x1b[0m');

  const middleware = createZevAuthMiddleware({
    ...config,
    protected: ['/dashboard', '/settings'],
  });

  const publicPage = await middleware(request('/'));
  check('a public path is left alone', publicPage === undefined);

  const marketing = await middleware(request('/pricing'));
  check('and anything unlisted is public', marketing === undefined);

  const guarded = await middleware(request('/dashboard'));
  check('a protected path redirects when signed out', guarded?.status === 307);

  const nested = await middleware(request('/dashboard/billing/invoices'));
  check(
    'protection covers everything beneath the path',
    nested?.status === 307,
    String(nested?.status),
  );

  const lookalike = await middleware(request('/dashboardish'));
  check(
    'but not a path that merely starts with the same letters',
    lookalike === undefined,
  );

  console.log('\n\x1b[1mThe redirect loop this avoids\x1b[0m');

  /*
   * The failure mode behind "protect everything by default": the sign-in
   * page is itself a page, so a default-protected app redirects the
   * sign-in page to the sign-in page, forever.
   */
  const signInPage = await middleware(request('/sign-in'));
  check('the sign-in page is not itself protected', signInPage === undefined);

  const withExplicitPublic = createZevAuthMiddleware({
    ...config,
    protected: [/^\/app/],
    public: ['/app/health'],
  });
  check(
    'an explicit public path wins over a protected pattern',
    (await withExplicitPublic(request('/app/health'))) === undefined,
  );
  check(
    'while its siblings stay protected',
    (await withExplicitPublic(request('/app/home')))?.status === 307,
  );

  console.log('\n\x1b[1mWhere it sends people\x1b[0m');

  const redirected = await middleware(request('/dashboard/team'));
  const location = new URL(redirected!.headers.get('location')!);

  check('to the sign-in page', location.pathname === '/sign-in');
  check(
    'carrying where they were going',
    location.searchParams.get('redirect_url') === '/dashboard/team',
  );
  check(
    'on the same origin, never an absolute URL from the request',
    location.origin === 'https://app.example.com',
  );

  const custom = createZevAuthMiddleware({
    ...config,
    protected: ['/x'],
    signInUrl: '/login',
  });
  const customTarget = new URL(
    (await custom(request('/x')))!.headers.get('location')!,
  );
  check('a custom sign-in path is honoured', customTarget.pathname === '/login');

  console.log('\n\x1b[1monRequest can take over\x1b[0m');

  const intercepting = createZevAuthMiddleware({
    ...config,
    protected: ['/dashboard'],
    onRequest: (auth) =>
      auth.isSignedIn ? undefined : new Response(null, { status: 418 }),
  });
  const taken = await intercepting(request('/dashboard'));
  check('a returned Response wins', taken?.status === 418);

  const seen: Array<boolean> = [];
  const observing = createZevAuthMiddleware({
    ...config,
    protected: ['/dashboard'],
    onRequest: (auth) => {
      seen.push(auth.isSignedIn);
      return undefined;
    },
  });
  await observing(request('/'));
  check('and it runs for public paths too', seen.length === 1);
  check('reporting the resolved auth', seen[0] === false);

  console.log(
    `\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
