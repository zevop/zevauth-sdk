import type { Http } from '../internal/http.js';
import type { SessionResponse } from './sign-in.js';

export class SignUpFlow {
  constructor(
    private readonly http: Http,
    private readonly adopt: (response: SessionResponse) => unknown,
  ) {}

  /**
   * Creates an account.
   *
   * ── Why this can return without a session ─────────────────────────
   * Whether a new account is signed in immediately or has to confirm its
   * address first is the developer's setting, not the SDK's decision. So
   * the response is adopted when it carries a session and simply is not
   * when it does not, and the caller reads `user` to find out which
   * happened. Forcing a session here would override a deliberate
   * configuration.
   */
  async create(params: {
    email?: string;
    username?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    /**
     * Where the confirmation link should land, instead of our hosted
     * page. Must be a redirect URL registered under API keys, matched
     * exactly. The SDK confirms the address on load when it arrives.
     */
    redirectUrl?: string;
  }): Promise<{ requiresEmailVerification: boolean }> {
    const response = await this.http.post<
      SessionResponse & { requiresEmailVerification?: boolean }
    >('/v1/auth/signup', params);

    if (response.session?.accessToken) {
      this.adopt(response);
    }

    return {
      requiresEmailVerification: Boolean(response.requiresEmailVerification),
    };
  }

  /**
   * Confirms an address with the short code we emailed.
   *
   * The API has accepted a code since it shipped; nothing in this SDK
   * called it, so an environment configured to send codes had no way to
   * redeem one and `<SignUp>` told people to open a link that was never
   * sent.
   *
   * Returns the session when the environment issues one on
   * confirmation, and null when it does not, so a caller can tell
   * "you are in" from "now sign in".
   */
  async verifyCode(params: { email: string; code: string }) {
    return this.http.post<{ session: unknown | null }>('/v1/auth/verify-email', {
      email: params.email,
      code: params.code,
    });
  }

  /** Re-sends the confirmation email. */
  async resendVerification(params: {
    email: string;
    /** Keep the link inside your app. Must be a registered redirect URL. */
    redirectUrl?: string;
  }): Promise<void> {
    await this.http.post('/v1/auth/verify-email/resend', {
      email: params.email,
      redirectUrl: params.redirectUrl,
    });
  }
}
