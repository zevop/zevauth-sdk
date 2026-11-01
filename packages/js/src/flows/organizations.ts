import type { Http } from '../internal/http.js';
import { ZevAuthError, type ActiveOrganization } from '../types.js';
import { uploadImage, type UploadImageOptions } from '../internal/upload.js';

export interface OrganizationMembership extends ActiveOrganization {
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

  /**
   * Renames the active organization, or changes its image.
   *
   * Needs the `org:manage` permission, checked against the caller's LIVE
   * membership rather than the token's claims. A demotion takes effect
   * immediately, not at the next token refresh.
   *
   * Pass `imageUrl: null` to remove the image. Leaving the field out
   * leaves the image alone, which is a different thing.
   */
  async update(patch: {
    name?: string;
    imageUrl?: string | null;
  }): Promise<Pick<ActiveOrganization, 'id' | 'name' | 'slug' | 'imageUrl'>> {
    const accessToken = await this.getToken();
    if (!accessToken) {
      throw new ZevAuthError('Nobody is signed in.', 'not_authenticated', 401);
    }

    const response = await this.http.patch<{
      organization: Pick<ActiveOrganization, 'id' | 'name' | 'slug' | 'imageUrl'>;
    }>('/v1/me/organization', patch, { accessToken });

    return response.organization;
  }

  /**
   * Uploads an organization image and returns the URL.
   *
   * It does NOT save it — pass the result to `update({ imageUrl })`.
   * Two steps so the picture can be shown and confirmed before it
   * becomes the one everybody in the organization sees.
   */
  async uploadImage(options: UploadImageOptions): Promise<string> {
    const accessToken = await this.getToken();
    if (!accessToken) {
      throw new ZevAuthError('Nobody is signed in.', 'not_authenticated', 401);
    }

    return uploadImage({
      http: this.http,
      accessToken,
      purpose: 'organization_image',
      options,
    });
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
   * Creates an organization, makes the caller its owner, and switches
   * the session to it.
   *
   * Switching is part of creating because the next thing anybody does
   * with a new organization is act in it: invite someone, rename it,
   * upload a logo. Every one of those runs on the ACTIVE organization,
   * and a session left in its old scope would send the first invite to
   * the wrong company.
   *
   * Refusals carry a `code`: `organizations_disabled`,
   * `organization_creation_disabled`, `organization_limit_reached`,
   * `organization_slugs_disabled`, `organization_slug_taken`.
   */
  async create(params: {
    name: string;
    slug?: string;
  }): Promise<OrganizationMembership> {
    const accessToken = await this.getToken();
    if (!accessToken) {
      throw new ZevAuthError('Nobody is signed in.', 'not_authenticated', 401);
    }

    const response = await this.http.post<{ organization: OrganizationMembership }>(
      '/v1/me/organizations',
      params,
      { accessToken },
    );

    await this.switchTo(response.organization.id);
    return response.organization;
  }

  /**
   * Leaves the active organization, then returns to personal scope.
   *
   * The last owner cannot leave (`organization_last_owner`): an
   * organization with nobody to administer it can only be cleaned up by
   * a support ticket. Transfer ownership, or delete it, first.
   */
  async leave(): Promise<void> {
    const accessToken = await this.getToken();
    if (!accessToken) {
      throw new ZevAuthError('Nobody is signed in.', 'not_authenticated', 401);
    }

    await this.http.post('/v1/me/organization/leave', undefined, { accessToken });

    /*
     * The tokens still name the organization just left. Switching now,
     * rather than waiting for the next refresh, is what stops every
     * component on the page rendering a membership that no longer
     * exists for up to fifteen minutes.
     */
    await this.switchTo(null);
  }

  /**
   * Deletes the active organization and every membership in it, then
   * returns to personal scope. The members' accounts are untouched.
   *
   * Needs `org:delete` (owners, by default) and the console's
   * "Creator can delete" left on. Refusals: `organization_delete_disabled`,
   * `organization_permission_required`.
   */
  async delete(): Promise<void> {
    const accessToken = await this.getToken();
    if (!accessToken) {
      throw new ZevAuthError('Nobody is signed in.', 'not_authenticated', 401);
    }

    await this.http.delete('/v1/me/organization', { accessToken });
    await this.switchTo(null);
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
