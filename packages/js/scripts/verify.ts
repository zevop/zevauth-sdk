/**
 * The SDK's behaviour, against a fake API.
 *
 * ── Why a fake API and not a real one ─────────────────────────────
 * What is worth proving here is how the CLIENT behaves: that it never
 * races itself on refresh, that it clears a dead session instead of
 * retrying, that a handoff code leaves the URL. Those are properties of
 * the client's own logic, and a live server would make them slow,
 * flaky, and dependent on data somebody has to set up.
 *
 * The server's half is covered by `verify-hosted.ts` and
 * `verify-slice.ts` in `zevauth-backend`.
 */
import { ZevAuth } from '../src/client';
import { ZevAuthError } from '../src/types';
import type { SessionStorageAdapter } from '../src/internal/tokens';

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

function memoryStorage(): SessionStorageAdapter {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => map.set(k, v),
    remove: (k) => map.delete(k),
  };
}

const USER = {
  id: 'user_1',
  email: 'a@example.com',
  emailVerified: true,
  username: null,
  phone: null,
  phoneVerified: false,
  firstName: 'A',
  lastName: null,
  imageUrl: null,
  publicMetadata: {},
  status: 'active',
  lastSignInAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

interface Call {
  path: string;
  body: any;
  auth: string | null;
}

/** A fake API that records what it was asked, and can be told to fail. */
function fakeApi(options: {
  onRefresh?: (n: number, body: any) => 'ok' | 'reuse';
  refreshDelayMs?: number;
} = {}) {
  const calls: Call[] = [];
  let refreshCount = 0;
  let issued = 0;

  const doFetch = (async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const auth = (init.headers as Record<string, string>)?.Authorization ?? null;
    calls.push({ path, body, auth });

    const json = (status: number, payload: unknown) =>
      new Response(JSON.stringify(payload), { status });

    if (path === '/v1/environment') {
      return json(200, {
        id: 'env_test_x',
        kind: 'test',
        isTestMode: true,
        signInMethods: ['password', 'magic_link'],
      });
    }

    if (path === '/v1/auth/refresh') {
      refreshCount++;
      const verdict = options.onRefresh?.(refreshCount, body) ?? 'ok';

      if (options.refreshDelayMs) {
        await new Promise((r) => setTimeout(r, options.refreshDelayMs));
      }

      if (verdict === 'reuse') {
        return json(401, {
          error: {
            code: 'token_reuse_detected',
            message: 'That session has ended. Sign in again.',
          },
        });
      }

      issued++;
      return json(200, {
        user: USER,
        session: {
          accessToken: `at_${issued}`,
          refreshToken: `rt_${issued}`,
          expiresIn: 900,
        },
      });
    }

    if (
      path === '/v1/auth/signin' ||
      path === '/v1/auth/handoff/exchange' ||
      path === '/v1/auth/switch-organization'
    ) {
      issued++;
      return json(200, {
        user: USER,
        session: {
          accessToken: `at_${issued}`,
          refreshToken: `rt_${issued}`,
          expiresIn: 900,
          organization:
            path === '/v1/auth/switch-organization' && body?.organizationId
              ? { id: body.organizationId, name: 'Acme', slug: 'acme', role: 'admin' }
              : null,
        },
      });
    }

    if (path === '/v1/auth/magic-link' || path === '/v1/auth/password-reset') {
      // Deliberately identical whether or not the address is known.
      return json(200, {
        sent: true,
        message: 'If that address has an account, we have sent it a message.',
      });
    }

    if (path === '/v1/auth/signout') return json(200, {});

    return json(404, {
      error: { code: 'not_found', message: 'No such endpoint.' },
    });
  }) as unknown as typeof globalThis.fetch;

  return {
    fetch: doFetch,
    calls,
    get refreshCount() {
      return refreshCount;
    },
  };
}

function makeClient(api: ReturnType<typeof fakeApi>, storage = memoryStorage()) {
  return {
    client: new ZevAuth({
      publishableKey: 'pk_test_abc',
      apiUrl: 'https://api.test',
      fetch: api.fetch,
      storage,
    }),
    storage,
  };
}

