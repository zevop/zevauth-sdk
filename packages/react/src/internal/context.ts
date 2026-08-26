import { createContext, useContext } from 'react';
import type { ZevAuth, ZevAuthState } from '@zevauth/js';

export interface ZevAuthContextValue {
  client: ZevAuth;
  state: ZevAuthState;
}

export const ZevAuthContext = createContext<ZevAuthContextValue | null>(null);

/**
 * The client, or a message that says what to do about it.
 *
 * A missing provider is the single most common integration mistake, and
 * the default React error for it — reading a property of null, somewhere
 * deep in a hook — names nothing a developer can act on. This names the
 * component to add and where.
 */
export function useZevAuthContext(hookName: string): ZevAuthContextValue {
  const value = useContext(ZevAuthContext);

  if (!value) {
    throw new Error(
      `${hookName} was called outside a <ZevAuthProvider>. Wrap your app in one, ` +
        `usually at the root: <ZevAuthProvider publishableKey="pk_...">.`,
    );
  }

  return value;
}
