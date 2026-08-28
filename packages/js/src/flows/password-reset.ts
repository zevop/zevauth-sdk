import type { Http } from '../internal/http.js';

/**
 * Forgotten passwords.
 *
 * Both steps live here rather than on the sign-in flow because a reset
 * is not a sign-in: it finishes on a hosted page or in the developer's
 * own screen, and it never returns a session. Somebody who resets their
 * password still has to sign in with it, which is the correct behaviour
 * and the one people expect.
 */
export class PasswordResetFlow {
  constructor(private readonly http: Http) {}

  /** Emails a reset link. Answers identically for unknown addresses. */
  async start(params: {
    email: string;
    /**
     * Where the reset link should land, instead of our hosted page. Must
     * be a redirect URL registered under API keys, matched exactly.
     *
     * Unlike a magic link, the SDK does NOT finish this one for you: a
     * reset needs a new password, which means your form. The token
     * arrives as `zv_token` in the query string and is left there for
     * you to read and pass to `complete()`.
     */
    redirectUrl?: string;
  }): Promise<void> {
    await this.http.post('/v1/auth/password-reset', {
      email: params.email,
      redirectUrl: params.redirectUrl,
    });
  }

  /**
   * Sets the new password from a reset token.
   *
   * Only needed by an app handling the reset on its OWN screens. Apps
   * using the hosted page never call this: the page does it, on
   * `accounts.zevauth.com`, and the person comes back to sign in.
   */
  async complete(params: { token: string; password: string }): Promise<void> {
    await this.http.post('/v1/auth/password-reset/verify', params);
  }
}
