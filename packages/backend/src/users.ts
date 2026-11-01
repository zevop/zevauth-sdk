import type { Http } from './http.js';
import type { Page, ZevAuthUser } from './types.js';

export interface CreateUserParams {
  email: string;
  /**
   * Optional. An account with no password still signs in by magic link
   * or a social provider, which is what an import from an older system
   * usually wants: create the accounts, let people set a password when
   * they first arrive.
   */
  password?: string;
  firstName?: string;
  lastName?: string;
  /**
   * Trust the address without sending anything.
   *
   * The migration case: the system you are replacing already confirmed
   * it. Only a backend can say this, which is the whole reason this
   * client needs a secret key.
   */
  emailVerified?: boolean;
  publicMetadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
}

export interface UpdateUserParams {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  imageUrl?: string | null;
  publicMetadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
  /** `null` removes it, leaving an account that signs in by link or provider. */
  password?: string | null;
  emailVerified?: boolean;
}

/** The people in one environment. */
export class Users {
  constructor(private readonly http: Http) {}

  /**
   * One page of users.
   *
   * ```ts
   * let cursor: string | null = null;
   * do {
   *   const page = await zevauth.users.list({ after: cursor ?? undefined });
   *   for (const user of page.data) { ... }
   *   cursor = page.next;
   * } while (cursor);
   * ```
   *
   * `metadata` filters on top-level `publicMetadata` fields, which is how
   * you fetch one kind of user:
   *
   * ```ts
   * const sellers = await zevauth.users.list({ metadata: { type: 'seller' } });
   * ```
   *
   * Several keys are combined with AND. Values go over the wire as text,
   * so a stored `true` and a stored `"true"` both match `'true'`.
   */
  list(
    params: {
      limit?: number;
      after?: string;
      query?: string;
      metadata?: Record<string, string | number | boolean>;
    } = {},
  ) {
    return this.http.get<Page<ZevAuthUser>>('/v1/users', {
      limit: params.limit,
      after: params.after,
      query: params.query,
      // Flattened to `metadata[key]` here rather than left to the query
      // serialiser: the API reads the bracketed form, and every HTTP
      // client spells nested objects differently.
      ...Object.fromEntries(
        Object.entries(params.metadata ?? {}).map(([key, value]) => [
          `metadata[${key}]`,
          String(value),
        ]),
      ),
    });
  }

  get(userId: string) {
    return this.http.get<ZevAuthUser>(`/v1/users/${encodeURIComponent(userId)}`);
  }

  /** Creates a user without a sign-up flow. No email is sent. */
  create(params: CreateUserParams) {
    return this.http.post<ZevAuthUser>('/v1/users', params);
  }

  update(userId: string, params: UpdateUserParams) {
    return this.http.patch<ZevAuthUser>(
      `/v1/users/${encodeURIComponent(userId)}`,
      params,
    );
  }

  /**
   * Blocks or unblocks someone. Blocking revokes every session they hold.
   *
   * That revocation is the point. An access token lives for minutes and
   * a refresh token for weeks, so an account "blocked" without it stays
   * signed in on every device it was already signed in on — which is
   * every device that matters, if the reason for blocking is that
   * somebody else has one.
   */
  setBlocked(userId: string, blocked: boolean) {
    return this.http.post<{ user: ZevAuthUser; sessionsRevoked: number }>(
      `/v1/users/${encodeURIComponent(userId)}/blocked`,
      { blocked },
    );
  }

  /** Signs somebody out everywhere, without changing their account. */
  revokeSessions(userId: string) {
    return this.http.post<{ sessionsRevoked: number }>(
      `/v1/users/${encodeURIComponent(userId)}/sessions/revoke`,
    );
  }

  /**
   * Turns off two-step verification for somebody who lost their device,
   * after you have confirmed who they are. `revokeSessions` also signs
   * them out everywhere; it defaults to false, as the API does.
   */
  resetMfa(userId: string, options: { revokeSessions?: boolean } = {}) {
    const query = options.revokeSessions ? '?revokeSessions=true' : '';
    return this.http.delete<unknown>(`/v1/users/${encodeURIComponent(userId)}/mfa${query}`);
  }

  /**
   * Every user matching `params`, a page at a time, following `next`
   * until there are no more. For a nightly job:
   *
   *   for await (const user of zevauth.users.iterate()) { … }
   */
  async *iterate(params: Omit<Parameters<Users['list']>[0] & object, 'after'> = {}): AsyncGenerator<ZevAuthUser> {
    let after: string | undefined;
    do {
      const page = await this.list({ ...params, after });
      yield* page.data;
      after = page.hasMore && page.next ? page.next : undefined;
    } while (after);
  }

  /**
   * Deletes a user and everything attached to them.
   *
   * A real delete, not a flag: somebody exercising a right to erasure is
   * not served by a row that still holds their address. Sessions,
   * identities and organization memberships go with it.
   */
  delete(userId: string) {
    return this.http.delete<{ deleted: true }>(
      `/v1/users/${encodeURIComponent(userId)}`,
    );
  }
}
