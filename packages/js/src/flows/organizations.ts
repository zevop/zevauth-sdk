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
   * Adds somebody to the active organization, by the address they signed
   * up with.
   *
   * Requires `org:members:manage`, checked server-side against the live
   * membership rather than the token's claims — an admin demoted a
   * minute ago still carries the old ones.
   */
  async addMember(params: { email: string; role?: string }): Promise<void> {
    const accessToken = await this.getToken();
    if (!accessToken) return;

    await this.http.post('/v1/me/organization/members', params, {
      accessToken,
    });
  }

  async setMemberRole(params: {
    userId: string;
    role: string;
  }): Promise<void> {
    const accessToken = await this.getToken();
    if (!accessToken) return;

    await this.http.patch(
      `/v1/me/organization/members/${encodeURIComponent(params.userId)}`,
      { role: params.role },
      { accessToken },
    );
  }

  /**
   * Removes somebody. Anybody may remove themselves; removing anyone
   * else needs the permission. The last owner cannot be removed either
   * way, or the organization would be left with nobody to administer it.
   */
  async removeMember(params: { userId: string }): Promise<void> {
    const accessToken = await this.getToken();
    if (!accessToken) return;

    await this.http.delete(
      `/v1/me/organization/members/${encodeURIComponent(params.userId)}`,
      { accessToken },
    );
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
