/**
 * Everything in this package that does not touch the DOM: the provider,
 * the hooks, the control components, the wording and the themes.
 *
 * ── Why a separate entry ──────────────────────────────────────────
 * The main entry also exports the components, and one of them renders
 * through `react-dom` (the dialog's portal). React Native has no
 * `react-dom`, so a native app importing the main entry fails to bundle
 * before a line of its own code runs. This entry is the same code minus
 * that, which is what `@zevauth/expo` builds on: one provider, one set of
 * hooks and one set of strings across web and native, rather than a
 * copy that drifts.
 */
export { ZevAuthProvider, type ZevAuthProviderProps } from './provider.js';
export { useZevAuth } from './hooks/useZevAuth.js';
export { useUser, type UseUser } from './hooks/useUser.js';
export { useAuth, type UseAuth } from './hooks/useAuth.js';
export {
  useOrganization,
  useOrganizationList,
  type UseOrganization,
  type UseOrganizationList,
} from './hooks/useOrganization.js';
export {
  EmailUnverified,
  EmailVerified,
  SignedIn,
  SignedOut,
  ZevAuthLoading,
  Protect,
  type ProtectProps,
} from './components/control.js';
export {
  en as defaultLocalization,
  mergeLocalization,
  format,
  errorMessage,
  type Localization,
  type Strings,
} from './internal/localization.js';
export { themes, type ThemeName } from './internal/themes.js';
export type { AppearanceVariables, ThemedColor } from './internal/appearance.js';
