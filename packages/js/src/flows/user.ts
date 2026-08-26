import type { Http } from '../internal/http';
import type { ActiveOrganization, ZevAuthUser } from '../types';
import type { OrganizationMembership } from './organizations';

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
}
