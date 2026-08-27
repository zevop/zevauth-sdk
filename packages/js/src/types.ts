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

export type SignInMethod =
  | 'password'
  | 'magic_link'
  | 'email_otp'
  | 'username'
  | 'zevid';

/** The developer's brand, resolved server-side and ready to paint. */
export interface Branding {
  appName: string;
  logoUrl: string | null;
  /** Whether the name prints under the logo. Always true with no logo. */
  showAppName: boolean;
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
