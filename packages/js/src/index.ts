export { ZevAuth, type ZevAuthOptions } from './client';
export { SignInFlow } from './flows/sign-in';
export { SignUpFlow } from './flows/sign-up';
export { PasswordResetFlow } from './flows/password-reset';
export {
  ZevAuthError,
  type ActiveOrganization,
  type EnvironmentConfig,
  type SignInMethod,
  type ZevAuthSession,
  type ZevAuthState,
  type ZevAuthUser,
} from './types';
export type { SessionStorageAdapter } from './internal/tokens';

import { ZevAuth, type ZevAuthOptions } from './client';

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
