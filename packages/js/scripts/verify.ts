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
  method: string;
  path: string;
  body: any;
  auth: string | null;
}

/** A fake API that records what it was asked, and can be told to fail. */
function fakeApi(options: {
  onRefresh?: (n: number, body: any) => 'ok' | 'reuse' | 'reauth';
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
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({ method, path, body, auth });

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

      if (verdict === 'reauth') {
        return json(401, {
          error: {
            code: 'reauthentication_required',
            message: 'Sign in with ZevID again to continue.',
          },
        });
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

    if (path === '/v1/auth/magic-link/verify') {
      if (body?.token !== 'good-link') {
        return json(400, { error: { code: 'link_invalid', message: 'That link has expired.' } });
      }
      issued++;
      return json(200, {
        user: USER,
        session: { accessToken: `at_${issued}`, refreshToken: `rt_${issued}`, expiresIn: 900, organization: null },
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

    if (path === '/v1/me/organizations' && method === 'POST') {
      if (!auth?.startsWith('Bearer at_')) return json(401, {});
      if (body?.name === 'Over the limit') {
        return json(403, {
          error: { code: 'organization_limit_reached', message: 'You can create up to 1 organization.' },
        });
      }
      return json(201, {
        organization: {
          id: 'org_new', name: body.name, slug: null, imageUrl: null,
          role: 'org:owner', permissions: ['org:manage', 'org:delete'],
        },
      });
    }

    if (path === '/v1/me/organization/leave' || (path === '/v1/me/organization' && method === 'DELETE')) {
      if (!auth?.startsWith('Bearer at_')) return json(401, {});
      return json(200, { ok: true });
    }

    if (path === '/v1/me/sessions') {
      if (!auth?.startsWith('Bearer at_')) return json(401, {});
      return json(200, {
        sessions: [
          { id: 'sess_here', userAgent: 'UA', ipAddress: null, provider: 'email_password',
            createdAt: '2026-01-01T00:00:00.000Z', lastActiveAt: '2026-01-01T00:00:00.000Z',
            expiresAt: '2026-02-01T00:00:00.000Z', isCurrent: true },
          { id: 'sess_phone', userAgent: 'UA2', ipAddress: null, provider: 'magic_link',
            createdAt: '2026-01-01T00:00:00.000Z', lastActiveAt: '2026-01-01T00:00:00.000Z',
            expiresAt: '2026-02-01T00:00:00.000Z', isCurrent: false },
        ],
        ipDisplay: 'hidden',
      });
    }

    if (path === '/v1/me/sessions/sess_here' && method === 'DELETE') {
      return json(400, { error: { code: 'session_is_current', message: 'Sign out instead.' } });
    }
    if (path.startsWith('/v1/me/sessions/') && method === 'DELETE') {
      return json(200, { revoked: true });
    }
    if (path === '/v1/me/sessions/revoke-others') {
      return json(200, { revoked: 1 });
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

  console.log('\n\x1b[1mLoading once\x1b[0m');

  {
    /*
     * Two callers at once (strict mode, a plugin plus a component) used
     * to start two loads: two environment fetches, and a second attempt
     * at a one-time handoff code the first had already spent.
     */
    const api = fakeApi();
    const { client } = makeClient(api);
    await Promise.all([client.load(), client.load(), client.load()]);
    const fetches = api.calls.filter((c) => c.path === '/v1/environment').length;
    check('concurrent loads share one run', fetches === 1, `${fetches} environment fetches`);
    await client.load();
    check('and a load after it finished does nothing', api.calls.filter((c) => c.path === '/v1/environment').length === 1);
  }

  console.log('\n\x1b[1mSession bridge\x1b[0m');

  {
    /*
     * Server-rendered apps: every token change is posted to the
     * developer's endpoint, in order, with the CSRF header; a first load
     * with no session posts nothing.
     */
    const api = fakeApi();
    const posts: Array<{ token: string | null; header: string | null; credentials?: string }> = [];
    const fetchWithBridge = (async (url: string, init: RequestInit = {}) => {
      if (String(url).endsWith('/zevauth/session')) {
        posts.push({
          token: JSON.parse(init.body as string).token,
          header: (init.headers as Record<string, string>)['x-zevauth-bridge'] ?? null,
          credentials: init.credentials,
        });
        return new Response(null, { status: 204 });
      }
      return api.fetch(url, init);
    }) as typeof fetch;
    const client = new ZevAuth({
      publishableKey: 'pk_test_abc',
      apiUrl: 'https://api.test',
      fetch: fetchWithBridge,
      storage: memoryStorage(),
      sessionBridge: { url: '/zevauth/session' },
    });
    await client.load();
    await client.syncSessionBridge().catch(() => {});
    const afterLoad = posts.length;
    check('a signed-out first load posts only when asked to (the handshake)', afterLoad === 1 && posts[0].token === null);

    await client.signIn.withPassword({ identifier: 'a@example.com', password: 'hunter2hunter2' });
    await client.syncSessionBridge();
    const signedIn = posts.slice(afterLoad).find((p) => p.token);
    check('signing in posts the access token', Boolean(signedIn?.token?.startsWith('at_')));
    check('with the CSRF header and the page cookies', signedIn?.header === '1' && signedIn?.credentials === 'include');
    check('and never the refresh token', posts.every((p) => !p.token?.startsWith('rt_')));

    const beforeSignOut = posts.length;
    await client.signOut();
    await client.syncSessionBridge();
    check('signing out posts a clear', posts.slice(beforeSignOut).some((p) => p.token === null));

    const quiet = new ZevAuth({ publishableKey: 'pk_test_abc', apiUrl: 'https://api.test', fetch: fetchWithBridge, storage: memoryStorage(), sessionBridge: { url: '/zevauth/session' } });
    const count = posts.length;
    await quiet.load();
    await new Promise((r) => setTimeout(r, 10));
    check('a signed-out visitor costs the server no request', posts.length === count);
  }

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

  console.log('\n\x1b[1mCreating, leaving and deleting organizations\x1b[0m');
  {
    const api = fakeApi();
    const { client } = makeClient(api);
    await client.load();
    await client.signIn.withPassword({ identifier: 'a@example.com', password: 'x' });

    const created = await client.organizations.create({ name: 'Northwind' });
    check('creating returns the new membership with the caller as owner', created.id === 'org_new' && created.role === 'org:owner');
    const switchAfterCreate = api.calls.findLast((c) => c.path === '/v1/auth/switch-organization');
    check('and switches the session to it, so the next invite lands there', switchAfterCreate?.body?.organizationId === 'org_new');
    check('which every subscriber sees', client.organization?.id === 'org_new');

    let code = '';
    try {
      await client.organizations.create({ name: 'Over the limit' });
    } catch (err) {
      code = (err as ZevAuthError).code;
    }
    check('a refusal surfaces its reason code', code === 'organization_limit_reached', code);

    await client.organizations.leave();
    check('leaving calls the leave route', api.calls.some((c) => c.path === '/v1/me/organization/leave' && c.method === 'POST'));
    check('and returns to personal scope at once', client.organization === null && api.calls.findLast((c) => c.path === '/v1/auth/switch-organization')?.body?.organizationId === null);

    await client.organizations.setActive('org_1');
    await client.organizations.delete();
    check('deleting calls DELETE on the active organization', api.calls.some((c) => c.path === '/v1/me/organization' && c.method === 'DELETE'));
    check('and also returns to personal scope', client.organization === null);
  }

  console.log('\n\x1b[1mYour sessions\x1b[0m');
  {
    const api = fakeApi();
    const { client } = makeClient(api);
    await client.load();
    await client.signIn.withPassword({ identifier: 'a@example.com', password: 'x' });

    const sessions = await client.me.sessions();
    check('lists where they are signed in, current marked', sessions.length === 2 && sessions[0].isCurrent);
    check('with no token material in the shape', !sessions.some((s) => 'accessToken' in s || 'refreshToken' in s));
    check('each session carries the IP display mode the API applied', sessions.every((s) => s.ipDisplay === 'hidden'));
    check('an API that sends no organization policy reads as null, not as defaults', client.organizationSettings === null);

    await client.me.revokeSession('sess_phone');
    check('revoking another session sends DELETE for that id', api.calls.some((c) => c.method === 'DELETE' && c.path === '/v1/me/sessions/sess_phone'));

    let code = '';
    try {
      await client.me.revokeSession('sess_here');
    } catch (err) {
      code = (err as ZevAuthError).code;
    }
    check('the current one is refused with a reason', code === 'session_is_current', code);

    const others = await client.me.revokeOtherSessions();
    check('signing out elsewhere reports how many ended', others.revoked === 1);

    await client.signOut();
    check('signed out, the list is empty rather than an error', (await client.me.sessions()).length === 0);
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

  console.log('\n\x1b[1mZevID sign-in bound with PKCE\x1b[0m');

  {
    /*
     * The ZevID team's leg 2 requirements: the code is bound to this
     * tab's PKCE verifier and redirect, and the app's state comes back
     * unchanged and is checked.
     */
    const store = new Map<string, string>();
    (globalThis as any).sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    let assigned = '';
    (globalThis as any).location = { get href() { return 'https://app.example.com/'; }, assign(to: string) { assigned = to; } };
    const starter = new ZevAuth({ publishableKey: 'pk_test_abc', apiUrl: 'https://api.test', fetch: fakeApi().fetch, storage: memoryStorage() });
    await starter.signIn.withZevId({ redirectUrl: 'https://app.example.com/callback', pkce: true });
    const sent = new URL(assigned);
    const state = sent.searchParams.get('state') ?? '';
    check(
      'pkce: true sends an S256 challenge and a state',
      sent.searchParams.get('code_challenge_method') === 'S256' &&
        /^[A-Za-z0-9_-]{43}$/.test(sent.searchParams.get('code_challenge') ?? '') &&
        state.length > 0,
      assigned,
    );
    check('and never the verifier', !assigned.includes('verifier'));

    const api = fakeApi();
    let href = `https://app.example.com/callback?code=hoc_abc&state=${state}&keep=1`;
    (globalThis as any).location = { get href() { return href; }, assign() {} };
    (globalThis as any).history = { replaceState: (_s: unknown, _t: string, url: string) => { href = url; } };
    const { client } = makeClient(api);
    await client.load();
    const exchange = api.calls.find((c) => c.path === '/v1/auth/handoff/exchange');
    check(
      'the exchange proves the verifier and names the exact redirect',
      typeof exchange?.body?.codeVerifier === 'string' &&
        exchange.body.redirectUri === 'https://app.example.com/callback?keep=1',
      JSON.stringify(exchange?.body),
    );
    check('and the code and our state leave the URL', !href.includes('code=') && !href.includes('state=') && href.includes('keep=1'), href);

    // A response this tab did not ask for.
    await starter.signIn.withZevId({ pkce: true });
    const api2 = fakeApi();
    href = 'https://app.example.com/callback?code=hoc_planted&state=someone-else';
    (globalThis as any).location = { get href() { return href; }, assign() {} };
    const planted = makeClient(api2).client;
    await planted.load();
    check(
      'a state that does not match is refused before any exchange',
      !api2.calls.some((c) => c.path === '/v1/auth/handoff/exchange') &&
        planted.takeHandoffError()?.code === 'state_mismatch',
    );

    // Without PKCE, a page's own `state` is left alone.
    const api3 = fakeApi();
    href = 'https://app.example.com/callback?code=hoc_abc&state=page-owned';
    await makeClient(api3).client.load();
    check('a web exchange without PKCE sends just the code', JSON.stringify(api3.calls.find((c) => c.path === '/v1/auth/handoff/exchange')?.body) === '{"code":"hoc_abc"}');
    check('and leaves a page’s own state in the URL', href.includes('state=page-owned'), href);

    delete (globalThis as any).location;
    delete (globalThis as any).history;
    delete (globalThis as any).sessionStorage;
  }

  console.log('\n\x1b[1mA ZevID session past its fresh-sign-in window\x1b[0m');

  {
    const storage = memoryStorage();
    const first = new ZevAuth({ publishableKey: 'pk_test_abc', apiUrl: 'https://api.test', fetch: fakeApi().fetch, storage });
    await first.load();
    await first.signIn.withPassword({ identifier: 'ada@example.com', password: 'pw' });

    const reopened = new ZevAuth({
      publishableKey: 'pk_test_abc', apiUrl: 'https://api.test',
      fetch: fakeApi({ onRefresh: () => 'reauth' }).fetch, storage,
    });
    await reopened.load();
    const handoff = reopened.takeHandoffError();
    check('restoring it signs out', reopened.user === null);
    check(
      'and says why, where <SignIn> will show it',
      handoff?.code === 'zevid_reauthentication_required',
      JSON.stringify(handoff),
    );
  }

  console.log('\n\x1b[1mTwo-step verification\x1b[0m');

  {
    /*
     * A fake API for the MFA routes only. Sign-in answers with a
     * challenge; the challenge is redeemed for a session that still has a
     * `setup_mfa`-free state; enrollment refreshes the session.
     */
    const calls: Array<{ path: string; body: any; auth: string | null }> = [];
    let refreshes = 0;
    const session = (pendingTasks?: string[]) => ({
      accessToken: `at_${calls.length}`,
      refreshToken: `rt_${calls.length}`,
      expiresIn: 900,
      ...(pendingTasks ? { pendingTasks } : {}),
    });
    const fetchMfa = (async (url: string, init: RequestInit = {}) => {
      const path = new URL(url).pathname;
      const body = init.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ path, body, auth: (init.headers as Record<string, string>)?.Authorization ?? null });
      const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status });
      switch (path) {
        case '/v1/environment':
          return json(200, { id: 'env_test_x', kind: 'test', isTestMode: true, signInMethods: ['password'] });
        case '/v1/auth/signin':
          return json(200, {
            status: 'needs_second_factor',
            challenge: { id: 'chal_secret', factors: ['totp', 'recovery_code'], expiresAt: '2030-01-01T00:00:00Z' },
          });
        case '/v1/auth/mfa/verify':
          if (body.code !== '123456') {
            return json(401, { error: { code: 'mfa_code_invalid', message: 'That code is not valid. Try again.' } });
          }
          return json(200, { user: USER, session: session() });
        case '/v1/auth/refresh':
          refreshes++;
          return json(200, { user: USER, session: session() });
        case '/v1/me/mfa/totp':
          return json(201, { factorId: 'fac_1', secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/x' });
        case '/v1/me/mfa/totp/confirm':
          return json(200, { factor: { id: 'fac_1', type: 'totp' }, recoveryCodes: ['AAAAA-BBBBB'] });
        default:
          return json(404, { error: { code: 'not_found', message: path } });
      }
    }) as unknown as typeof fetch;

    const client = new ZevAuth({ publishableKey: 'pk_test_abc', apiUrl: 'https://api.test', fetch: fetchMfa, storage: memoryStorage() });
    await client.load();
    const states: any[] = [];
    client.addListener((state) => states.push(state));

    const first = await client.signIn.withPassword({ identifier: 'a@example.com', password: 'pw' });
    check('a sign-in that needs a second factor says so', first.status === 'needs_second_factor');
    check('and nobody is signed in yet', client.user === null);
    check('the state carries what the UI needs, not the challenge id', states.at(-1)?.secondFactor?.factors?.join() === 'totp,recovery_code' && !JSON.stringify(states.at(-1)).includes('chal_secret'));

    let wrong: unknown;
    try {
      await client.signIn.verifySecondFactor({ code: '000000' });
    } catch (err) {
      wrong = err;
    }
    check('a wrong code is a coded error', wrong instanceof ZevAuthError && (wrong as ZevAuthError).code === 'mfa_code_invalid');
    check('and the challenge is kept for another try', client.secondFactor !== null);

    const second = await client.signIn.verifySecondFactor({ code: '123456' });
    const verifyCall = calls.find((c) => c.path === '/v1/auth/mfa/verify' && c.body.code === '123456');
    check('the right code completes the sign-in', second.status === 'complete' && client.user?.id === USER.id);
    check('using the challenge from the sign-in, with the publishable key', verifyCall?.body.challengeId === 'chal_secret' && verifyCall?.auth === 'Bearer pk_test_abc');
    check('and the challenge is gone afterwards', client.secondFactor === null);

    const enrollment = await client.me.mfa.startTotp();
    check('enrollment returns the secret and the QR URI', enrollment.secret === 'JBSWY3DPEHPK3PXP' && enrollment.otpauthUri.startsWith('otpauth://'));
    const before = refreshes;
    const confirmed = await client.mfa.confirmTotp({ code: '123456' });
    check('confirming returns the recovery codes once', confirmed.recoveryCodes.length === 1);
    check('and refreshes the session so a setup task clears at once', refreshes === before + 1);
  }

  {
    /*
     * Remembered devices. The token comes back from verify only when the
     * person asked and the app allows it; the client keeps it and sends
     * it on sign-in routes, and nowhere else.
     */
    const seen: Array<{ path: string; device: string | null }> = [];
    const storage = memoryStorage();
    const fetchDevice = (async (url: string, init: RequestInit = {}) => {
      const path = new URL(url).pathname;
      const headers = (init.headers ?? {}) as Record<string, string>;
      seen.push({ path, device: headers['X-Zevauth-Device'] ?? null });
      const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 });
      if (path === '/v1/environment') return json({ id: 'env_test_x', kind: 'test', isTestMode: true, signInMethods: ['password'] });
      if (path === '/v1/auth/signin') {
        return json({ status: 'needs_second_factor', challenge: { id: 'chal', factors: ['totp'], expiresAt: '2030-01-01T00:00:00Z' } });
      }
      if (path === '/v1/auth/mfa/verify') {
        return json({
          user: USER,
          session: { accessToken: 'a', refreshToken: 'r', expiresIn: 900 },
          trustedDevice: { token: 'mfd_kept', expiresAt: '2030-01-01T00:00:00Z' },
        });
      }
      return json({});
    }) as unknown as typeof fetch;
    const client = new ZevAuth({ publishableKey: 'pk_test_abc', apiUrl: 'https://api.test', fetch: fetchDevice, storage });
    await client.load();
    await client.signIn.withPassword({ identifier: 'a@example.com', password: 'pw' });
    check('no device token is sent before one was issued', seen.find((c) => c.path === '/v1/auth/signin')?.device === null);
    await client.signIn.verifySecondFactor({ code: '123456', rememberDevice: true });
    await client.signOut();
    seen.length = 0;
    await client.signIn.withPassword({ identifier: 'a@example.com', password: 'pw' });
    check('a remembered device is sent at the next sign-in, after signing out', seen.find((c) => c.path === '/v1/auth/signin')?.device === 'mfd_kept');
    check('and never to the environment route', seen.filter((c) => c.path === '/v1/environment').every((c) => c.device === null));
  }

  {
    // A session that must set up MFA says so on state.
    const fetchTask = (async (url: string) => {
      const path = new URL(url).pathname;
      const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 });
      if (path === '/v1/environment') return json({ id: 'env_test_x', kind: 'test', isTestMode: true, signInMethods: ['password'] });
      return json({ user: USER, session: { accessToken: 'a', refreshToken: 'r', expiresIn: 900, pendingTasks: ['setup_mfa'] } });
    }) as unknown as typeof fetch;
    const client = new ZevAuth({ publishableKey: 'pk_test_abc', apiUrl: 'https://api.test', fetch: fetchTask, storage: memoryStorage() });
    await client.load();
    const result = await client.signIn.withPassword({ identifier: 'a@example.com', password: 'pw' });
    check('a session with a pending task is still a completed sign-in', result.status === 'complete' && client.user !== null);
    check('and exposes the task', client.pendingTasks.join() === 'setup_mfa');
    await client.signOut();
    check('signing out clears it', client.pendingTasks.length === 0);
  }

  console.log('\n\x1b[1mNative apps: async storage, deep links, PKCE\x1b[0m');

  {
    // An async store (the keychain, via expo-secure-store) holding a session.
    const backing = new Map<string, string>([
      ['zevauth.session.test', JSON.stringify({ refreshToken: 'rt_saved', expiresAt: 0, user: USER, organization: null })],
    ]);
    const writes: string[] = [];
    const asyncStorage = {
      get: async (k: string) => backing.get(k) ?? null,
      set: async (k: string, v: string) => { writes.push(k); backing.set(k, v); },
      remove: async (k: string) => { backing.delete(k); },
    };
    const api = fakeApi();
    const client = new ZevAuth({ publishableKey: 'pk_test_abc', apiUrl: 'https://api.test', fetch: api.fetch, asyncStorage });
    await client.load();
    check('an async store is read before the session is restored', client.user?.id === USER.id && api.refreshCount === 1);
    await client.flushStorage();
    check('and the rotated token is written back to it', JSON.parse(backing.get('zevauth.session.test') ?? '{}').refreshToken === 'rt_1');

    await client.signOut();
    await client.flushStorage();
    check('signing out removes it from the async store', !backing.has('zevauth.session.test'));
  }

  {
    const api = fakeApi();
    const { client } = makeClient(api);
    const fixed = new Uint8Array(32).fill(7);
    const crypto = {
      getRandomValues: (b: Uint8Array) => { b.set(fixed.subarray(0, b.length)); return b; },
      sha256: async (input: string) => new Uint8Array(32).fill(input.length),
    };
    const native = new ZevAuth({ publishableKey: 'pk_test_abc', apiUrl: 'https://api.test', fetch: api.fetch, storage: memoryStorage(), crypto });
    const url = await native.createZevIdAuthorizationUrl({ redirectUrl: 'https://acme.example/auth/callback' });
    check('the native ZevID URL carries an S256 challenge, a state and the redirect',
      url.startsWith('https://api.test/v1/auth/zevid/start?') && url.includes('code_challenge_method=S256') &&
      url.includes('code_challenge=') && url.includes('state=') && url.includes('redirect_url=https%3A%2F%2Facme.example%2Fauth%2Fcallback'));
    const state = decodeURIComponent(/state=([^&]+)/.exec(url)?.[1] ?? '');

    const wrong = await native.handleIncomingUrl('https://acme.example/auth/callback?code=hoc_x&state=someone-else');
    check('a code with a different state is refused, without being exchanged',
      wrong.status === 'error' && wrong.error.code === 'state_mismatch' &&
      !api.calls.some((c) => c.path === '/v1/auth/handoff/exchange'));

    await native.createZevIdAuthorizationUrl({ redirectUrl: 'https://acme.example/auth/callback' });
    const ok = await native.handleIncomingUrl(`https://acme.example/auth/callback?code=hoc_x&state=${encodeURIComponent(state)}`);
    const exchange = api.calls.find((c) => c.path === '/v1/auth/handoff/exchange');
    check('the matching return is exchanged with the verifier and the exact redirect',
      ok.status === 'complete' && typeof exchange?.body?.codeVerifier === 'string' &&
      exchange?.body?.redirectUri === 'https://acme.example/auth/callback');

    const denied = await native.handleIncomingUrl('myapp://callback?error=zevid_denied&error_description=You%20chose%20not%20to%20continue.&state=x');
    check('a failed sign-in comes back as an error the app can show',
      denied.status === 'error' && denied.error.description === 'You chose not to continue.');

    const magic = await client.handleIncomingUrl('https://acme.example/sign-in?zv_token=good-link&zv_flow=sign-in');
    check('a sign-in link opened in the app signs in', magic.status === 'complete' && client.user?.id === USER.id);
    const stale = await client.handleIncomingUrl('https://acme.example/sign-in?zv_token=old&zv_flow=sign-in');
    check('and a used link says so instead of throwing', stale.status === 'error');
    check('links that are not ours are ignored', (await client.handleIncomingUrl('https://acme.example/settings')).status === 'ignored');
  }

  {
    // Foreground resume: a revoked session is signed out, a network blip is not.
    const api = fakeApi({ onRefresh: (n) => (n === 1 ? 'ok' : 'reuse') });
    const storage = memoryStorage();
    storage.set('zevauth.session.test', JSON.stringify({ refreshToken: 'rt_saved', expiresAt: 0, user: USER, organization: null }));
    const { client } = makeClient(api, storage);
    await client.load();
    storage.set('zevauth.session.test', JSON.stringify({ ...JSON.parse(storage.get('zevauth.session.test')!), expiresAt: 0 }));
    let told = 0;
    client.addListener(() => told++);
    await client.revalidate();
    check('coming back to the foreground with a dead session signs out', client.user === null && told > 0);
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
