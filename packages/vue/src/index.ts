export {
  createZevAuth,
  ZevAuthKey,
  type ZevAuthContext,
  type ZevAuthPluginOptions,
} from './plugin.js';

export {
  useAuth,
  useOrganization,
  useOrganizationList,
  useUser,
  useZevAuthClient,
  type UseAuth,
  type UseOrganization,
  type UseOrganizationList,
  type UseUser,
} from './composables.js';

export {
  OrganizationProfile,
  OrganizationSwitcher,
  Protect,
  SignIn,
  SignInWithZevId,
  SignUp,
  SignedIn,
  SignedOut,
  UserButton,
  UserProfile,
  ZevAuthLoading,
} from './components.js';

// Re-exported so an app depends on one package to name a type.
export type {
  Appearance,
  AppearanceElementKey,
  AppearanceElements,
  AppearanceVariables,
  Localization,
  ThemeName,
  ThemedColor,
} from '@zevauth/ui';
export type {
  ActiveOrganization,
  OrganizationMember,
  OrganizationMembership,
  ZevAuth,
  ZevAuthState,
  ZevAuthUser,
} from '@zevauth/ui';
export { ZevAuthError } from '@zevauth/ui';
/*
 * For code that runs outside a component, where a composable cannot
 * reach the plugin: Nuxt route middleware, a router guard, a store.
 * Create the client with this, give it to the plugin as `client`, and
 * keep a reference. It is the same copy of the client package the
 * components use, so their error handling still recognises it.
 */
export { createZevAuth as createZevAuthClient } from '@zevauth/ui';
