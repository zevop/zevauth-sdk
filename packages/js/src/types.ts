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
  id: string;
  name: string;
  slug: string | null;
  role: string;
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

export interface EnvironmentConfig {
  id: string;
  kind: 'test' | 'live';
  isTestMode: boolean;
  signInMethods: SignInMethod[];
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
