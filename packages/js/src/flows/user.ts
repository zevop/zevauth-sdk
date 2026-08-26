import type { Http } from '../internal/http.js';
import { ZevAuthError, type ActiveOrganization, type ZevAuthUser } from '../types.js';
import type { OrganizationMembership } from './organizations.js';

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
    /** https only. It is rendered into pages we serve and email we send. */
    imageUrl?: string;
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
