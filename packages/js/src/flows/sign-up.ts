import type { Http } from '../internal/http';
import type { SessionResponse } from './sign-in';

export class SignUpFlow {
  constructor(
    private readonly http: Http,
    private readonly adopt: (response: SessionResponse) => void,
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

  /** Re-sends the confirmation email. */
  async resendVerification(params: { email: string }): Promise<void> {
    await this.http.post('/v1/auth/verify-email/resend', {
      email: params.email,
    });
  }
}
