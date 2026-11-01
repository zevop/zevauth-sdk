import { createContext, useContext, useMemo } from 'react';
import type { Appearance as BrandingAppearance, Branding, ZevAuth, ZevAuthState } from '@zevauth/js';
import {
  createElementResolver,
  mergeAppearanceLayers,
  type Appearance,
  type ElementResolver,
  type MergedAppearance,
} from './appearance.js';

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
  /** The provider's `appearance`, as given, for components to merge over. */
  appearance?: Appearance;
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
  appearance: BrandingAppearance | undefined,
): Branding | null {
  if (!branding) return branding;
  if (!appearance) return branding;

  /*
   * The components paint `accentOnLight` / `accentOnDark`, never
   * `accentColor`: those are the server's contrast-corrected versions.
   * So an `accentColor` set in code changed a field nothing read, and
   * the brand colour a developer put in their repository never showed.
   * Code is the more specific instruction, so it is used as given for
   * both surfaces unless the pair was set too. Text on it is still
   * worked out for legibility by `Brandable`.
   */
  const accent =
    appearance.accentColor && !appearance.accentOnLight && !appearance.accentOnDark
      ? { accentOnLight: appearance.accentColor, accentOnDark: appearance.accentColor }
      : {};

  return {
    ...branding,
    ...appearance,
    ...accent,
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

export interface ComponentAppearance {
  client: ZevAuth;
  state: ZevAuthState;
  /** The console's branding with every `appearance` layer merged over it. */
  branding: Branding | null;
  appearance: MergedAppearance;
  /** `className` and `style` for one part; see `createElementResolver`. */
  el: ElementResolver;
}

/**
 * Everything a component needs to render in the developer's look.
 *
 * Every component calls this, rather than some reading `client.branding`
 * and some reading context. Before it existed, half of them did the
 * former and silently ignored the provider's `appearance`: a developer
 * who set their colour once got it on `<SignIn>` and not on the
 * `<UserButton>` beside it.
 */
export function useComponentAppearance(
  hookName: string,
  local: Appearance | undefined,
): ComponentAppearance {
  const { client, state, appearance: provided } = useZevAuthContext(hookName);

  /*
   * `state` is a dependency because `client.branding` arrives with the
   * environment load, which is what moves `isLoaded`.
   */
  return useMemo(() => {
    const appearance = mergeAppearanceLayers(provided, local);
    return {
      client,
      state,
      branding: mergeAppearance(client.branding, appearance.branding),
      appearance,
      el: createElementResolver(appearance.elements),
    };
  }, [client, state, provided, local]);
}
