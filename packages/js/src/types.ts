export interface ZevAuthUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  username: string | null;
  phone: string | null;
  phoneVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  publicMetadata: Record<string, unknown>;
  status: string;
  lastSignInAt: string | null;
  createdAt: string;
}

export interface ActiveOrganization {
  /** The organization's PUBLIC id. The internal one never leaves the server. */
  id: string;
  name: string;
  slug: string | null;
  /** The organization's picture, or null. Uploaded or linked. */
  imageUrl: string | null;
  role: string;
  /**
   * What this member may do.
   *
   * Sent alongside the role rather than left for the app to derive from
   * it: the point of a permission model is that the role-to-permission
   * mapping can change without every consumer reimplementing it.
   */
  permissions?: string[];
}

export interface ZevAuthSession {
  /** Short-lived. Sent as the bearer on requests to the developer's own API. */
  accessToken: string;
  /** Seconds until the access token expires, at the moment it was issued. */
  expiresIn: number;
  user: ZevAuthUser;
  organization: ActiveOrganization | null;
}

/*
 * These are the API's own keys, verbatim.
 *
 * `email_password` rather than `password` is not a style choice: it is
 * what `GET /v1/environment` sends, and this union used to say
 * `password`. Nothing matched, so `<SignIn />` and `<SignUp />` decided
 * the developer had no email sign-in enabled and rendered only their
 * social buttons — for every project, with no error anywhere.
 *
 * Add to this list only by copying a key out of the API response.
 */
export type SignInMethod =
  | 'email_password'
  | 'magic_link'
  | 'email_otp'
  | 'phone_otp'
  | 'username'
  | 'passkey'
  | 'zevid'
  | 'google'
  | 'github'
  | 'apple';

/** The developer's brand, resolved server-side and ready to paint. */
export interface Branding {
  appName: string;
  logoUrl: string | null;
  /** Whether the name prints under the logo. Always true with no logo. */
  showAppName: boolean;
  /**
   * Whether the logo and name appear above the form at all.
   *
   * Set in the console. Turn it off when your own page already shows
   * them above the component, so they are not shown twice. Hosted pages
   * always send true: with no page of yours around them, a screen that
   * names nobody cannot be told apart from a phishing page.
   */
  showIdentity?: boolean;
  /**
   * The words above each form, decided in the console and resolved
   * server-side. `null` means print nothing.
   *
   * `undefined` is different from `null` and the distinction matters:
   * an API that predates these fields sends neither, and the components
   * fall back to their built-in wording. Treating absent as "print
   * nothing" would strip the heading off every app that upgraded this
   * package before the backend shipped.
   */
  signInTitle?: string | null;
  signInSubtitle?: string | null;
  signUpTitle?: string | null;

  /**
   * Where the form sits on the page, and what fills the space beside
   * it. Set in the console; `<SignIn layout=… aside=… />` overrides it.
   */
  signInLayout?: 'centered' | 'split_left' | 'split_right';
  asideImageUrl?: string | null;
  asideHeading?: string | null;
  asideText?: string | null;
  signUpSubtitle?: string | null;
  accentColor: string | null;
  /** Contrast-corrected for each surface. Never re-derive these. */
  accentOnLight: string;
  accentOnDark: string;
  colorScheme: 'light' | 'dark' | 'system';
  borderRadius: 'none' | 'small' | 'medium' | 'large' | 'pill';
  fontFamily: 'system' | 'sans' | 'serif' | 'mono';
  /** Plan-gated on the server. A client cannot turn this off. */
  showPoweredBy: boolean;
}

export interface EnvironmentConfig {
  id: string;
  kind: 'test' | 'live';
  isTestMode: boolean;
  signInMethods: SignInMethod[];
  branding: Branding;
}

/** What every listener receives. `null` user means signed out. */
export interface ZevAuthState {
  isLoaded: boolean;
  user: ZevAuthUser | null;
  organization: ActiveOrganization | null;
}

export class ZevAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ZevAuthError';
  }
}
