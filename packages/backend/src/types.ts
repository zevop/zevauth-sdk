export interface ZevAuthUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  username: string | null;
  phone: string | null;
  phoneVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  publicMetadata: Record<string, unknown>;
  status: string;
  lastSignInAt: string | null;
  createdAt: string;
}

export interface ZevAuthOrganization {
  id: string;
  name: string;
  slug: string | null;
  imageUrl: string | null;
  publicMetadata: unknown;
  maxMembers: number | null;
  createdAt: string;
}

export interface OrganizationMember {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  joinedAt: string;
}

/**
 * One page of a keyset-paginated list.
 *
 * `next` is opaque — pass it back as `after` to continue. Cursor paging
 * rather than page numbers, so a list stays correct while people are
 * signing up in the middle of it, which offset paging does not.
 */
export interface Page<T> {
  data: T[];
  hasMore: boolean;
  next: string | null;
  totalCount: number;
}
