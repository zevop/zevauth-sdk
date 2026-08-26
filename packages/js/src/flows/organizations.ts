import type { Http } from '../internal/http.js';
import type { ActiveOrganization } from '../types.js';

export interface OrganizationMembership extends ActiveOrganization {
  imageUrl: string | null;
  permissions?: string[];
}

export interface OrganizationMember {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  role: string;
  joinedAt: string;
}

/**
 * The organizations a signed-in person belongs to.
 *
 * ── Why these calls carry the session token, not the app key ──────
 * They answer "what does THIS PERSON belong to", so the credential has
 * to be the person's. The publishable key would answer "what does this
 * app know", which for an endpoint returning memberships is the same as
 * answering for everybody — and that key ships in every browser bundle.
 */
export class OrganizationsFlow {
  constructor(
    private readonly http: Http,
    private readonly getToken: () => Promise<string | null>,
    private readonly switchTo: (organizationId: string | null) => Promise<void>,
  ) {}

  /** Everything they belong to. What a switcher renders. */
  async list(): Promise<OrganizationMembership[]> {
    const accessToken = await this.getToken();
    if (!accessToken) return [];

    const response = await this.http.get<{
      organizations: OrganizationMembership[];
    }>('/v1/me/organizations', { accessToken });

    return response.organizations;
  }

  /** Who else is in the organization this session is acting as. */
  async members(): Promise<OrganizationMember[]> {
    const accessToken = await this.getToken();
    if (!accessToken) return [];

    const response = await this.http.get<{ members: OrganizationMember[] }>(
      '/v1/me/organization/members',
      { accessToken },
    );

    return response.members;
  }

  /**
   * Makes one active, rotating the session's tokens.
   *
   * `null` returns to personal scope. The tokens change because the
   * organization is a claim inside them.
   */
  async setActive(organizationId: string | null): Promise<void> {
    await this.switchTo(organizationId);
  }
}
