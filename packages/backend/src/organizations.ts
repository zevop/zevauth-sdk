import type { Http } from './http.js';
import type { OrganizationMember, ZevAuthOrganization } from './types.js';

/** Organizations, from your own backend. */
export class Organizations {
  constructor(private readonly http: Http) {}

  /** The organizations one user belongs to. */
  listForUser(userId: string) {
    return this.http.get<{
      data: Array<{
        organization: ZevAuthOrganization;
        role: string;
        permissions: string[];
      }>;
    }>('/v1/organizations', { userId });
  }

  get(organizationId: string) {
    return this.http.get<{
      organization: ZevAuthOrganization;
      members: OrganizationMember[];
    }>(`/v1/organizations/${encodeURIComponent(organizationId)}`);
  }

  /** Creates one. Whoever created it becomes its owner. */
  create(params: {
    name: string;
    slug?: string;
    /** The user id of the person who becomes owner. Required. */
    createdBy: string;
    maxMembers?: number;
  }) {
    return this.http.post<{
      organization: ZevAuthOrganization;
      role: string;
    }>('/v1/organizations', params);
  }

  update(
    organizationId: string,
    params: { name?: string; slug?: string | null; imageUrl?: string | null },
  ) {
    return this.http.patch<{ organization: ZevAuthOrganization }>(
      `/v1/organizations/${encodeURIComponent(organizationId)}`,
      params,
    );
  }

  /**
   * Deletes an organization. Memberships go; the people do not.
   *
   * Sessions currently acting as it keep a token naming something that
   * no longer exists until it expires. Every mutation re-reads the live
   * membership, so those tokens can read nothing and change nothing.
   */
  delete(organizationId: string) {
    return this.http.delete<{ deleted: true }>(
      `/v1/organizations/${encodeURIComponent(organizationId)}`,
    );
  }

  addMember(
    organizationId: string,
    params: { userId: string; role?: string },
  ) {
    return this.http.post<{ role: string }>(
      `/v1/organizations/${encodeURIComponent(organizationId)}/members`,
      params,
    );
  }

  removeMember(organizationId: string, userId: string) {
    return this.http.delete<void>(
      `/v1/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
    );
  }
}
