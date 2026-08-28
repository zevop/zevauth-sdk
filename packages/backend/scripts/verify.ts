/**
 * The server client's behaviour, against a fake API.
 *
 * ── What is worth proving here ────────────────────────────────────
 * Not that the endpoints work — `zevauth-backend`'s own suites cover
 * that against a real database. What is worth proving is the behaviour
 * this client adds on top, all of which only shows up when something
 * goes wrong: that it retries what is safe to retry and nothing else,
 * that it gives up rather than hanging, and that it refuses a
 * publishable key before it can be pasted into production.
 *
 * The retry rule is the one that would be expensive to get wrong. A
 * client that repeats a POST after a 500 turns one `createUser` into
 * two users, silently, in a nightly job nobody is watching.
 */
import { ZevAuthBackend, ZevAuthError } from '../src/index';

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

interface Call {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

/** A fetch that answers from a script and records what it was asked. */
function fakeFetch(
  responses: Array<{ status: number; body?: unknown } | 'network-error'>,
) {
  const calls: Call[] = [];
  let index = 0;

  const impl = (async (url: string | URL, init?: RequestInit) => {
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>),
    );
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      headers,
    });

    const next = responses[Math.min(index++, responses.length - 1)];
    if (next === 'network-error') throw new Error('socket hang up');

    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: async () => (next.body === undefined ? '' : JSON.stringify(next.body)),
    } as Response;
  }) as unknown as typeof fetch;

  return { impl, calls };
}

function client(fetchImpl: typeof fetch, maxRetries = 2) {
  return new ZevAuthBackend({
    secretKey: 'sk_test_abc',
    apiUrl: 'https://api.test',
    fetch: fetchImpl,
    maxRetries,
    timeoutMs: 200,
  });
}

