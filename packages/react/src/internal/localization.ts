import { createContext, useContext } from 'react';

/**
 * Every word the components print, in English.
 *
 * ── Why one object, keyed by screen ───────────────────────────────
 * A developer translating the sign-in box wants to see everything on
 * it in one place, in the order it appears, not hunt through a flat
 * list of three hundred keys. Grouped by component, a key reads as an
 * address (`signIn.password.label`) and the IDE can complete it.
 *
 * ── Placeholders ──────────────────────────────────────────────────
 * Values that include something only known at runtime say so with a
 * `{name}` token. Tokens are words, not positions, because a sentence
 * reordered by a translator moves them around.
 *
 * ── What is NOT here ──────────────────────────────────────────────
 * Headings set in the console (`signInTitle` and friends) are content,
 * not chrome: they stay the console's unless `localization` names them,
 * in which case code wins, as it does everywhere else.
 */
export const en = {
  common: {
    or: 'or',
    email: 'Email',
    password: 'Password',
    continue: 'Continue',
    cancel: 'Cancel',
    genericError: 'Something went wrong. Please try again.',
    testMode: 'Test mode',
    securedBy: 'Secured by',
    continueWithZevId: 'Continue with ZevID',
  },
  signIn: {
    title: 'Sign in',
    submit: 'Sign in',
    moreOptions: 'More options',
    emailLink: 'Email me a sign-in link',
    emailCode: 'Email me a code',
    emailFirst: 'Enter your email address first, then choose this again.',
    forgotPassword: 'Forgot your password?',
    noMethods:
      'No sign-in methods are enabled for this environment. Turn one on under Authentication in the ZevAuth console.',
    useSomethingElse: 'Use something else',
    linkSentTitle: 'Check your email',
    linkSentBody: 'If {email} has an account, a sign-in link is on its way.',
    codeSentTitle: 'Enter your code',
    codeSentBody: 'If {email} has an account, we sent it a code.',
    codeLabel: 'Code',
    resetTitle: 'Reset your password',
    resetSubtitle: 'We will email you a link to set a new one.',
    resetSubmit: 'Send reset link',
    backToSignIn: 'Back to sign in',
  },
  signUp: {
    title: 'Create your account',
    submit: 'Create account',
    firstName: 'First name',
    optional: 'Optional.',
    passwordHint: '8 characters or more.',
    confirmPassword: 'Confirm password',
    passwordsDiffer: 'These passwords do not match.',
    noMethods:
      'No sign-up methods are enabled for this environment. Turn one on under Authentication in the ZevAuth console.',
    verifyTitle: 'Confirm your email',
    verifyBodyLinkAndCode: 'We sent a link and a code to {email}. Open the link, or enter the code below.',
    verifyBodyCode: 'We sent a code to {email}. Enter it below to finish setting up your account.',
    verifyBodyLink: 'We sent a link to {email}. Open it to finish setting up your account.',
    verifyCodeLabel: 'Verification code',
    verifySubmit: 'Confirm',
    codeRejected: 'That code was not accepted.',
  },
  userButton: {
    menuLabel: 'Account menu for {name}',
    organization: 'Organization',
    signOut: 'Sign out',
    manageAccount: 'Manage account',
    closeDialog: 'Close',
  },
  organizationSwitcher: {
    personalAccount: 'Personal account',
    switchTo: 'Switch to',
    createOrganization: 'Create organization',
  },
  userProfile: {
    title: 'Your profile',
    photo: 'Photo',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    pendingEmail: 'Waiting for {email} to be confirmed. Nothing changes until the link we sent there is opened.',
    cancel: 'Cancel',
    changeEmail: 'Change your email address',
    newEmail: 'New email address',
    newEmailHint: 'We will send a link there. Your address does not change until you open it.',
    currentPassword: 'Current password',
    sendConfirmation: 'Send confirmation',
    save: 'Save',
    saved: 'Saved',
    saveFailed: 'Could not save.',
    emailChangeFailed: 'Could not request that change.',
    changePassword: 'Change password',
    passwordChanged: 'Password changed.',
    otherSessionSignedOut: ' We signed out {count} other session.',
    otherSessionsSignedOut: ' We signed out {count} other sessions.',
    newPassword: 'New password',
    newPasswordHint: '8 characters or more. Your other devices will be signed out.',
    passwordChangeFailed: 'Could not change your password.',
    navTitle: 'Account',
    navSubtitle: 'Manage your account.',
    profileSection: 'Profile',
    securitySection: 'Security',
    sessionsTitle: 'Active devices',
    sessionsHint: 'Where you are signed in. Sign out of any device you do not recognise.',
    thisDevice: 'This device',
    lastActive: 'Last active {time}',
    signOutDevice: 'Sign out',
    signOutOthers: 'Sign out of all other devices',
    sessionsEmpty: 'You are not signed in anywhere else.',
    sessionsLoadFailed: 'Could not load your devices.',
    sessionRevokeFailed: 'Could not sign that device out.',
    unknownDevice: 'Unknown device',
    deviceOn: '{browser} on {os}',
  },
  organizationProfile: {
    notActing: 'This session is not acting as an organization. Switch to one to manage its members.',
    genericError: 'That did not work.',
    image: 'Organization image',
    addMember: 'Add a member',
    addMemberPlaceholder: 'colleague@example.com',
    addMemberHint: 'They need an account here already.',
    add: 'Add',
    members: 'Members',
    loading: 'Loading…',
    empty: 'Nobody yet.',
    you: ' (you)',
    leave: 'Leave',
    remove: 'Remove',
    navSubtitle: 'Manage your organization.',
    generalSection: 'General',
    membersSection: 'Members',
    leaveTitle: 'Leave organization',
    leaveBody: 'You will lose access to {name} until someone adds you again.',
    leaveAction: 'Leave',
    leaveConfirm: 'Leave organization',
    deleteTitle: 'Delete organization',
    deleteBody: 'This deletes {name} and removes every member from it. Their accounts are kept. This cannot be undone.',
    deleteConfirmLabel: 'Type {name} to confirm',
    deleteAction: 'Delete',
    deleteConfirm: 'Delete organization',
    lastOwner: 'You are the last owner. Make someone else an owner first, or delete the organization instead.',
    deleteDisabled: 'Deleting organizations is turned off for this app.',
    permissionRequired: 'You do not have permission to do that.',
  },
  createOrganization: {
    title: 'Create organization',
    name: 'Name',
    namePlaceholder: 'Organization name',
    slug: 'Slug',
    slugHint: 'Used in links. Lowercase letters, numbers and hyphens.',
    submit: 'Create organization',
    logoTitle: 'Add a logo',
    logoSubtitle: 'Optional. You can change it at any time.',
    logo: 'Logo',
    done: 'Done',
    skip: 'Skip for now',
    creationDisabled: 'Creating organizations is turned off for this app.',
    organizationsDisabled: 'Organizations are not enabled for this app.',
    limitReached: 'You have created as many organizations as this app allows.',
    slugTaken: 'That slug is taken. Try another.',
    slugsDisabled: 'This app does not use slugs. Leave it empty.',
    nameRequired: 'Give the organization a name.',
  },
  organizationList: {
    title: 'Choose an account',
    subtitle: 'to continue to {appName}',
    personalAccount: 'Personal account',
    createOrganization: 'Create organization',
  },
  imageField: {
    uploading: 'Uploading',
    uploadingLabel: 'Uploading {label}',
    upload: 'Upload',
    replace: 'Replace',
    remove: 'Remove',
    hint: 'PNG, JPG or WebP. Up to 1 MB.',
    wrongType: 'Use a PNG, JPG or WebP image.',
    tooLarge: 'That image is over 1 MB. Try a smaller one.',
    uploadFailed: 'Could not upload that image.',
    removeFailed: 'Could not remove that image.',
  },
  /**
   * Messages for refusals from the API, by error code, used in place of
   * the server's English. Anything not listed falls back to the server's
   * own message, which is always safe to show.
   */
  errors: {} as Record<string, string>,
};

