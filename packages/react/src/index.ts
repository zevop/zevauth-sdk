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
 */
export { componentStyles, componentStyleId } from './internal/styles.js';

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
} from '@zevauth/js';
export { ZevAuthError } from '@zevauth/js';
