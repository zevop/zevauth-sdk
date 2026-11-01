export {
  verifyZevAuthToken,
  bearerFrom,
  ZevAuthVerifyError,
  type VerifyErrorCode,
  type VerifyOptions,
  type ZevAuthClaims,
} from './verify.js';
export {
  createZevAuthMiddleware,
  type MiddlewareOptions,
  type RouteMatcher,
} from './middleware.js';
export {
  getAuth,
  requireAuth,
  type ServerAuth,
  type ZevAuthServerConfig,
} from './auth.js';
/*
 * The component stylesheet, for a server layout to put in the HTML.
 * Here rather than only on the client entry: a server component that
 * imports a value through `'use client'` gets a reference, not the
 * string, and the `<style>` tag renders empty.
 */
export {
  componentStyles,
  componentStyleId,
  getComponentStyles,
} from '@zevauth/react/styles';
