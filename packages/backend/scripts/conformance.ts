/**
 * The shared server-SDK fixtures (spec/fixtures), run against this SDK.
 *
 * Every ZevAuth server SDK runs the same files and must get the same
 * answers. This is the Node one; a failure here means Node disagrees
 * with the contract in spec/SERVER_SDK.md, not that a fixture is wrong.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getAuth,
  requireAuth,
  verifyZevAuthToken,
  bearerFrom,
  ZevAuthVerifyError,
  type VerifyOptions,
} from '../src/verify';
import { verifyWebhook, ZevAuthWebhookError } from '../src/webhooks';
import { authenticateRequest, bridgeCookieNames, handleSessionBridge, handshakePage, getAuth as getBridgedAuth } from '../src/bridge';
import { ZevAuthBackend, ZevAuthError } from '../src/index';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'spec', 'fixtures');
const load = (name: string) => JSON.parse(readFileSync(join(fixtures, name), 'utf8'));

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

const tokens = load('tokens.json');
const jwksFiles: Record<string, unknown> = {
  'jwks.json': load('jwks.json'),
  'jwks-rotated.json': load('jwks-rotated.json'),
};
const now = new Date(tokens.now * 1000);

/**
 * A fake API for the discovery document and key sets: the first key-set
 * fetch answers `first`, every later one `later`.
 */
