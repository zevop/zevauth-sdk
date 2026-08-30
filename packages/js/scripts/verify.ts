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
  /**
   * Respond to refresh the way the real backend did for months: the
   * session alone, no user. The suite's fake always included the user,
   * which is exactly why the forgotten-user bug lived in production
   * while every test here passed.
   */
  refreshOmitsUser?: boolean;
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
        ...(options.refreshOmitsUser ? {} : { user: USER }),
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

    if (path === '/v1/me') {
      // Only ever with a session token. A publishable key here is the
      // mistake the guard exists to catch, so the fake refuses it too.
      if (!auth?.startsWith('Bearer at_')) {
        return json(401, {
          error: {
            code: 'unauthorized',
            message: 'This endpoint needs a signed-in user’s access token.',
          },
        });
      }
      return json(200, {
        user: { ...USER, firstName: 'Renamed' },
        organizations: [
          { id: 'org_1', name: 'Acme', slug: 'acme', role: 'admin', imageUrl: null },
        ],
        organization: null,
      });
    }

    if (path === '/v1/me/organizations') {
      if (!auth?.startsWith('Bearer at_')) return json(401, {});
      return json(200, {
        organizations: [
          { id: 'org_1', name: 'Acme', slug: 'acme', role: 'admin', imageUrl: null },
        ],
      });
    }

    if (path === '/v1/me/organization/members') {
      if (!auth?.startsWith('Bearer at_')) return json(401, {});
      return json(200, {
        members: [
          {
            userId: 'user_1',
            email: 'a@example.com',
            firstName: 'A',
            lastName: null,
            imageUrl: null,
            role: 'admin',
            joinedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
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

  console.log('\n\x1b[1mOrganizations and the live profile\x1b[0m');

  {
    const api = fakeApi();
    const { client } = makeClient(api);
    await client.load();
    await client.signIn.withPassword({ identifier: 'a@example.com', password: 'x' });

    const orgs = await client.organizations.list();
    check('a switcher can be built without a second sign-in', orgs.length === 1);
    check('and it names the organization', orgs[0]?.id === 'org_1');

    const meCall = api.calls.find((c) => c.path === '/v1/me/organizations');
    check(
      'the request carries the PERSON’s token, not the app key',
      meCall?.auth?.startsWith('Bearer at_') === true,
      meCall?.auth ?? 'none',
    );

    const members = await client.organizations.members();
    check('members of the active organization are readable', members.length === 1);

    const live = await client.me.fetch();
    check(
      'the live profile beats the token snapshot',
      live.user?.firstName === 'Renamed',
    );

    await client.signOut();
    check(
      'signed out, the org list is empty rather than an error',
      (await client.organizations.list()).length === 0,
    );
  }

  console.log('\n\x1b[1mA fresh page load remembers who was signed in\x1b[0m');
  {
    /*
     * Two clients sharing one storage adapter: the first signs in and
     * persists; the second is "the reopened tab", against a backend
     * whose refresh returns the session alone. The user must come from
     * what was persisted, not from hoping the network repeats it.
     */
    const storage = memoryStorage();
    const first = new ZevAuth({
      publishableKey: 'pk_test_abc', apiUrl: 'https://api.test',
      fetch: fakeApi().fetch, storage,
    });
    await first.load();
    await first.signIn.withPassword({ identifier: 'ada@example.com', password: 'pw' });
    check('the first tab is signed in', first.user?.id === USER.id);

    const reopened = new ZevAuth({
      publishableKey: 'pk_test_abc', apiUrl: 'https://api.test',
      fetch: fakeApi({ refreshOmitsUser: true }).fetch, storage,
    });
    await reopened.load();
    check(
      'the reopened tab is signed in even though refresh returned no user',
      reopened.user?.id === USER.id,
      JSON.stringify(reopened.user),
    );
    check('and holds the rotated session', reopened.isLoaded);
  }

  console.log('\n\x1b[1mThe ZevID redirect\x1b[0m');

  {
    /*
     * `apiUrl` is allowed to be relative, and this is the only place in
     * the SDK that ever built a URL with `new URL(path, base)` — which
     * requires an absolute base and throws on a relative one. The button
     * did nothing but log `Invalid base URL`, while every other call in
     * the same client worked, because they all concatenate.
     */
    for (const [apiUrl, expected] of [
      ['https://api.test', 'https://api.test/v1/auth/zevid/start'],
      // A dev server proxying to us. This is the case that threw.
      ['/zevauth', '/zevauth/v1/auth/zevid/start'],
      // A base that already carries a path keeps it.
      ['https://example.com/zevauth', 'https://example.com/zevauth/v1/auth/zevid/start'],
    ] as const) {
      let assigned = '';
      (globalThis as any).location = {
        get href() { return 'https://app.example.com/'; },
        assign(to: string) { assigned = to; },
      };

      const client = new ZevAuth({
        publishableKey: 'pk_test_abc',
        apiUrl,
        fetch: fakeApi().fetch,
        storage: memoryStorage(),
      });

      let threw: string | null = null;
      try {
        client.signIn.withZevId();
      } catch (err) {
        threw = (err as Error).message;
      }

      check(
        `apiUrl "${apiUrl}" redirects to ${expected}`,
        threw === null && assigned.startsWith(expected),
        threw ?? assigned,
      );
      check(
        `and carries the publishable key, which a navigation cannot put in a header`,
        assigned.includes('publishable_key=pk_test_abc'),
        assigned,
      );
      delete (globalThis as any).location;
    }

    {
      let assigned = '';
      (globalThis as any).location = {
        get href() { return 'https://app.example.com/'; },
        assign(to: string) { assigned = to; },
      };
      const client = new ZevAuth({
        publishableKey: 'pk_test_abc',
        apiUrl: '/zevauth',
        fetch: fakeApi().fetch,
        storage: memoryStorage(),
      });
      client.signIn.withZevId({ redirectUrl: 'https://app.example.com/after?a=1&b=2' });
      check(
        'the return URL is encoded rather than pasted in raw',
        assigned.includes(
          'redirect_url=https%3A%2F%2Fapp.example.com%2Fafter%3Fa%3D1%26b%3D2',
        ) && assigned.startsWith('/zevauth/v1/auth/zevid/start?'),
        assigned,
      );
      delete (globalThis as any).location;
    }
  }

  console.log('\n\x1b[1mA sign-in that came back with an error\x1b[0m');
  {
    let href = 'https://app.example.com/callback?error=zevid_expired&error_description=Took%20too%20long&state=abc&keep=1';
    (globalThis as any).location = { get href() { return href; }, assign() {} };
    (globalThis as any).history = { replaceState: (_s: unknown, _t: string, url: string) => { href = url; } };
    const { client } = makeClient(fakeApi());
    await client.load();
    const err = client.takeHandoffError();
    check('the error is handed to whoever asks', err?.code === 'zevid_expired' && err.description === 'Took too long', JSON.stringify(err));
    check('once', client.takeHandoffError() === null);
    check('and scrubbed from the URL, leaving the rest alone', !href.includes('error') && !href.includes('state=') && href.includes('keep=1'), href);
    check('nobody is signed in', client.user === null);
    delete (globalThis as any).location; delete (globalThis as any).history;
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
