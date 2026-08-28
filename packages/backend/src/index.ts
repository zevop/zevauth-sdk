import { Http } from './http.js';
import { Sandbox } from './sandbox.js';
import { Users } from './users.js';
import { Organizations } from './organizations.js';
import { ZevAuthError } from './errors.js';

export { ZevAuthError } from './errors.js';
export { Users, type CreateUserParams, type UpdateUserParams } from './users.js';
export { Organizations } from './organizations.js';
export {
  Sandbox,
  type CapturedEmail,
  type MintedSession,
  type EnvironmentInfo,
} from './sandbox.js';
export type {
  OrganizationMember,
  Page,
  ZevAuthOrganization,
  ZevAuthUser,
} from './types.js';

export interface ZevAuthBackendOptions {
  /**
   * Your SECRET key — `sk_test_…` or `sk_live_…`.
   *
   * Read it from the environment. A secret key in source is a secret
   * key in your git history, and this one can read and delete every user
   * in the environment it belongs to.
   */
  secretKey: string;
  /** Defaults to `https://api.zevauth.net`. Override in development. */
  apiUrl?: string;
  /** One attempt gives up after this long. Defaults to 15 seconds. */
  timeoutMs?: number;
  /** Retries for requests that could not be answered. Defaults to 2. */
  maxRetries?: number;
  /** Swapped in tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * ZevAuth from your server.
 *
 * ── Why this is a separate package from `@zevauth/js` ─────────────
 * Because of what it holds. `@zevauth/js` carries a PUBLISHABLE key and
 * is designed to ship inside a browser bundle. This carries a SECRET
 * key, which can read every user's address, set anybody's password, and
 * delete an entire organization.
 *
 * Those two things must not live in one package. A shared package makes
 * `import { ... } from '@zevauth/js'` ambiguous about which half you got,
 * and the failure mode is not a broken build — it is a secret key
 * successfully bundled into an application and served to the public. A
 * separate package makes `@zevauth/backend` appearing in a client bundle
 * obviously wrong to anyone who looks.
 *
 * ```ts
 * import { createZevAuthBackend } from '@zevauth/backend';
 *
 * const zevauth = createZevAuthBackend({
 *   secretKey: process.env.ZEVAUTH_SECRET_KEY!,
 * });
 *
 * const user = await zevauth.users.create({ email: 'ada@example.com' });
 * ```
 */
export class ZevAuthBackend {
  readonly users: Users;
  readonly organizations: Organizations;
  /** Test-environment helpers. Every call is refused with a live key. */
  readonly sandbox: Sandbox;

  constructor(options: ZevAuthBackendOptions) {
    if (!options.secretKey) {
      throw new ZevAuthError(
        'A secret key is required.',
        'missing_secret_key',
        0,
      );
    }

    /*
     * Refused loudly rather than "handled".
     *
     * A publishable key here would fail on the first request with a 401
     * that names neither the mistake nor the fix, and the mistake is an
     * easy one — the two keys sit side by side in the console. Worse is
     * the reverse of it: somebody who reaches for this package in a
     * browser and pastes their secret key to make it work. Saying so at
     * construction is the one moment we can.
     */
    if (options.secretKey.startsWith('pk_')) {
      throw new ZevAuthError(
        'That is a publishable key. This client needs a secret key (sk_…), and it must never run in a browser.',
        'wrong_key_type',
        0,
      );
    }

    const http = new Http({
      apiUrl: (options.apiUrl ?? 'https://api.zevauth.net').replace(/\/+$/, ''),
      secretKey: options.secretKey,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs ?? 15_000,
      maxRetries: options.maxRetries ?? 2,
    });

    this.users = new Users(http);
    this.organizations = new Organizations(http);
    this.sandbox = new Sandbox(http);
  }
}

/**
 * The usual way in.
 *
 * A function rather than asking people to `new` a class, matching
 * `createZevAuth` in the browser package — and it keeps the door open to
 * returning a shared instance per key later.
 */
export function createZevAuthBackend(
  options: ZevAuthBackendOptions,
): ZevAuthBackend {
  return new ZevAuthBackend(options);
}