async function main() {
  console.log('\n\x1b[1mConstruction\x1b[0m');

  let secretKeyRejected = false;
  try {
    new ZevAuth({ publishableKey: 'sk_live_dangerous' });
  } catch (err) {
    secretKeyRejected = err instanceof ZevAuthError;
  }
  check(
    'a secret key is refused before it can ship in a bundle',
    secretKeyRejected,
  );

  console.log('\n\x1b[1mSign in and session\x1b[0m');

  {
    const api = fakeApi();
    const { client } = makeClient(api);
    await client.load();

    check('it loads the environment', client.isTestMode === true);
    check('and reports the enabled methods', client.signInMethods.length === 2);
    check('nobody is signed in yet', client.user === null);

    await client.signIn.withPassword({
      identifier: 'a@example.com',
      password: 'hunter2hunter2',
    });
    check('a password sign-in starts a session', client.user?.id === 'user_1');

    const signInCall = api.calls.find((c) => c.path === '/v1/auth/signin');
    check(
      'the publishable key authenticates the request',
      signInCall?.auth === 'Bearer pk_test_abc',
    );

    const token = await client.getToken();
    check('a fresh token is handed out without refreshing', token === 'at_1');
    check('and no refresh was needed', api.refreshCount === 0);

    await client.setActiveOrganization('org_1');
    check(
      'switching organization updates the active one',
      client.organization?.id === 'org_1',
    );
    check(
      'and rotates the tokens, because the org is a claim inside them',
      (await client.getToken()) === 'at_2',
    );

    await client.signOut();
    check('signing out clears the user', client.user === null);
    check('and the token is gone', (await client.getToken()) === null);
  }

  console.log('\n\x1b[1mListeners\x1b[0m');

  {
    const api = fakeApi();
    const { client } = makeClient(api);
    const seen: Array<string | null> = [];
    client.addListener((state) => seen.push(state.user?.id ?? null));

    check('a subscriber is told the current state immediately', seen.length === 1);

    await client.load();
    await client.signIn.withPassword({
      identifier: 'a@example.com',
      password: 'x',
    });
    check('and again when somebody signs in', seen.at(-1) === 'user_1');

    await client.signOut();
    check('and when they sign out', seen.at(-1) === null);
  }

  console.log('\n\x1b[1mRefresh: the client must never race itself\x1b[0m');

  {
    /*
     * The scenario this whole coordinator exists for. The server has no
     * grace window: a refresh token presented twice is treated as reuse
     * and the SESSION IS BURNED. So ten simultaneous callers must
     * produce exactly one refresh.
     */
    const api = fakeApi({
      refreshDelayMs: 20,
      onRefresh: (n, body) => {
        // The real server's rule, enforced here: anything but the newest
        // token is reuse.
        void n;
        return body?.refreshToken === 'rt_1' || body?.refreshToken === 'rt_2'
          ? 'ok'
          : 'reuse';
      },
    });
    const { client, storage } = makeClient(api);
    await client.load();
    await client.signIn.withPassword({ identifier: 'a@example.com', password: 'x' });

    // Age the token so every caller believes a refresh is due.
    const key = 'zevauth.session.test';
    const stored = JSON.parse(storage.get(key)!);
    storage.set(key, JSON.stringify({ ...stored, expiresAt: Date.now() - 1000 }));

    const tokens = await Promise.all(
      Array.from({ length: 10 }, () => client.getToken()),
    );

    check(
      'ten concurrent callers cause exactly ONE refresh',
      api.refreshCount === 1,
      `${api.refreshCount} refreshes`,
    );
    check(
      'and they all receive the same token',
      new Set(tokens).size === 1,
      [...new Set(tokens)].join(','),
    );
    check('which is the new one', tokens[0] === 'at_2');
  }

  console.log('\n\x1b[1mA dead session is cleared, not retried\x1b[0m');

  {
    const api = fakeApi({ onRefresh: () => 'reuse' });
    const storage = memoryStorage();
    storage.set(
      'zevauth.session.test',
      JSON.stringify({ refreshToken: 'rt_stolen', expiresAt: Date.now() - 1 }),
    );

    const { client } = makeClient(api, storage);
    await client.load();

    check('the burned session leaves nobody signed in', client.user === null);
    check(
      'the dead token is removed from storage',
      storage.get('zevauth.session.test') === null,
    );
    check(
      'and it is not retried, which would keep tripping the alarm',
      api.refreshCount === 1,
      `${api.refreshCount} attempts`,
    );
  }

  console.log('\n\x1b[1mPasswordless does not leak who has an account\x1b[0m');

  {
    const api = fakeApi();
    const { client } = makeClient(api);
    await client.load();

    const known = await client.signIn
      .startMagicLink({ email: 'a@example.com' })
      .then(() => 'ok')
      .catch((e) => (e as Error).message);
    const unknown = await client.signIn
      .startMagicLink({ email: 'nobody@example.com' })
      .then(() => 'ok')
      .catch((e) => (e as Error).message);

    check('a known and an unknown address answer identically', known === unknown);
    check('and neither starts a session', client.user === null);
  }

  console.log('\n\x1b[1mHosted handoff\x1b[0m');

  {
    const api = fakeApi();
    // A minimal stand-in for the browser's URL and history.
    let href = 'https://app.example.com/callback?code=hoc_abc&keep=1';
    (globalThis as any).location = { get href() { return href; }, assign() {} };
    (globalThis as any).history = {
      replaceState: (_s: unknown, _t: string, url: string) => {
        href = url;
      },
    };

    const { client } = makeClient(api);
    await client.load();

    check('the code is exchanged for a session', client.user?.id === 'user_1');
    check(
      'the exchange happened on this origin with this app key',
      api.calls.find((c) => c.path === '/v1/auth/handoff/exchange')?.auth ===
        'Bearer pk_test_abc',
    );
    check('the spent code is stripped from the URL', !href.includes('code='));
    check(
      'and the rest of the query is left alone',
      href.includes('keep=1'),
      href,
    );

    delete (globalThis as any).location;
    delete (globalThis as any).history;
  }

  console.log(
    `\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
