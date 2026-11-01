/**
 * ZevAuth for Expo and React Native.
 *
 * The hooks and control components are the web package's own, from its
 * DOM-free entry, so they behave identically on both. The provider,
 * screens and theming here are native.
 */
export { ZevAuthProvider, type ZevAuthProviderProps } from './provider.js';
export { SignIn, type SignInProps } from './components/SignIn.js';
export { SignUp, type SignUpProps } from './components/SignUp.js';
export { UserButton, UserAvatar, type UserButtonProps } from './components/UserButton.js';
export { UserProfile, type UserProfileProps } from './components/UserProfile.js';
export { TaskSetupMfa, SecondFactorStep } from './components/TwoStep.js';
export { secureStoreStorage, expoCrypto, systemBrowser, type AuthBrowser } from './adapters.js';
export {
  readableOn,
  type NativeAppearance,
  type NativeVariables,
  type NativeElementKey,
  type NativeStyle,
} from './theme.js';
export { nativeEn, type NativeLocalization, type NativeStrings } from './strings.js';

export {
  useZevAuth,
  useUser,
  useAuth,
  useOrganization,
  useOrganizationList,
  SignedIn,
  SignedOut,
  ZevAuthLoading,
  Protect,
  EmailVerified,
  EmailUnverified,
  themes,
  defaultLocalization,
  type UseUser,
  type UseAuth,
  type UseOrganization,
  type UseOrganizationList,
  type ProtectProps,
  type Localization,
  type ThemeName,
  type ThemedColor,
} from '@zevauth/react/headless';

export type {
  ZevAuth,
  ZevAuthState,
  ZevAuthUser,
  ActiveOrganization,
  IncomingUrlResult,
  AsyncSessionStorageAdapter,
  CryptoAdapter,
  HandoffError,
} from '@zevauth/js';
export { ZevAuthError, createZevAuth } from '@zevauth/js';
