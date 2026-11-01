'use client';

/**
 * Everything a Next.js app renders.
 *
 * ── Why `'use client'` is on this file ────────────────────────────
 * Every component here holds state and subscribes to the session, so
 * none of them can be server components. Marking the entry point means a
 * developer importing `<SignIn>` into a server component gets it working
 * instead of the "useState is not a function" error that sends people to
 * search for a Next.js bug that is not one.
 *
 * ── Why these are named exports and not `export *` ────────────────
 * Next.js refuses `export *` across a client boundary outright: the
 * build fails with "It's currently unsupported to use export * in a
 * client boundary". It has to enumerate what crosses, because the
 * boundary is a serialisation contract rather than a module re-export.
 *
 * So the list is written out. It costs a line per symbol and a build
 * that works, which the previous version did not — this package was
 * unusable in the app router until an example app tried it.
 *
 * Server helpers live at `@zevauth/nextjs/server` — a separate entry so
 * nothing in this file, and no browser API it touches, is ever pulled
 * into a server bundle.
 */
export {
  ZevAuthProvider,
  SignIn,
  SignInWithZevId,
  SignUp,
  UserButton,
  UserProfile,
  OrganizationProfile,
  OrganizationSwitcher,
  CreateOrganization,
  OrganizationList,
  UserAvatar,
  TaskSetupMfa,
  SignedIn,
  SignedOut,
  ZevAuthLoading,
  Protect,
  useAuth,
  useOrganization,
  useOrganizationList,
  useUser,
  useZevAuth,
  componentStyleId,
  componentStyles,
  getComponentStyles,
  ImageField,
  useZevTheme,
  themes,
  defaultLocalization,
  ZevAuthError,
} from '@zevauth/react';

/*
 * Types cross the boundary freely — they do not exist at runtime, so the
 * client-boundary rule does not apply to them.
 */
export type {
  ZevAuthProviderProps,
  SignInProps,
  SignInWithZevIdProps,
  SignUpProps,
  UserButtonProps,
  UserProfileProps,
  OrganizationProfileProps,
  OrganizationSwitcherProps,
  CreateOrganizationProps,
  OrganizationListProps,
  UserAvatarProps,
  TaskSetupMfaProps,
  ProtectProps,
  ImageFieldProps,
  Appearance,
  AppearanceElementKey,
  AppearanceElements,
  AppearanceElementValue,
  AppearanceVariables,
  ThemedColor,
  ThemeName,
  Localization,
  UseAuth,
  UseUser,
  UseOrganization,
  UseOrganizationList,
  ActiveOrganization,
  Branding,
  OrganizationMember,
  OrganizationMembership,
  SignInMethod,
  ZevAuthState,
  ZevAuthUser,
  UserSession,
  ZevAuth,
} from '@zevauth/react';
