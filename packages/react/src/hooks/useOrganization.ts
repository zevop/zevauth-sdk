import { useCallback, useEffect, useState } from 'react';
import { useZevAuthContext } from '../internal/context.js';
import type {
  ActiveOrganization,
  OrganizationMember,
  OrganizationMembership,
} from '@zevauth/js';

export interface UseOrganization {
  isLoaded: boolean;
  /** The organization this session is acting as, if any. */
  organization: ActiveOrganization | null;
  members: OrganizationMember[];
  isLoadingMembers: boolean;
}

export function useOrganization(
  options: { withMembers?: boolean } = {},
): UseOrganization {
  const { client, state } = useZevAuthContext('useOrganization');
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  const wantsMembers = options.withMembers ?? false;
  const activeId = state.organization?.id ?? null;

  useEffect(() => {
    /*
     * Members are fetched only when asked for. A switcher needs the
     * organization's name and nothing else, and fetching a member list
     * for every component that reads the active organization would put
     * a request behind a header avatar.
     */
    if (!wantsMembers || !activeId) {
      setMembers([]);
      return;
    }

    let isCurrent = true;
    setIsLoadingMembers(true);

    client.organizations
      .members()
      .then((rows) => {
        if (isCurrent) setMembers(rows);
      })
      .catch(() => {
        // An empty list beats a thrown error inside a header menu.
        if (isCurrent) setMembers([]);
      })
      .finally(() => {
        if (isCurrent) setIsLoadingMembers(false);
      });

    return () => {
      isCurrent = false;
    };
    /*
     * Keyed on the ACTIVE ORGANIZATION, so switching refetches. Keying
     * on the whole state object would refetch on every unrelated change,
     * including the token refresh that happens every fifteen minutes.
     */
  }, [client, wantsMembers, activeId]);

  return {
    isLoaded: state.isLoaded,
    organization: state.organization,
    members,
    isLoadingMembers,
  };
}

export interface UseOrganizationList {
  isLoaded: boolean;
  organizations: OrganizationMembership[];
  setActive: (organizationId: string | null) => Promise<void>;
  refetch: () => void;
}

/** Everything the signed-in person belongs to. What a switcher renders. */
export function useOrganizationList(): UseOrganizationList {
  const { client, state } = useZevAuthContext('useOrganizationList');
  const [organizations, setOrganizations] = useState<OrganizationMembership[]>(
    [],
  );
  const [nonce, setNonce] = useState(0);

  const userId = state.user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      setOrganizations([]);
      return;
    }

    let isCurrent = true;
    client.organizations
      .list()
      .then((rows) => {
        if (isCurrent) setOrganizations(rows);
      })
      .catch(() => {
        if (isCurrent) setOrganizations([]);
      });

    return () => {
      isCurrent = false;
    };
  }, [client, userId, nonce]);

  const setActive = useCallback(
    async (organizationId: string | null) => {
      await client.organizations.setActive(organizationId);
    },
    [client],
  );

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return {
    isLoaded: state.isLoaded,
    organizations,
    setActive,
    refetch,
  };
}
