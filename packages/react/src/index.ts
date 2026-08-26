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

export { SignIn, type SignInProps } from './components/SignIn.js';
export { UserButton, type UserButtonProps } from './components/UserButton.js';
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
