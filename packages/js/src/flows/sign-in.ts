import type { Http } from '../internal/http.js';
import { ZevAuthError } from '../types.js';
import type { ActiveOrganization, SignInResult, ZevAuthUser } from '../types.js';
import { beginPkce } from '../internal/pkce.js';

export interface SessionResponse {
  user: ZevAuthUser;
  session: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    organization?: ActiveOrganization | null;
    /** Present only when the session has something left to do. */
    pendingTasks?: string[];
  };
}

/** What a sign-in route returns instead of a session when a second factor is needed. */
export interface SecondFactorResponse {
  status: 'needs_second_factor';
  challenge: { id: string; factors: string[]; expiresAt: string };
}

export type SignInResponse = SessionResponse | SecondFactorResponse;

/**
 * Every way in.
 *
 * ── Why the passwordless methods are two calls, not one ───────────
 * `startMagicLink` and `startEmailCode` only ASK for something to be
 * sent. They deliberately answer the same way whether or not the address
 * belongs to anybody, because a different response, status or noticeable
 * delay turns either endpoint into a way to test whether a person has an
 * account with the developer's product. So there is nothing useful to
 * return, and the flow completes on a second call — after the person has
 * proved they hold the inbox.
 */
export class SignInFlow {
  constructor(
    private readonly http: Http,
    private readonly adopt: (response: SignInResponse) => SignInResult,
    /** The challenge id of a sign-in waiting for its second factor, if any. */
    private readonly pendingChallengeId: () => string | null,
    /** Keeps a remembered-device token for later sign-ins. */
    private readonly rememberDevice: (token: string) => void = () => {},
  ) {}

  /**
   * Password, against an email OR a username.
   *
   * One field, called `identifier`, because the form has one field. A
   * separate `email` parameter would push the "which is this?" decision
   * into every application, and the server already resolves it.
   */
  async withPassword(params: {
    identifier: string;
    password: string;
  }): Promise<SignInResult> {
    const response = await this.http.post<SignInResponse>('/v1/auth/signin', {
      email: params.identifier,
      password: params.password,
    });
    return this.adopt(response);
  }

  /**
   * Finishes a sign-in that needed a second factor: a 6-digit code from
   * the person's authenticator app, or one of their recovery codes.
   *
   * Uses the challenge from the sign-in that just happened in this
   * client; pass `challengeId` only if you are driving the API yourself.
   */
  async verifySecondFactor(params: {
    code: string;
    challengeId?: string;
    /**
     * Skip the second step on this device next time. Honoured only when
     * the app remembers devices (a console setting); otherwise ignored.
     */
    rememberDevice?: boolean;
  }): Promise<SignInResult> {
    const challengeId = params.challengeId ?? this.pendingChallengeId();
    if (!challengeId) {
      throw new ZevAuthError(
        'There is no sign-in waiting for a second factor. Sign in first.',
        'mfa_challenge_expired',
        401,
      );
    }
    const response = await this.http.post<SignInResponse & { trustedDevice?: { token: string; expiresAt: string } }>(
      '/v1/auth/mfa/verify',
      {
        challengeId,
        code: params.code,
        ...(params.rememberDevice ? { rememberDevice: true } : {}),
      },
    );
    if (response.trustedDevice) this.rememberDevice(response.trustedDevice.token);
    return this.adopt(response);
  }

  /**
   * Emails a link. Answers identically whether or not the address is known.
   *
   * ── Where the link lands ──────────────────────────────────────────
   * By default, our hosted page: it redeems the token and hands the
   * person back to your app. Nothing to build, and it works out of the
   * box.
   *
   * Pass `redirectUrl` to keep them inside your own application
   * instead. The SDK spots the token on load and finishes the sign-in in
   * place, so they never see a zevauth.com screen. The URL has to be one
   * you registered under API keys, matched exactly — an unchecked
   * redirect on a link carrying a sign-in token is how the token ends up
   * at somebody else's server.
   *
   * ```ts
   * await client.signIn.startMagicLink({
   *   email,
   *   redirectUrl: window.location.origin + '/sign-in',
   * });
   * ```
   */
  async startMagicLink(params: {
    email: string;
    redirectUrl?: string;
  }): Promise<void> {
    await this.http.post('/v1/auth/magic-link', {
      email: params.email,
      redirectUrl: params.redirectUrl,
    });
  }