type Widen<T> = {
  [K in keyof T]?: T[K] extends string ? string : T[K] extends Record<string, string> ? Record<string, string> : Widen<T[K]>;
};

/**
 * The words to change. Any subset: everything left out stays English.
 */
export type Localization = Widen<typeof en>;

export type Strings = typeof en;

/**
 * English, with each layer's overrides merged in by group.
 *
 * Two levels deep and no further, because the shape is two levels deep:
 * a component's `localization` that changes one sign-in label keeps the
 * provider's other sign-in labels.
 */
export function mergeLocalization(...layers: Array<Localization | undefined>): Strings {
  const merged = { ...en } as Record<string, Record<string, string>>;
  for (const layer of layers) {
    if (!layer) continue;
    for (const [group, values] of Object.entries(layer)) {
      if (!values) continue;
      merged[group] = { ...merged[group], ...(values as Record<string, string>) };
    }
  }
  return merged as unknown as Strings;
}

/** `{email}` and friends, filled in. Unknown tokens are left as written. */
export function format(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/**
 * The message for a failed request, in the developer's words when they
 * gave some for this code.
 */
export function errorMessage(
  strings: Strings,
  error: unknown,
  fallback: string,
  /**
   * Our own wording for codes a component knows how to explain. The
   * developer's `errors` still win over it; the server's English is
   * the last resort.
   */
  known: Record<string, string> = {},
): string {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const code = String((error as { code: unknown }).code);
    return strings.errors[code] ?? known[code] ?? String((error as { message: unknown }).message);
  }
  return fallback;
}

/**
 * The strings for parts rendered inside a component's root, put in
 * context by `Brandable` the same way the element resolver is.
 */
export const StringsContext = createContext<Strings>(en);

export function useStrings(): Strings {
  return useContext(StringsContext);
}
