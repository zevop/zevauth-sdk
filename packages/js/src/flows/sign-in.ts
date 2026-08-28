import type { Http } from '../internal/http.js';
import type { ActiveOrganization, ZevAuthUser } from '../types.js';

export interface SessionResponse {
  user: ZevAuthUser;
  session: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    organization?: ActiveOrganization | null;
  };
}

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
    private readonly adopt: (response: SessionResponse) => void,
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
  }): Promise<void> {
    const response = await this.http.post<SessionResponse>('/v1/auth/signin', {
      email: params.identifier,
      password: params.password,
    });
    this.adopt(response);
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
  async verifyMagicLink(params: { token: string }): Promise<void> {
    const response = await this.http.post<SessionResponse>(
      '/v1/auth/magic-link/verify',
      { token: params.token },
    );
    this.adopt(response);
  }

  /** Emails a short code. Same non-committal answer. */
  async startEmailCode(params: { email: string }): Promise<void> {
    await this.http.post('/v1/auth/email-code', { email: params.email });
  }

  /** Completes the code flow. This is where a session actually begins. */
  async verifyEmailCode(params: {
    email: string;
    code: string;
  }): Promise<void> {
    const response = await this.http.post<SessionResponse>(
      '/v1/auth/email-code/verify',
      { email: params.email, code: params.code },
    );
    this.adopt(response);
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
  withZevId(params: { redirectUrl?: string } = {}): void {
    const url = new URL('/v1/auth/zevid/start', this.http.baseUrl);
    if (params.redirectUrl) {
      url.searchParams.set('redirect_url', params.redirectUrl);
    }
    globalThis.location.assign(url.toString());
  }
}
