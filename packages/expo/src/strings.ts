/**
 * Wording only a phone needs. Everything else (labels, buttons, errors)
 * is the web's `defaultLocalization`, so a translation written for the
 * web app works in the native app unchanged, and this group is the only
 * addition to translate.
 */
export const nativeEn = {
  /** Under "Check your email" after a sign-in link is sent. */
  openLinkOnPhone: 'Open the link on this phone to continue.',
  openAuthenticator: 'Open authenticator app',
  noAuthenticator: 'No authenticator app is installed. Enter the key by hand instead.',
  setupKeyLabel: 'Setup key',
  shareKey: 'Share key',
  shareCodes: 'Share codes',
  accountMenu: 'Account',
  close: 'Close',
  zevIdCancelled: 'The ZevID sign-in was closed before it finished.',
  emailVerifiedSignIn: 'Your email is confirmed. Sign in to continue.',
};

export type NativeStrings = typeof nativeEn;

/** The phone-only wording to change. Any subset. */
export interface NativeLocalization {
  native?: Partial<NativeStrings>;
}
