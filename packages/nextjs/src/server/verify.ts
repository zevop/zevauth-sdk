/**
 * Verifying a ZevAuth token on the server, without calling ZevAuth.
 *
 * ── Why this is a re-export ───────────────────────────────────────
 * This file used to hold its own copy of the verifier. The copy let the
 * token pick any algorithm jose supports, had no clock tolerance and no
 * cooldown on unknown-`kid` refetches, and threw jose's own errors. The
 * shared verifier in `@zevauth/backend/verify` implements the contract
 * every ZevAuth server library passes (RS256 only, 5 s skew, a 10-minute
 * key cache with a 30 s refetch cooldown, typed `ZevAuthVerifyError`
 * codes), so Next.js apps now get exactly that rather than a second
 * answer waiting to disagree.
 *
 * It keeps the narrow jose imports (`jose/jwks/remote`, `jose/jwt/verify`),
 * so the Edge runtime still sees no JWE code and Next.js builds stay
 * free of the `CompressionStream` warning.
 *
 * ── Why this does not make a request to us ────────────────────────
 * A token is a signed statement. Verifying it needs the environment's
 * public key, which is fetched once and cached; an outage of ours never
 * becomes an outage of every page the developer serves.
 *
 * ── What this deliberately cannot tell you ───────────────────────
 * Whether the session has since been REVOKED. Nothing offline can.
 * Access tokens are short-lived so the window is small, and anything that
 * must react to a sign-out immediately should call the API.
 */
export {
  verifyZevAuthToken,
  bearerFrom,
  ZevAuthVerifyError,
  type VerifyErrorCode,
  type VerifyOptions,
  type ZevAuthClaims,
} from '@zevauth/backend/verify';
