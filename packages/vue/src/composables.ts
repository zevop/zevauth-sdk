import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue';
import type {
  ActiveOrganization,
  OrganizationMember,
  OrganizationMembership,
  ZevAuth,
  ZevAuthUser,
} from '@zevauth/ui';
import { useZevAuthContext } from './plugin.js';

/*
 * The same shapes as the React hooks, with refs where React has values.
 * A team with both a React and a Vue app reads one set of docs.
 */

/** The client itself, for anything the composables do not cover. */
export function useZevAuthClient(): ZevAuth {
  return useZevAuthContext('useZevAuthClient').client;
}

export interface UseUser {
  /** False until the session has been restored. */
  isLoaded: ComputedRef<boolean>;
  /** True only once loading has finished AND somebody is signed in. */
  isSignedIn: ComputedRef<boolean>;
  user: ComputedRef<ZevAuthUser | null>;
}

/**
 * Who is signed in.
 *
 * Three states, not two: on the first render nobody knows yet, and
 * folding that into "signed out" makes every reload flash the
 * signed-out page. Check `isLoaded` before trusting `isSignedIn`.
 */
export function useUser(): UseUser {
  const { state } = useZevAuthContext('useUser');
  return {
    isLoaded: computed(() => state.value.isLoaded),
    isSignedIn: computed(() => state.value.isLoaded && state.value.user !== null),
    user: computed(() => state.value.user),
  };
}

export interface UseAuth {
  isLoaded: ComputedRef<boolean>;
  isSignedIn: ComputedRef<boolean>;
  userId: ComputedRef<string | null>;
  organizationId: ComputedRef<string | null>;
  /** A valid access token for calling your own API. Refreshes if needed. */
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

/** Ids and a token, for attaching credentials to your own requests. */
export function useAuth(): UseAuth {
  const { client, state } = useZevAuthContext('useAuth');
  return {
    isLoaded: computed(() => state.value.isLoaded),
    isSignedIn: computed(() => state.value.isLoaded && state.value.user !== null),
    userId: computed(() => state.value.user?.id ?? null),
    organizationId: computed(() => state.value.organization?.id ?? null),
    getToken: () => client.getToken(),
    signOut: () => client.signOut(),
  };
}

export interface UseOrganization {
  isLoaded: ComputedRef<boolean>;
  organization: ComputedRef<ActiveOrganization | null>;
  members: Ref<OrganizationMember[]>;
  isLoadingMembers: Ref<boolean>;
}

/** The organization this session is acting as, and optionally its members. */
export function useOrganization(options: { withMembers?: boolean } = {}): UseOrganization {
  const { client, state } = useZevAuthContext('useOrganization');
  const members = ref<OrganizationMember[]>([]);
  const isLoadingMembers = ref(false);
  const activeId = computed(() => state.value.organization?.id ?? null);

  if (options.withMembers) {
    let request = 0;
    watch(
      activeId,
      (id) => {
        const current = ++request;
        if (!id) {
          members.value = [];
          return;
        }
        isLoadingMembers.value = true;
        client.organizations
          .members()
          .then((rows) => {
            if (current === request) members.value = rows;
          })
          .catch(() => {
            // An empty list beats a thrown error inside a header menu.
            if (current === request) members.value = [];
          })
          .finally(() => {
            if (current === request) isLoadingMembers.value = false;
          });
      },
      { immediate: true },
    );
    // A late answer for a component that has gone must not write anywhere.
    onScopeDispose(() => {
      request++;
    });
  }

  return {
    isLoaded: computed(() => state.value.isLoaded),
    organization: computed(() => state.value.organization),
    members,
    isLoadingMembers,
  };
}

export interface UseOrganizationList {
  isLoaded: ComputedRef<boolean>;
  organizations: Ref<OrganizationMembership[]>;
  setActive: (organizationId: string | null) => Promise<void>;
  refetch: () => void;
}

/** Every organization the signed-in person belongs to, and a way to switch. */
export function useOrganizationList(): UseOrganizationList {
  const { client, state } = useZevAuthContext('useOrganizationList');
  const organizations = ref<OrganizationMembership[]>([]);
  const nonce = ref(0);
  const userId = computed(() => state.value.user?.id ?? null);

  let request = 0;
  watch(
    [userId, nonce],
    ([id]) => {
      const current = ++request;
      if (!id) {
        organizations.value = [];
        return;
      }
      client.organizations
        .list()
        .then((rows) => {
          if (current === request) organizations.value = rows;
        })
        .catch(() => {
          if (current === request) organizations.value = [];
        });
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    request++;
  });

  return {
    isLoaded: computed(() => state.value.isLoaded),
    organizations,
    setActive: async (organizationId) => {
      await client.organizations.setActive(organizationId);
    },
    refetch: () => {
      nonce.value++;
    },
  };
}
