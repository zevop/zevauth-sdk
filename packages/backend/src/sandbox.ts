import type { Http } from './http.js';

/** One message a test environment captured instead of sending. */
export interface CapturedEmail {
  id: string;
  to: string;
  from: string;
  subject: string;
  /** e.g. `email_verification`, `password_reset`, `magic_link`. */
  kind: string;
  /** The OTP or verification code, when the message carried one. */
  code: string | null;
  /** The link the message asked the user to follow. */
  actionUrl: string | null;
  html: string | null;
  text: string | null;
  createdAt: string;
}

export interface MintedSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface EnvironmentInfo {
  id: string;
  kind: 'test' | 'live';
  /** The key your frontend ships with. Safe to write into a `.env`. */
  publishableKey: string | null;
  signInMethods: string[];
  limits: {
    maxEndUsers: number | null;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
    sessionMaxLifetimeSeconds: number;
    requestsPerMinute: number;
    emailDelivery: 'captured' | 'delivered';
  };
}

/**
 * What a test environment can do that a live one cannot.
 *
 * Every method here is refused with a live key, by the API rather than by
 * this client, so a suite pointed at production by accident fails instead
 * of deleting somebody's users.
 */
export class Sandbox {
  constructor(private readonly http: Http) {}

  /**
   * A signed-in session for a user, without their password.
   *
   * ```ts
   * const user = await zevauth.users.create({ email: 'ada@example.com' });
   * const { accessToken } = await zevauth.sandbox.mintToken(user.id);
   * ```
   *
   * Returns what signin returns, and the session is real: it is listed,
   * revocable, and expires normally. It records `provider: 'sandbox'` so
   * a sign-in log can tell a test harness from a person.
   */
  mintToken(userId: string) {
    return this.http.post<MintedSession>(
      `/v1/sandbox/users/${encodeURIComponent(userId)}/tokens`,
      {},
    );
  }

  /**
   * The messages this environment captured instead of sending.
   *
   * ```ts
   * const { data } = await zevauth.sandbox.emails({ to: 'ada@example.com' });
   * await zevauth.auth.verifyEmail({ code: data[0].code });
   * ```
   *
   * Read `code` and `actionUrl` rather than parsing `html`: they are
   * extracted server side, so an assertion against them survives a
   * redesign of the template.
   */
  emails(params: { to?: string; kind?: string; limit?: number } = {}) {
    return this.http.get<{ data: CapturedEmail[] }>('/v1/sandbox/emails', {
      to: params.to,
      kind: params.kind,
      limit: params.limit,
    });
  }

  /** Deletes every end user in this test environment. For CI, between runs. */
  resetUsers() {
    return this.http.delete<{ deleted: number }>('/v1/sandbox/users');
  }
}
