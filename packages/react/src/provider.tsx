import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createZevAuth,
  type Appearance,
  type ZevAuth,
  type ZevAuthState,
} from '@zevauth/js';
import { ZevAuthContext, mergeAppearance } from './internal/context.js';

export interface ZevAuthProviderProps {
  publishableKey?: string;
  /** An already-constructed client. Useful for tests and for SSR setups. */
  client?: ZevAuth;
  apiUrl?: string;

  /**
   * Branding overridden in code, applied to every ZevAuth component
   * under this provider.
   *
   * Anything you leave out keeps whatever the console is set to, so a
   * team can move one value into their repository without moving all of
   * them. `showPoweredBy` is not overridable: it is resolved from the
   * plan on the server.
   */
  appearance?: Appearance;

  children: ReactNode;
}

/**
 * Puts one ZevAuth client in context and keeps React in step with it.
 *
 * ── Why the client is created once and never recreated ────────────
 * It owns the session, the refresh timer and the cross-tab lock.
 * Rebuilding it on a re-render would drop the listener, restart the
 * load, and — worst — could produce two clients refreshing the same
 * session at once, which the server treats as token reuse and punishes
 * by ending the session. So it is created in a ref on first render and
 * left alone.
 *
 * ── Why state is mirrored rather than read from the client ────────
 * The client is a mutable object; React does not re-render when a field
 * on it changes. The subscription turns its events into state, which is
 * what makes `useUser()` update when somebody signs in.
 */
export function ZevAuthProvider({
  publishableKey,
  client: provided,
  apiUrl,
  appearance,
  children,
}: ZevAuthProviderProps) {
  const clientRef = useRef<ZevAuth | null>(provided ?? null);

  if (!clientRef.current) {
    if (!publishableKey) {
      throw new Error(
        '<ZevAuthProvider> needs a publishableKey, or a client to use instead.',
      );
    }
    clientRef.current = createZevAuth({ publishableKey, apiUrl });
  }

  const client = clientRef.current;

  const [state, setState] = useState<ZevAuthState>({
    isLoaded: client.isLoaded,
    user: client.user,
    organization: client.organization,
  });

  useEffect(() => {
    /*
     * Subscribing BEFORE loading, not after.
     *
     * `load()` emits when it finishes. A listener attached afterwards
     * would miss that emission and leave the tree stuck on
     * `isLoaded: false` for a session that had already been restored —
     * a blank app with no error to explain it.
     */
    const unsubscribe = client.addListener(setState);
    void client.load().catch(() => {
      /*
       * A failed load is not a crash. It usually means the API is
       * unreachable or the key is wrong, and the app should render its
       * signed-out state rather than a blank screen. The client has
       * already reported the failure through its own channels.
       */
    });

    return unsubscribe;
  }, [client]);

  /*
   * Recomputed when the client reports new branding or the prop
   * changes. `state` is in the dependency list because `client.branding`
   * arrives with the environment load, and that load is what moves
   * `isLoaded` — without it the first render's null branding would
   * stick.
   */
  const branding = useMemo(
    () => mergeAppearance(client.branding, appearance),
    [client, state, appearance],
  );

  const value = useMemo(
    () => ({ client, state, branding }),
    [client, state, branding],
  );

  return (
    <ZevAuthContext.Provider value={value}>{children}</ZevAuthContext.Provider>
  );
}
