import { useCallback } from 'react';
import { useZevAuthContext } from '../internal/context.js';

export interface UseAuth {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  organizationId: string | null;
  /** A valid access token for calling your own API. Refreshes if needed. */
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

/**
 * The credential-shaped view: ids and a token, no profile.
 *
 * Separate from `useUser` so a component that only needs to attach a
 * token to a fetch does not re-render every time a display name or an
 * avatar changes.
 */
export function useAuth(): UseAuth {
  const { client, state } = useZevAuthContext('useAuth');

  /*
   * A stable identity across renders, so it can sit in a `useEffect`
   * dependency array without re-running the effect on every render —
   * which, for an effect that fetches, is an infinite loop.
   */
  const getToken = useCallback(() => client.getToken(), [client]);
  const signOut = useCallback(() => client.signOut(), [client]);

  return {
    isLoaded: state.isLoaded,
    isSignedIn: state.isLoaded && state.user !== null,
    userId: state.user?.id ?? null,
    organizationId: state.organization?.id ?? null,
    getToken,
    signOut,
  };
}
