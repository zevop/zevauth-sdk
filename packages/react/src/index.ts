export { ZevAuthProvider, type ZevAuthProviderProps } from './provider.js';

/**
 * The component stylesheet, as a string.
 *
 * The components inject this themselves on first render, which is right
 * for an ordinary client app. A server-rendered page needs it in the
 * HTML instead: waiting for hydration to style a sign-in box means a
 * flash of unstyled markup, and if hydration is delayed or fails the box
 * never gets styled at all.
 *
 * Render it once, with `componentStyleId` as the element's id. The
 * runtime injector looks for that id and skips when it is already
 * present, so the two cannot both add it.
 *
 * ```tsx
 * <style id={componentStyleId} dangerouslySetInnerHTML={{ __html: componentStyles }} />
 * ```
 *
 * With `appearance.cssLayerName`, inline `getComponentStyles({ cssLayerName })`
 * instead, so the server sends the same layered CSS the runtime would add.
 */
export {
  componentStyles,
  componentStyleId,
  getComponentStyles,
} from './internal/styles.js';

/*
 * The customisation vocabulary, so an app can type a shared theme in a
 * file of its own and hand the same object to the provider and to any
 * one component.
 */
export type {
  Appearance,
  AppearanceElementKey,
  AppearanceElements,
  AppearanceElementValue,
  AppearanceVariables,
  ThemedColor,
} from './internal/appearance.js';
/*
 * The theme objects themselves, so a developer can spread one into
 * their own (`{ ...themes.soft, variables: { ... } }`) or show the list
 * in a settings screen of their own.
 */
export { themes, type ThemeName } from './internal/themes.js';
/*
 * The English strings, as the template a translator starts from, and
 * the type that checks their translation.
 */
export { en as defaultLocalization, type Localization } from './internal/localization.js';
/*
 * Exported so a developer building their own settings screen gets the
 * same picture control our components use, rather than reimplementing
 * the hash-upload-save dance around `uploadAvatar`.
 */
export { ImageField, type ImageFieldProps } from './components/ImageField.js';

export { useZevAuth } from './hooks/useZevAuth.js';
export { useUser, type UseUser } from './hooks/useUser.js';
export { useAuth, type UseAuth } from './hooks/useAuth.js';
export {
  useOrganization,
  useOrganizationList,
  type UseOrganization,
  type UseOrganizationList,
} from './hooks/useOrganization.js';

export { SignIn, type SignInProps } from './components/SignIn.js';
export { SignUp, type SignUpProps } from './components/SignUp.js';
export {
  SignInWithZevId,
  type SignInWithZevIdProps,
} from './components/SignInWithZevId.js';
export {
  UserProfile,
  type UserProfileProps,
} from './components/UserProfile.js';
export { UserButton, type UserButtonProps } from './components/UserButton.js';
export {
  OrganizationProfile,
  type OrganizationProfileProps,
} from './components/OrganizationProfile.js';
export {
  OrganizationSwitcher,
  type OrganizationSwitcherProps,
} from './components/OrganizationSwitcher.js';
export {
  CreateOrganization,
  type CreateOrganizationProps,
} from './components/CreateOrganization.js';
export {
  OrganizationList,
  type OrganizationListProps,
} from './components/OrganizationList.js';
export { UserAvatar, type UserAvatarProps } from './components/UserAvatar.js';
export { TaskSetupMfa, type TaskSetupMfaProps } from './components/TwoStep.js';

export {
  EmailUnverified,
  EmailVerified,
  SignedIn,
  SignedOut,
  ZevAuthLoading,
  Protect,
  type ProtectProps,
} from './components/control.js';

// Re-exported so an app never has to depend on both packages just to
// name a type in its own code.
// The client type, for anything that constructs or holds one — a test
// harness, a documentation preview, an app that builds its own.
export type { ZevAuth, ZevAuthOptions } from '@zevauth/js';
export type {
  ActiveOrganization,
  Branding,
  OrganizationMember,
  OrganizationMembership,
  SignInMethod,
  ZevAuthState,
  ZevAuthUser,
  UserSession,
  SignInResult,
  SecondFactorChallenge,
  SessionTask,
  MfaSettings,
  MfaStatus,
  MfaFactor,
} from '@zevauth/js';
export { ZevAuthError } from '@zevauth/js';
export { useZevTheme } from './components/Brandable.js';
