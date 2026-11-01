export { ZevAuth, type ZevAuthOptions } from './client.js';
export { SignInFlow } from './flows/sign-in.js';
export { SignUpFlow } from './flows/sign-up.js';
export { PasswordResetFlow } from './flows/password-reset.js';
export {
  OrganizationsFlow,
  type OrganizationMember,
  type OrganizationMembership,
} from './flows/organizations.js';
export { UserFlow } from './flows/user.js';
export {
  MfaFlow,
  type MfaFactor,
  type MfaStatus,
  type TotpEnrollment,
} from './flows/mfa.js';
export {
  ZevAuthError,
  type ActiveOrganization,
  type Branding,
  type EnvironmentConfig,
  type OrganizationSettings,
  type MfaSettings,
  type SecondFactorChallenge,
  type SessionTask,
  type SignInMethod,
  type SignInResult,
  type UserSession,
  type ZevAuthSession,
  type ZevAuthState,
  type ZevAuthUser,
} from './types.js';
export type { SessionStorageAdapter } from './internal/tokens.js';
export type {
  AssetPurpose,
  UploadImageOptions,
} from './internal/upload.js';

import { ZevAuth, type ZevAuthOptions } from './client.js';

/**
 * The usual way in.
 *
 * A function rather than asking people to `new` a class: it keeps the
 * door open to returning a shared instance per key later, without every
 * app that called `new ZevAuth()` having to change.
 */
export function createZevAuth(options: ZevAuthOptions): ZevAuth {
  return new ZevAuth(options);
}
export type { Appearance, HandoffError } from './types.js';