async function main() {
  console.log('\n\x1b[1mThe key it will accept\x1b[0m');
  {
    let threw: ZevAuthError | null = null;
    try {
      new ZevAuthBackend({ secretKey: 'pk_test_abc' });
    } catch (err) {
      threw = err as ZevAuthError;
    }
    check('a publishable key is refused at construction', threw !== null);
    check(
      'and the message names the mistake and the fix',
      Boolean(threw && /secret key/i.test(threw.message)),
      threw?.message,
    );
    check(
      'it also says it must not run in a browser',
      Boolean(threw && /browser/i.test(threw.message)),
      threw?.message,
    );

    let missing: ZevAuthError | null = null;
    try {
      new ZevAuthBackend({ secretKey: '' });
    } catch (err) {
      missing = err as ZevAuthError;
    }
    check('an empty key is refused too', missing !== null);
  }

  console.log('\n\x1b[1mRequests carry the secret key\x1b[0m');
  {
    const { impl, calls } = fakeFetch([{ status: 200, body: { data: [] } }]);
    await client(impl).users.list();
    check(
      'as a bearer token',
      calls[0]?.headers.authorization === 'Bearer sk_test_abc',
      JSON.stringify(calls[0]?.headers),
    );
    check(
      'to the configured API',
      calls[0]?.url.startsWith('https://api.test/v1/users'),
      calls[0]?.url,
    );
  }

  console.log('\n\x1b[1mWhat is retried, and what is not\x1b[0m');
  {
    /*
     * The dangerous direction is retrying too much. A POST that returned
     * 500 may well have created something before it failed, so repeating
     * it produces a duplicate nobody asked for and nobody sees.
     */
    const bare500 = fakeFetch([
      { status: 500, body: { error: { message: 'boom' } } },
      { status: 200, body: { id: 'usr_1' } },
    ]);
    let threw = false;
    try {
      await client(bare500.impl).users.create({ email: 'a@example.com' });
    } catch {
      threw = true;
    }
    check('a 500 is NOT retried, because the write may have landed', threw);
    check('so it is attempted exactly once', bare500.calls.length === 1,
      String(bare500.calls.length));

    const gateway = fakeFetch([
      { status: 503 },
      { status: 200, body: { id: 'usr_1' } },
    ]);
    const recovered = await client(gateway.impl).users.get('usr_1');
    check(
      'a 503 IS retried, because a gateway never reached us',
      (recovered as { id: string }).id === 'usr_1',
    );
    check('taking two attempts', gateway.calls.length === 2,
      String(gateway.calls.length));

    const dropped = fakeFetch(['network-error', { status: 200, body: { ok: 1 } }]);
    await client(dropped.impl).users.get('usr_1');
    check('a dropped connection is retried', dropped.calls.length === 2,
      String(dropped.calls.length));

    const throttled = fakeFetch([
      { status: 429 },
      { status: 200, body: { ok: 1 } },
    ]);
    await client(throttled.impl).users.get('usr_1');
    check('a 429 is retried', throttled.calls.length === 2);

    const notFound = fakeFetch([{ status: 404, body: { error: { message: 'User not found.' } } }]);
    let notFoundError: ZevAuthError | null = null;
    try {
      await client(notFound.impl).users.get('usr_nope');
    } catch (err) {
      notFoundError = err as ZevAuthError;
    }
    check('a 404 is not retried', notFound.calls.length === 1);
    check(
      "and surfaces the server's own message",
      notFoundError?.message === 'User not found.',
      notFoundError?.message,
    );
    check('with the status attached', notFoundError?.status === 404);
  }

  console.log('\n\x1b[1mGiving up\x1b[0m');
  {
    const alwaysDown = fakeFetch(['network-error']);
    let threw: ZevAuthError | null = null;
    try {
      await client(alwaysDown.impl, 2).users.get('usr_1');
    } catch (err) {
      threw = err as ZevAuthError;
    }
    check('it stops after the configured retries', alwaysDown.calls.length === 3,
      String(alwaysDown.calls.length));
    check('and reports it could not reach us', threw?.code === 'network_error',
      threw?.code);

    /*
     * Never settles on its own, and rejects when aborted — which is what
     * a real `fetch` does with a signal. The fake has to honour the
     * signal or this test proves nothing: it would hang whether or not
     * the client set a timeout at all.
     */
    const hangs = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      })) as unknown as typeof fetch;
    const start = Date.now();
    let timedOut = false;
    try {
      await client(hangs, 0).users.get('usr_1');
    } catch {
      timedOut = true;
    }
    check('a hung request times out rather than waiting forever', timedOut);
    check(
      'and does so promptly',
      Date.now() - start < 3000,
      `${Date.now() - start}ms`,
    );
  }

  console.log('\n\x1b[1mRequest shapes\x1b[0m');
  {
    const { impl, calls } = fakeFetch([{ status: 200, body: {} }]);
    const zev = client(impl);

    await zev.users.list({ limit: 10, query: 'ada' });
    check(
      'list passes its filters as query parameters',
      calls[0].url.includes('limit=10') && calls[0].url.includes('query=ada'),
      calls[0].url,
    );
    check(
      'and omits what was not given',
      !calls[0].url.includes('after='),
      calls[0].url,
    );

    calls.length = 0;
    await zev.users.list({ metadata: { type: 'seller', tier: 2 } });
    check(
      'a metadata filter is flattened to the bracketed form the API reads',
      calls[0].url.includes('metadata%5Btype%5D=seller'),
      calls[0].url,
    );
    check(
      'and non-string values are stringified rather than dropped',
      calls[0].url.includes('metadata%5Btier%5D=2'),
      calls[0].url,
    );

    calls.length = 0;
    await zev.sandbox.mintToken('usr_1');
    check(
      'minting a token is a POST to the user\'s sandbox route',
      calls[0].method === 'POST' &&
        calls[0].url.endsWith('/v1/sandbox/users/usr_1/tokens'),
      `${calls[0].method} ${calls[0].url}`,
    );

    calls.length = 0;
    await zev.sandbox.emails({ to: 'ada@example.com' });
    check(
      'captured mail is a GET with the recipient as a query parameter',
      calls[0].method === 'GET' &&
        calls[0].url.includes('/v1/sandbox/emails') &&
        calls[0].url.includes('to=ada%40example.com'),
      `${calls[0].method} ${calls[0].url}`,
    );

    calls.length = 0;
    await zev.sandbox.resetUsers();
    check(
      'resetting users is a DELETE',
      calls[0].method === 'DELETE' && calls[0].url.endsWith('/v1/sandbox/users'),
      `${calls[0].method} ${calls[0].url}`,
    );

    calls.length = 0;
    await zev.users.setBlocked('usr_1', true);
    check('blocking is a POST with the flag', calls[0].method === 'POST' &&
      (calls[0].body as { blocked: boolean }).blocked === true);

    calls.length = 0;
    await zev.users.delete('usr_1');
    check('deleting is a DELETE', calls[0].method === 'DELETE');

    calls.length = 0;
    await zev.organizations.update('org_1', { imageUrl: null });
    check('a null is sent, not dropped', calls[0].method === 'PATCH' &&
      'imageUrl' in (calls[0].body as object) &&
      (calls[0].body as { imageUrl: null }).imageUrl === null,
      JSON.stringify(calls[0].body));

    calls.length = 0;
    await zev.users.get('usr/../../admin');
    check(
      'an id is escaped rather than pasted into the path',
      !calls[0].url.includes('../'),
      calls[0].url,
    );
  }

  console.log('\n\x1b[1mA 204 is not a parse error\x1b[0m');
  {
    const { impl } = fakeFetch([{ status: 204 }]);
    let threw = false;
    try {
      await client(impl).organizations.removeMember('org_1', 'usr_1');
    } catch {
      threw = true;
    }
    check('an empty response resolves rather than throwing', !threw);
  }

  console.log(
    failed === 0
      ? `\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`
      : `\n\x1b[1m\x1b[31m${passed} passed, ${failed} failed\x1b[0m`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