  /**
   * Redeems a sign-in link and starts a session.
   *
   * You usually do not call this. When the link points at your app the
   * SDK finds the token on load and redeems it for you, which is what
   * makes a magic link work with no routing code at all.
   *
   * It is here for the case that needs it: a custom route that reads the
   * token itself, or a native application receiving a deep link, where
   * there is no page load for the SDK to hook.
   */
  async verifyMagicLink(params: { token: string }): Promise<SignInResult> {
    const response = await this.http.post<SignInResponse>(
      '/v1/auth/magic-link/verify',
      { token: params.token },
    );
    return this.adopt(response);
  }

  /** Emails a short code. Same non-committal answer. */
  async startEmailCode(params: { email: string }): Promise<void> {
    await this.http.post('/v1/auth/email-code', { email: params.email });
  }

  /** Completes the code flow. This is where a session actually begins. */
  async verifyEmailCode(params: {
    email: string;
    code: string;
  }): Promise<SignInResult> {
    const response = await this.http.post<SignInResponse>(
      '/v1/auth/email-code/verify',
      { email: params.email, code: params.code },
    );
    return this.adopt(response);
  }

  /**
   * Sends the person to ZevID and returns.
   *
   * A full-page redirect rather than a popup. Popups are blocked unless
   * they descend directly from a click, they are unusable on mobile
   * Safari, and a person who dismisses one is left with no way to tell
   * that anything happened. The redirect comes back to a URL this app
   * registered, carrying a code the SDK exchanges on load.
   */
  withZevId(params?: { redirectUrl?: string; pkce?: false }): void;
  /**
   * With `pkce: true`, the sign-in is bound to this tab: a PKCE challenge
   * and a `state` go to ZevAuth, and the code that comes back can only be
   * exchanged with this tab's verifier. Returns a promise because the
   * challenge is hashed with Web Crypto before the redirect.
   */
  withZevId(params: { redirectUrl?: string; pkce: true }): Promise<void>;
  withZevId(params: { redirectUrl?: string; pkce?: boolean } = {}): void | Promise<void> {
    if (params.pkce) return this.withZevIdPkce(params.redirectUrl);
    /*
     * Built by concatenation, exactly as every fetch in this SDK builds
     * its URL, and NOT with `new URL(path, base)`.
     *
     * `apiUrl` is allowed to be relative — a dev server proxying
     * `/zevauth` to us is the documented way to work around a corporate
     * proxy or to keep requests same-origin. `new URL` requires an
     * ABSOLUTE base and throws `Invalid base URL` on a relative one, so
     * this line took down the ZevID button for anybody using that
     * setup, while every other call in the client kept working.
     *
     * It was wrong for absolute bases too: a leading-slash path
     * discards any path already on the base, so an `apiUrl` of
     * `https://example.com/zevauth` would have lost the `/zevauth`.
     */
    /*
     * The key travels in the URL, and it has to.
     *
     * This is a full page navigation, which is the entire point: the
     * person leaves for the consent screen. A navigation cannot carry an
     * `Authorization` header, so every other call in this SDK sends the
     * key as one and this single method cannot. Without it the endpoint
     * answered 401 and the button landed people on raw JSON.
     *
     * A publishable key already ships inside this bundle, so a URL
     * exposes nothing that reading the JavaScript would not. The API
     * accepts it here and only here, and refuses a secret key outright.
     */
    const query = new URLSearchParams({
      publishable_key: this.http.publishableKey,
    });
    if (params.redirectUrl) query.set('redirect_url', params.redirectUrl);

    globalThis.location.assign(
      `${this.http.baseUrl}/v1/auth/zevid/start?${query}`,
    );
  }

  private async withZevIdPkce(redirectUrl?: string): Promise<void> {
    const { challenge, state } = await beginPkce();
    const query = new URLSearchParams({
      publishable_key: this.http.publishableKey,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    if (redirectUrl) query.set('redirect_url', redirectUrl);
    globalThis.location.assign(`${this.http.baseUrl}/v1/auth/zevid/start?${query}`);
  }
}
