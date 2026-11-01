/*
 * Narrow imports, not the `jose` root.
 *
 * The root entry re-exports everything, including JWE decryption, which
 * reaches `CompressionStream` — a Web API the Edge runtime does not
 * provide. Next.js then warns on every build of every app that uses our
 * middleware, about a code path none of them execute.
 *
 * We verify signatures and fetch a key set. Importing exactly those two
 * leaves the rest out of the bundle, so the warning goes away because
 * the code does.
 */
import { createRemoteJWKSet } from 'jose/jwks/remote';
import { jwtVerify } from 'jose/jwt/verify';
import type { JWTPayload } from 'jose';

/**
 * Verifying a ZevAuth token on the server, without calling ZevAuth.
 *
 * ── Why this does not make a request to us ────────────────────────
 * A token is a signed statement. Verifying it needs the environment's
 * public key and nothing else, and that key changes a few times a year.
 * Asking our API on every request would put our availability in the path
 * of every page the developer serves — so an outage of ours would become
 * an outage of theirs. The JWKS is fetched once and cached instead.
 *
 * ── What this deliberately cannot tell you ───────────────────────
 * Whether the session has since been REVOKED. Nothing offline can: that
 * is the trade a stateless token makes. Access tokens are short-lived so
 * the window is small, and anything that must react to a sign-out
 * immediately should call `/v1/me`, which checks the session.
 */

export interface ZevAuthClaims extends JWTPayload {
  /** The end user's public id. */
  sub: string;
  /** The session's public id. */
  sid: string;
  email?: string;
  email_verified?: boolean;
  org_id?: string;
  org_role?: string;
  org_permissions?: string[];
  /**
   * What the session must still do before it is fully trusted, e.g.
   * `setup_mfa`. Absent when there is nothing, which is almost always.
   */
  pending_tasks?: string[];
  /**
   * How the session authenticated (RFC 8176). Present only on sessions
   * that passed a second factor, and then includes `mfa`.
   */
  amr?: string[];
}

export interface VerifyOptions {
  /** `env_live_…`. Always the token's audience. */
  environmentId: string;
  /** Where to reach the API. Defaults to the hosted one. */
  apiUrl?: string;
  /**
   * The expected issuer, if you want to state it.
   *
   * Normally leave this out: it is read from the environment's OIDC
   * discovery document, which is where the server publishes it.
   */
  issuer?: string;
}

/**
 * The environment's issuer and key set, discovered once.
 *
 * ── Why discovery, and not a URL built from `apiUrl` ──────────────
 * The issuer is a stable IDENTITY; `apiUrl` is where the server happens
 * to be reachable. They are usually the same host and are not required
 * to be: ZevAuth stamps `iss` from its own configuration, so a
 * self-hosted deployment behind a different hostname, or a local server
 * on another port, issues tokens whose `iss` a URL-built guess would not
 * match. Verification would then fail with "unexpected iss" against a
 * token that is perfectly valid.
 *
 * The OIDC discovery document publishes both, which is what it is for.
 * One fetch, cached for the life of the process, and the class of
 * misconfiguration disappears.
 */
interface Discovered {
  issuer: string;
  keys: ReturnType<typeof createRemoteJWKSet>;
}

const discovered = new Map<string, Promise<Discovered>>();

function discover(environmentId: string, apiUrl: string): Promise<Discovered> {
  const cacheKey = `${apiUrl}|${environmentId}`;
  const existing = discovered.get(cacheKey);
  if (existing) return existing;

  /*
   * The PROMISE is cached, not its result, so concurrent first requests
   * share one fetch instead of each starting their own.
   */
  const pending = (async (): Promise<Discovered> => {
    const response = await fetch(
      `${apiUrl}/v1/${environmentId}/.well-known/openid-configuration`,
    );

    if (!response.ok) {
      throw new Error(
        `Could not read the ZevAuth discovery document for ${environmentId} ` +
          `(${response.status}). Check the environment id and apiUrl.`,
      );
    }

    const document = (await response.json()) as {
      issuer: string;
      jwks_uri: string;
    };

    return {
      issuer: document.issuer,
      /*
       * `createRemoteJWKSet` caches and refetches when it meets an
       * unknown `kid`, which is what a key rotation looks like. Building
       * one per request would defeat that and fetch on every page view.
       */
      keys: createRemoteJWKSet(new URL(document.jwks_uri)),
    };
  })();

  discovered.set(cacheKey, pending);

  // A failed discovery must not be cached forever, or one blip at boot
  // would leave the process unable to verify anything until it restarts.
  pending.catch(() => discovered.delete(cacheKey));

  return pending;
}

/**
 * Verifies a token and returns its claims, or throws.
 *
 * The audience check is not optional: every environment signs with its
 * own key, but a developer with test and production both live would
 * otherwise find a test token accepted by a production route.
 */
export async function verifyZevAuthToken(
  token: string,
  options: VerifyOptions,
): Promise<ZevAuthClaims> {
  const apiUrl = options.apiUrl ?? 'https://api.zevauth.net';
  const { issuer, keys } = await discover(options.environmentId, apiUrl);

  const { payload } = await jwtVerify(token, keys, {
    issuer: options.issuer ?? issuer,
    audience: options.environmentId,
  });

  return payload as ZevAuthClaims;
}

/** Pulls the bearer token out of an `Authorization` header. */
export function bearerFrom(headerValue: string | null | undefined): string | null {
  if (!headerValue?.startsWith('Bearer ')) return null;
  const token = headerValue.slice('Bearer '.length).trim();

  /*
   * An API key here is the mistake worth naming rather than reporting as
   * a malformed token: they are the same header on different endpoints,
   * and the resulting "invalid token" while staring at a key you know is
   * right wastes an afternoon.
   */
  if (token.startsWith('pk_') || token.startsWith('sk_')) return null;
  return token || null;
}
