import type { Http } from '../internal/http.js';
import { ZevAuthError, type ActiveOrganization, type ZevAuthUser } from '../types.js';
import type { OrganizationMembership } from './organizations.js';
import { uploadImage, type UploadImageOptions } from '../internal/upload.js';

/**
 * The signed-in person, as the server sees them right now.
 *
 * ── Why this exists when the token already carries a profile ──────
 * The token's claims are a snapshot from the moment it was minted. A
 * name changed, an avatar uploaded, or an organization joined since
 * then is invisible until the next refresh, which can be fifteen
 * minutes away. Anything that must be current is read here.
 */
export class UserFlow {
  constructor(
    private readonly http: Http,
    private readonly getToken: () => Promise<string | null>,
    /**
     * Told when the profile changes, so subscribers re-render.
     *
     * Without it, a name edited through `update()` would be correct on
     * the server and stale in every component until the next token
     * refresh — up to fifteen minutes of the old name on screen.
     */
    private readonly onUserChanged: (user: ZevAuthUser) => void,
  ) {}

  async fetch(): Promise<{
    user: ZevAuthUser | null;
    organizations: OrganizationMembership[];
    organization: ActiveOrganization | null;
  }> {
    const accessToken = await this.getToken();
    if (!accessToken) {
      return { user: null, organizations: [], organization: null };
    }

    return this.http.get('/v1/me', { accessToken });
  }

  /**
   * Updates the signed-in person's own profile.
   *
   * Deliberately narrow. `publicMetadata` is not here because it travels
   * inside the access token and the developer's backend trusts it for
   * authorization; a user who could write it could grant themselves a
   * role. `email` is not here because changing an address is a flow that
   * needs proof, not a field edit. The server refuses both regardless.
   */
  async update(patch: {
    firstName?: string;
    lastName?: string;
    username?: string;
    /**
     * https only: it is rendered into pages we serve and email we send.
     *
     * `null` removes the picture. Leaving the field out leaves it alone,
     * which is a different thing — most patches touch a name and should
     * not clear an avatar as a side effect.
     */
    imageUrl?: string | null;
  }): Promise<ZevAuthUser | null> {
    const accessToken = await this.getToken();
    if (!accessToken) return null;

    const response = await this.http.patch<{ user: ZevAuthUser }>(
      '/v1/me',
      patch,
      { accessToken },
    );

    this.onUserChanged(response.user);
    return response.user;
  }

  /**
   * Uploads a profile picture and returns the URL.
   *
   * It does NOT save it. Call `update({ imageUrl })` with what this
   * returns, which is what lets a picture be previewed and confirmed
   * before it becomes the one on the account.
   *
   * The bytes go straight to object storage rather than through the
   * ZevAuth API, and the object is keyed by its content hash, so
   * uploading the same picture twice costs one upload. Uploads have to
   * be enabled on the environment; when they are not, the call comes
   * back saying so and an `imageUrl` pointing at your own host still
   * works, exactly as it did before.
   */
  async uploadAvatar(options: UploadImageOptions): Promise<string> {
    const accessToken = await this.getToken();
    if (!accessToken) {
      throw new ZevAuthError('Nobody is signed in.', 'not_authenticated', 401);
    }

    return uploadImage({
      http: this.http,
      accessToken,
      purpose: 'user_avatar',
      options,
    });
  }

  /**
   * Asks to move the account to a new address.
   *
   * ── Nothing changes when this resolves ────────────────────────────
   * A link goes to the NEW address and the account keeps its current
   * one until that link is opened. So a success here means "we have
   * asked", not "it is done", and the UI should say so.
   *
   * The current password is required when the account has one. A
   * session proves somebody signed in once, not that the person at the
   * keyboard is still them, and moving an address is the most valuable
   * thing a borrowed session can do: every recovery path follows it.
   */
  async requestEmailChange(params: {
    newEmail: string;
    currentPassword?: string;
  }): Promise<{ pendingEmail: string }> {
    const accessToken = await this.getToken();
    if (!accessToken) {
      throw new ZevAuthError('Nobody is signed in.', 'not_authenticated', 401);
    }

    return this.http.post('/v1/me/email', params, { accessToken });
  }

  /** Abandons a pending change. The current address is unaffected. */
  async cancelEmailChange(): Promise<void> {
    const accessToken = await this.getToken();
    if (!accessToken) return;

    await this.http.post('/v1/me/email/cancel', undefined, { accessToken });
  }

  /**
   * Changes the password and signs every other device out.
   *
   * The current password is required even though the session already
   * proves who signed in: a session is proof that somebody signed in,
   * not that the person at the keyboard right now is the same one.
   */
  async changePassword(params: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ otherSessionsRevoked: number }> {
    const accessToken = await this.getToken();
    if (!accessToken) {
      throw new ZevAuthError('Nobody is signed in.', 'not_authenticated', 401);
    }

    return this.http.post('/v1/me/password', params, { accessToken });
  }
}
