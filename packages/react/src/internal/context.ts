import { createContext, useContext } from 'react';
import type { Appearance, Branding, ZevAuth, ZevAuthState } from '@zevauth/js';

export interface ZevAuthContextValue {
  client: ZevAuth;
  state: ZevAuthState;
  /**
   * The server's branding with any `appearance` merged over it.
   *
   * Components read THIS rather than `client.branding`, so an override
   * applies everywhere at once instead of each component remembering to
   * check for one.
   */
  branding: Branding | null;
}

/**
 * Server branding, overridden by code, except for the badge.
 *
 * `showPoweredBy` is reapplied from the server AFTER the spread. It is
 * a paid setting, resolved server-side against the plan, and a merge
 * that let a prop through would make it free to anyone who guessed the
 * key. Typescript already omits it from `Appearance`; this is the same
 * rule for JavaScript callers, who have no types to stop them.
 */
export function mergeAppearance(
  branding: Branding | null,
  appearance: Appearance | undefined,
): Branding | null {
  if (!branding) return branding;
  if (!appearance) return branding;
  return {
    ...branding,
    ...appearance,
    appName: branding.appName,
    showPoweredBy: branding.showPoweredBy,
  };
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
