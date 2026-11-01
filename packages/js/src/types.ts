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
  /** `flat` drops the border, surface and padding so the form blends in. */
  cardStyle?: 'card' | 'flat';
  /** Where the form sits vertically in the space it is given. */
  contentAlign?: 'center' | 'top';
  /** `dedicated` gives the password reset its own screen and its own field. */
  passwordResetMode?: 'dedicated' | 'inline';
  asideStyle?: 'gradient' | 'solid' | 'image';
  /** The panel colour. Already falls back to the accent server-side. */
  asideColor?: string | null;
  /** Used when the surface paints dark. Falls back to the light value. */
  asideColorDark?: string | null;
  asideImageUrl?: string | null;
  asideImageUrlDark?: string | null;
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

/**
 * The environment's organization policy, so a UI can draw only what the
 * API will accept. The API enforces every rule regardless.
 */
/** What a sign-in screen needs to know about the app's two-step policy. */
export interface MfaSettings {
  /** `off`, `optional` or `required`. */
  policy: 'off' | 'optional' | 'required';
  /** Factor types people may set up, e.g. `totp`. */
  factors: string[];
  /** Days "remember this device" lasts. 0 means the app does not offer it. */
  rememberDeviceDays: number;
}

export interface OrganizationSettings {
  /** Organizations are turned on for this environment. */
  enabled: boolean;
  /** Signed-in people may create organizations themselves. */
  creationAllowed: boolean;
  /** Organizations have a URL slug. */
  slugsEnabled: boolean;
  /** Organizations may be deleted from the app (still needs `org:delete`). */
  deleteAllowed: boolean;
  /** How many organizations one person may have, or null for no limit. */
  maxPerUser: number | null;
}

export interface EnvironmentConfig {
  id: string;
  kind: 'test' | 'live';
  isTestMode: boolean;
  signInMethods: SignInMethod[];
  branding: Branding;

  /**
   * What this environment does about confirming addresses.
   *
   * The components need it to render the right screen: an environment
   * that sends a code and a screen that says "open the link" is a dead
   * end for whoever is holding the code.
   */
  /** Absent from APIs older than this field. */
  organizations?: OrganizationSettings;

  /** Two-step verification policy. Absent from APIs older than this field. */
  mfa?: MfaSettings;

  emailVerification?: {
    /** `at_signup` sends immediately; `later` waits for you; `never` skips it. */
    policy: 'at_signup' | 'later' | 'never';
    /** `code`, `link`, or both. Empty means the environment default. */
    strategies: string[];
    /** `block` means no session until the address is confirmed. */
    unverifiedAccess: 'allow' | 'block';
  };
}

/**
 * Branding overridden in code.
 *
 * ── Why it is a Partial of Branding and not its own vocabulary ────
 * Every field here is one a developer has already met in the console.
 * Inventing a second set of names would mean two things to learn, two
 * things to document, and a mapping between them that goes stale.
 *
 * ── Why `showPoweredBy` is not in it ─────────────────────────────
 * Whether "Secured by ZevAuth" appears is decided by the server, from
 * the plan. Letting a prop turn it off would make a paid feature free
 * to anybody who read the types. The merge drops it even when it is
 * present at runtime, so a plain JavaScript caller cannot set it
 * either.
 */
export type Appearance = Partial<Omit<Branding, 'showPoweredBy' | 'appName'>>;

/**
 * Why a sign-in that left the page came back without a session.
 *
 *   zevid_expired   the person took longer than the flow allows
 *   zevid_denied    they chose not to continue on the consent screen
 *   zevid_rejected  ZevID answered, but with something we could not accept
 *   zevid_error     ZevID could not complete the sign-in
 *   zevid_reauthentication_required
 *                   a ZevID session reached its fresh-sign-in window
 *   state_mismatch  a PKCE sign-in came back to a tab that did not start it
 *
 * `description` is written for the person and safe to show as-is.
 */
export interface HandoffError {
  code:
    | 'zevid_expired'
    | 'zevid_denied'
    | 'zevid_rejected'
    | 'zevid_error'
    | 'zevid_reauthentication_required'
    | 'state_mismatch'
    | (string & {});
  description: string;
}

/**
 * One place the signed-in person is signed in, from `me.sessions()`.
 *
 * Descriptive only: nothing here can act as the session. `userAgent` is
 * the string the browser sent, unparsed, so a component can describe the
 * device however suits it.
 */
export interface UserSession {
  id: string;
  userAgent: string | null;
  /**
   * As much of the address as the developer allows end users to see:
   * nothing (`ipDisplay: 'hidden'`, the default), the network only
   * (`'coarse'`, e.g. `203.0.113.x`), or all of it (`'full'`).
   */
  ipAddress: string | null;
  /** Set in the console under the environment's sign-in settings. */
  ipDisplay: 'hidden' | 'coarse' | 'full';
  /** How it started: `email_password`, `magic_link`, `zevid`, … */
  provider: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  /** The session this client is using. It cannot be revoked; sign out instead. */
  isCurrent: boolean;
}

/** What every listener receives. `null` user means signed out. */
export interface ZevAuthState {
  isLoaded: boolean;
  user: ZevAuthUser | null;
  organization: ActiveOrganization | null;
  /**
   * A sign-in waiting for its second factor: the first step succeeded
   * and `signIn.verifySecondFactor({ code })` finishes it. Null (or
   * absent, from an older client) otherwise.
   */
  secondFactor?: SecondFactorChallenge | null;
  /**
   * What the signed-in session must still do, e.g. `setup_mfa` when the
   * app requires two-step verification and the person has none yet.
   * Most of the API refuses the session until it is done.
   */
  pendingTasks?: SessionTask[];
}

/** Something a session must finish before it is fully trusted. */
export type SessionTask = 'setup_mfa' | (string & {});

/** The second step of a sign-in, as a UI needs it. */
export interface SecondFactorChallenge {
  /** What the person can enter: `totp`, `recovery_code`. */
  factors: string[];
  /** After this the person has to sign in again. ISO 8601. */
  expiresAt: string;
}

/**
 * What a sign-in call ended in. `complete` means a session started;
 * `needs_second_factor` means the person has two-step verification and
 * `signIn.verifySecondFactor({ code })` is next.
 *
 * Calls that used to return nothing now return this, so existing code
 * that ignores the result keeps working.
 */
export type SignInResult =
  | { status: 'complete' }
  | ({ status: 'needs_second_factor' } & SecondFactorChallenge);

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