function keyServer(first: string, later: string) {
  let jwksFetches = 0;
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith('/.well-known/openid-configuration')) {
      return new Response(JSON.stringify(load('discovery.json')), { status: 200 });
    }
    if (url.endsWith('/.well-known/jwks.json')) {
      jwksFetches++;
      return new Response(JSON.stringify(jwksFiles[jwksFetches === 1 ? first : later]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, count: () => jwksFetches };
}

let apiUrlCounter = 0;
function optionsFor(testCase: { jwks: string; jwksAfterRefetch?: string }, cooldownSeconds = 0): VerifyOptions {
  const server = keyServer(testCase.jwks, testCase.jwksAfterRefetch ?? testCase.jwks);
  return {
    environmentId: tokens.environmentId,
    // A distinct apiUrl per case, so one case's cached key set never
    // answers for the next.
    apiUrl: `https://api.zevauth.test/run${++apiUrlCounter}`,
    issuer: tokens.issuer,
    currentDate: now,
    fetch: server.fetchImpl,
    jwksCooldownSeconds: cooldownSeconds,
  };
}

async function main() {
  console.log('\n\x1b[1mTokens (spec/fixtures/tokens.json)\x1b[0m');
  for (const c of tokens.cases) {
    const options = optionsFor(c);
    let outcome: { ok: true } | { ok: false; error: string };
    try {
      await verifyZevAuthToken(c.token, options);
      outcome = { ok: true };
    } catch (error) {
      outcome = { ok: false, error: error instanceof ZevAuthVerifyError ? error.code : `untyped: ${String(error)}` };
    }
    const expected = c.expect.ok ? 'ok' : c.expect.error;
    const got = outcome.ok ? 'ok' : outcome.error;
    check(`${c.name}: ${expected}`, got === expected, `got ${got}`);

    const request = new Request('https://app.example.com/', { headers: { authorization: `Bearer ${c.token}` } });

    if (c.auth) {
      const auth = await getAuth(request, optionsFor(c));
      const mismatched = Object.entries(c.auth).filter(
        ([key, value]) => JSON.stringify((auth as unknown as Record<string, unknown>)[key]) !== JSON.stringify(value),
      );
      check(`${c.name}: getAuth fields`, mismatched.length === 0, JSON.stringify(mismatched));
    }

    for (const h of c.has ?? []) {
      const auth = await getAuth(request, optionsFor(c));
      check(`${c.name}: has(${JSON.stringify(h.check)}) = ${h.result}`, auth.has(h.check) === h.result);
    }

    for (const r of c.requireAuth ?? []) {
      let result: { ok: boolean; status?: number; code?: string };
      try {
        await requireAuth(request, optionsFor(c), r.options);
        result = { ok: true };
      } catch (thrown) {
        const response = thrown as Response;
        const body = (await response.json()) as { error: { code: string } };
        result = { ok: false, status: response.status, code: body.error.code };
      }
      check(
        `${c.name}: requireAuth(${JSON.stringify(r.options)})`,
        JSON.stringify(result) === JSON.stringify(r.result),
        `got ${JSON.stringify(result)}`,
      );
    }
  }

  console.log('\n\x1b[1mKey-set refetch is rate limited\x1b[0m');
  {
    const unknown = tokens.cases.find((c: { name: string }) => c.name === 'unknown_kid');
    const server = keyServer('jwks.json', 'jwks.json');
    const options: VerifyOptions = {
      environmentId: tokens.environmentId,
      apiUrl: 'https://api.zevauth.test/cooldown',
      issuer: tokens.issuer,
      currentDate: now,
      fetch: server.fetchImpl,
      jwksCooldownSeconds: 30,
    };
    for (let i = 0; i < 5; i++) await verifyZevAuthToken(unknown.token, options).catch(() => {});
    check('five unknown-kid tokens inside the cooldown fetch the key set once', server.count() === 1, `${server.count()} fetches`);
  }

  console.log('\n\x1b[1mBearer extraction (spec/fixtures/bearer.json)\x1b[0m');
  for (const c of load('bearer.json').cases) {
    check(`${JSON.stringify(c.header)?.slice(0, 40)} → ${c.token ? 'token' : 'null'}`, bearerFrom(c.header) === c.token);
  }

  console.log('\n\x1b[1mWebhooks (spec/fixtures/webhooks.json)\x1b[0m');
  const webhooks = load('webhooks.json');
  for (const c of webhooks.cases) {
    let got: string;
    try {
      await verifyWebhook({ payload: c.payload, signature: c.signature, secret: webhooks.secret, toleranceSeconds: webhooks.toleranceSeconds, now: webhooks.now });
      got = 'valid';
    } catch (error) {
      got = error instanceof ZevAuthWebhookError ? error.code : `untyped: ${String(error)}`;
    }
    check(`${c.name}: ${c.valid ? 'valid' : c.error}`, got === (c.valid ? 'valid' : c.error), `got ${got}`);
  }

  console.log('\n\x1b[1mAPI errors (spec/fixtures/api-errors.json)\x1b[0m');
  for (const c of load('api-errors.json').cases) {
    let calls = 0;
    const client = new ZevAuthBackend({
      secretKey: 'sk_test_fixture',
      apiUrl: 'https://api.zevauth.test',
      maxRetries: 1,
      fetch: (async () => {
        calls++;
        const body = c.bodyText ?? (c.body === null ? '' : JSON.stringify(c.body));
        // Retry-After of 0 here, so the suite does not sleep; the value
        // the server sent is still what the client must read.
        const headers = { ...c.headers, ...(c.headers['retry-after'] ? { 'retry-after': '0' } : {}) };
        return new Response(body, { status: c.status, headers });
      }) as typeof fetch,
    });
    try {
      await client.users.get('user_fixture_1');
      check(`${c.name}: throws`, false);
    } catch (error) {
      const e = error as ZevAuthError;
      check(
        `${c.name}: code ${c.expect.code}, status ${c.expect.status}`,
        e.code === c.expect.code && e.status === c.expect.status,
        `got ${e.code} ${e.status}`,
      );
      check(`${c.name}: ${c.expect.retry ? 'retried' : 'not retried'}`, calls === (c.expect.retry ? 2 : 1), `${calls} calls`);
      if (c.expect.requestId) check(`${c.name}: request id surfaced`, e.requestId === c.expect.requestId);
    }
  }

  console.log('\n\x1b[1mPagination\x1b[0m');
  {
    const seen: string[] = [];
    const client = new ZevAuthBackend({
      secretKey: 'sk_test_fixture',
      apiUrl: 'https://api.zevauth.test',
      fetch: (async (url: string) => {
        seen.push(new URL(url).search);
        const second = new URL(url).searchParams.get('after') === 'cur_2';
        return new Response(
          JSON.stringify(second
            ? { data: [{ id: 'user_3' }], hasMore: false, next: null, totalCount: 3 }
            : { data: [{ id: 'user_1' }, { id: 'user_2' }], hasMore: true, next: 'cur_2', totalCount: 3 }),
          { status: 200 },
        );
      }) as typeof fetch,
    });
    const ids: string[] = [];
    for await (const user of client.users.iterate({ limit: 2 })) ids.push(user.id);
    check('the iterator follows next until hasMore is false', ids.join(',') === 'user_1,user_2,user_3', ids.join(','));
    check('passing the cursor as after', seen[1]?.includes('after=cur_2') ?? false, seen.join(' | '));
  }

  console.log('\n\x1b[1mSession bridge (spec/fixtures/bridge.json)\x1b[0m');
  const bridge = load('bridge.json');
  const bridgeConfig = {
    ...optionsFor({ jwks: 'jwks.json' }),
    allowedOrigins: [bridge.appOrigin],
  };
  const names = bridgeCookieNames({});
  for (const c of bridge.cases) {
    const headers: Record<string, string> = { origin: c.request.origin, 'content-type': 'application/json' };
    if (c.request.bridgeHeader) headers[bridge.header.name] = bridge.header.value;
    const response = await handleSessionBridge(
      new Request(`${bridge.appOrigin}/zevauth/session`, {
        method: c.request.method,
        headers,
        body: c.request.body === undefined ? undefined : JSON.stringify(c.request.body),
      }),
      bridgeConfig,
    );
    const cookies = response.headers.getSetCookie();
    const session = cookies.find((v) => v.startsWith(`${names.session}=`));
    const state = !session ? 'unchanged' : /Max-Age=0(;|$)/.test(session) ? 'cleared' : 'set';
    let code: string | undefined;
    if (response.status >= 400) code = ((await response.json()) as { error: { code: string } }).error.code;

    check(`${c.name}: status ${c.expect.status}`, response.status === c.expect.status, `got ${response.status}`);
    check(`${c.name}: cookie ${c.expect.cookie}`, state === c.expect.cookie, `got ${state}`);
    if (c.expect.code) check(`${c.name}: code ${c.expect.code}`, code === c.expect.code, `got ${code}`);
    if (c.expect.maxAgeSeconds) check(`${c.name}: Max-Age ${c.expect.maxAgeSeconds}`, session?.includes(`Max-Age=${c.expect.maxAgeSeconds}`) ?? false, session);
    if (state === 'set') {
      check(`${c.name}: HttpOnly, Secure, SameSite=Lax, host-only`, /HttpOnly/.test(session!) && /Secure/.test(session!) && /SameSite=Lax/.test(session!) && !/Domain=/.test(session!) && names.session.startsWith('__Host-'));
    }
  }

  console.log('\n\x1b[1mBridge: reading the cookie and the handshake\x1b[0m');
  {
    const valid = tokens.cases.find((c: { name: string }) => c.name === 'valid').token;
    const expired = tokens.cases.find((c: { name: string }) => c.name === 'expired').token;
    const page = (cookie: string, path = '/dashboard', accept = 'text/html') =>
      new Request(`${bridge.appOrigin}${path}`, { headers: { cookie, accept } });

    const fromCookie = await getBridgedAuth(page(`${names.session}=${valid}; ${names.client}=1`), bridgeConfig);
    check('a valid cookie signs the page in', fromCookie.isSignedIn && fromCookie.userId === 'user_fixture_1');

    const stale = await authenticateRequest(page(`${names.session}=${expired}; ${names.client}=1`), bridgeConfig);
    check('an expired cookie on a page asks for a handshake', stale.handshake?.status === 302);
    check('to the handshake page, carrying where to come back to', stale.handshake?.headers.get('location') === '/zevauth/handshake?redirect_url=%2Fdashboard');

    const gone = await authenticateRequest(page(`${names.client}=1`), bridgeConfig);
    check('a deleted session cookie with the client marker also hands-shakes', gone.handshake?.status === 302);

    const never = await authenticateRequest(page(''), bridgeConfig);
    check('nobody ever signed in: no handshake, just signed out', never.handshake === null && !never.auth.isSignedIn);

    const back = await authenticateRequest(page(`${names.client}=1`, '/dashboard?__zevauth_handshake=1'), bridgeConfig);
    check('back from a handshake and still no session: signed out, no loop', back.handshake === null && !back.auth.isSignedIn);

    const api = await authenticateRequest(page(`${names.session}=${expired}; ${names.client}=1`, '/api/x', 'application/json'), bridgeConfig);
    check('an API request gets 401 session_refresh_required, not a redirect', api.handshake?.status === 401);

    const header = await getBridgedAuth(
      new Request(`${bridge.appOrigin}/api/x`, { headers: { authorization: `Bearer ${valid}`, cookie: `${names.session}=${expired}` } }),
      bridgeConfig,
    );
    check('the Authorization header wins over the cookie', header.isSignedIn);

    const html = await handshakePage(new Request(`${bridge.appOrigin}/zevauth/handshake?redirect_url=%2F%2Fevil.example`), { publishableKey: 'pk_test_x', bridgePath: '/zevauth/session' }).text();
    check('the handshake page refuses an off-site return address', html.includes('"back":"/?__zevauth_handshake=1"'));
    const ok = await handshakePage(new Request(`${bridge.appOrigin}/zevauth/handshake?redirect_url=%2Fdashboard%3Ftab%3D2`), { publishableKey: 'pk_test_x', bridgePath: '/zevauth/session' }).text();
    check('and returns to a same-site path with the marker', ok.includes('"back":"/dashboard?tab=2&__zevauth_handshake=1"'));
  }

  console.log(`\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
