/**
 * Verifying a ZevAuth session token on any server.
 *
 * The same verifier `@zevauth/nextjs/server` uses, for every other
 * stack: React Router, TanStack Start, Astro, Nuxt, Express, Hono, a
 * plain `Request` handler. It takes a standard `Request`, so it does not
 * care which framework produced it.
 *
 * A separate entry (`@zevauth/backend/verify`) rather than the root:
 * verifying needs no secret key, only the environment id, and keeping
 * it apart means a route that only checks tokens never loads the admin
 * client that can delete users.
 */
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
import { createRemoteJWKSet, customFetch } from 'jose/jwks/remote';
import { createLocalJWKSet } from 'jose/jwks/local';
import { jwtVerify } from 'jose/jwt/verify';
import type { JSONWebKeySet, JWTPayload } from 'jose';

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
  /**
   * Seconds of clock difference tolerated on `exp` and `nbf`. Defaults
   * to 5, the value every ZevAuth server SDK uses (spec/SERVER_SDK.md).
   */
  clockSkewSeconds?: number;
  /**
   * A key set to use instead of fetching one. For tests and for servers
   * that cannot reach the API at runtime; `issuer` is then required.
   */
  jwks?: JSONWebKeySet;
  /** The time to verify against. For tests; defaults to now. */
  currentDate?: Date;
  /**
   * The `fetch` used for discovery and key sets. For tests, and for
   * runtimes that need a configured client (a proxy, custom CA).
   */
  fetch?: typeof fetch;
  /**
   * The shortest gap between two key-set refetches triggered by an
   * unknown `kid`, in seconds. Defaults to 30. A token with a made-up
   * `kid` must not be able to make us fetch on every request.
   */
  jwksCooldownSeconds?: number;
}

/**
 * Why a token was refused, in the same words in every ZevAuth server
 * SDK. `getAuth` treats them all as signed out; they exist for logs and
 * for anybody calling `verifyZevAuthToken` directly.
 */
export type VerifyErrorCode =
  | 'token_expired'
  | 'token_not_yet_valid'
  | 'unsupported_algorithm'
  | 'invalid_issuer'
  | 'invalid_audience'
  | 'unknown_key'
  | 'invalid_signature'
  | 'malformed_token'
  | 'jwks_unavailable';

export class ZevAuthVerifyError extends Error {
  constructor(
    message: string,
    readonly code: VerifyErrorCode,
  ) {
    super(message);
    this.name = 'ZevAuthVerifyError';
  }
}

/** The one algorithm ZevAuth signs with. Anything else is refused. */
const ALGORITHMS = ['RS256'];
const DEFAULT_SKEW_SECONDS = 5;

/**
 * jose's errors, in our vocabulary.
 *
 * Mapped by the error's `code` and, for claim failures, the claim name,
 * because those are jose's documented contract; its messages are not.
 */
function toVerifyError(error: unknown): ZevAuthVerifyError {
  if (error instanceof ZevAuthVerifyError) return error;
  const e = error as { code?: string; claim?: string; message?: string };
  const message = e?.message ?? 'The token could not be verified.';
  switch (e?.code) {
    case 'ERR_JWT_EXPIRED':
      return new ZevAuthVerifyError(message, 'token_expired');
    case 'ERR_JWT_CLAIM_VALIDATION_FAILED':
      if (e.claim === 'nbf') return new ZevAuthVerifyError(message, 'token_not_yet_valid');
      if (e.claim === 'iss') return new ZevAuthVerifyError(message, 'invalid_issuer');
      if (e.claim === 'aud') return new ZevAuthVerifyError(message, 'invalid_audience');
      return new ZevAuthVerifyError(message, 'malformed_token');
    case 'ERR_JOSE_ALG_NOT_ALLOWED':
    case 'ERR_JOSE_NOT_SUPPORTED':
      return new ZevAuthVerifyError(message, 'unsupported_algorithm');
    case 'ERR_JWKS_NO_MATCHING_KEY':
    case 'ERR_JWKS_MULTIPLE_MATCHING_KEYS':
      return new ZevAuthVerifyError(message, 'unknown_key');
    case 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED':
      return new ZevAuthVerifyError(message, 'invalid_signature');
    case 'ERR_JWKS_TIMEOUT':
    case 'ERR_JWKS_INVALID':
      return new ZevAuthVerifyError(message, 'jwks_unavailable');
    default:
      return new ZevAuthVerifyError(message, 'malformed_token');
  }
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

function discover(
  environmentId: string,
  apiUrl: string,
  doFetch: typeof fetch = globalThis.fetch,
  cooldownSeconds = 30,
): Promise<Discovered> {
  const cacheKey = `${apiUrl}|${environmentId}|${cooldownSeconds}`;
  const existing = discovered.get(cacheKey);
  if (existing) return existing;

  /*
   * The PROMISE is cached, not its result, so concurrent first requests
   * share one fetch instead of each starting their own.
   */
  const pending = (async (): Promise<Discovered> => {
    let response: Response;
    try {
      response = await doFetch(
        `${apiUrl}/v1/${environmentId}/.well-known/openid-configuration`,
      );
    } catch (error) {
      throw new ZevAuthVerifyError(
        `Could not reach ZevAuth to read the discovery document: ${String(error)}`,
        'jwks_unavailable',
      );
    }

    if (!response.ok) {
      throw new ZevAuthVerifyError(
        `Could not read the ZevAuth discovery document for ${environmentId} ` +
          `(${response.status}). Check the environment id and apiUrl.`,
        'jwks_unavailable',
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
      keys: createRemoteJWKSet(new URL(document.jwks_uri), {
        cooldownDuration: cooldownSeconds * 1000,
        cacheMaxAge: 10 * 60 * 1000,
        ...(doFetch !== globalThis.fetch
          ? { [customFetch]: (url: string, init: RequestInit) => doFetch(url, init) }
          : {}),
      }),
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
  let issuer: string;
  let keys: Parameters<typeof jwtVerify>[1];

  if (options.jwks) {
    if (!options.issuer) {
      throw new Error('verifyZevAuthToken: `issuer` is required when `jwks` is given.');
    }
    issuer = options.issuer;
    keys = createLocalJWKSet(options.jwks) as Parameters<typeof jwtVerify>[1];
  } else {
    const apiUrl = options.apiUrl ?? 'https://api.zevauth.net';
    const found = await discover(options.environmentId, apiUrl, options.fetch, options.jwksCooldownSeconds);
    issuer = options.issuer ?? found.issuer;
    keys = found.keys as Parameters<typeof jwtVerify>[1];
  }

  try {
    const { payload } = await jwtVerify(token, keys as never, {
      issuer,
      audience: options.environmentId,
      algorithms: ALGORITHMS,
      clockTolerance: options.clockSkewSeconds ?? DEFAULT_SKEW_SECONDS,
      ...(options.currentDate ? { currentDate: options.currentDate } : {}),
    });
    return payload as ZevAuthClaims;
  } catch (error) {
    throw toVerifyError(error);
  }
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


/** The verify options; every field but `environmentId` is optional. */
export type ZevAuthServerConfig = VerifyOptions;

export interface ServerAuth {
  isSignedIn: boolean;
  userId: string | null;
  sessionId: string | null;
  organizationId: string | null;
  organizationRole: string | null;
  claims: ZevAuthClaims | null;
  /**
   * What the session must still do, e.g. `setup_mfa` when the app
   * requires two-step verification and this person has none yet.
   * `requireAuth` refuses such a session unless told otherwise.
   */
  pendingTasks: string[];
  /** Whether this session passed a second factor at sign-in. */
  isMfaVerified: boolean;
  /** True when a permission is present on the active organization. */
  has: (check: { role?: string; permission?: string }) => boolean;
}

const SIGNED_OUT: ServerAuth = {
  isSignedIn: false,
  userId: null,
  sessionId: null,
  organizationId: null,
  organizationRole: null,
  claims: null,
  pendingTasks: [],
  isMfaVerified: false,
  has: () => false,
};

/**
 * Who is calling, from a request.
 *
 * ── Why this takes a Request rather than reading a global ─────────
 * Every framework reaches the current request differently, and most
 * have changed how between versions. Taking it explicitly means this
 * works in all of them and does not break on their next release.
 *
 * ── Why a failed verification is "signed out", not an error ───────
 * An expired token, a tampered one and no token at all are the same
 * thing to a page deciding what to render: nobody is signed in.
 * Throwing would make every server component wrap this in a try, and
 * the first one to forget would return a 500 to somebody whose session
 * simply lapsed.
 */
export async function getAuth(
  request: Request,
  config: ZevAuthServerConfig,
): Promise<ServerAuth> {
  const token = bearerFrom(request.headers.get('authorization'));
  if (!token) return SIGNED_OUT;

  try {
    const claims = await verifyZevAuthToken(token, config);

    return {
      isSignedIn: true,
      userId: claims.sub,
      sessionId: claims.sid,
      organizationId: claims.org_id ?? null,
      organizationRole: claims.org_role ?? null,
      claims,
      pendingTasks: claims.pending_tasks ?? [],
      isMfaVerified: (claims.amr ?? []).includes('mfa'),
      has: ({ role, permission }) => {
        if (!claims.org_id) return false;
        if (role && claims.org_role !== role) return false;
        if (permission && !(claims.org_permissions ?? []).includes(permission)) {
          return false;
        }
        return Boolean(role || permission);
      },
    };
  } catch {
    return SIGNED_OUT;
  }
}

/**
 * The same, but refuses instead of reporting.
 *
 * For API routes, where "signed out" is a 401 rather than a different
 * page. It throws a `Response`, which React Router, TanStack Start,
 * Astro and Next.js all return as-is when a loader or handler throws
 * one; elsewhere, catch it and send it yourself.
 */
export async function requireAuth(
  request: Request,
  config: ZevAuthServerConfig,
  options: {
    /**
     * Serve a session that still has pending tasks (`setup_mfa`). Only
     * for routes that help finish the task; everything else should leave
     * this off, so a person cannot skip a step the app requires.
     */
    allowPendingTasks?: boolean;
    /** Refuse unless this session passed a second factor at sign-in. */
    requireMfa?: boolean;
  } = {},
): Promise<ServerAuth> {
  const auth = await getAuth(request, config);

  if (!auth.isSignedIn) {
    throw refusal(401, 'unauthorized', 'Sign in to continue.');
  }
  // Never true for a token without the claim, so routes written before
  // MFA existed behave exactly as they did.
  if (auth.pendingTasks.length > 0 && !options.allowPendingTasks) {
    throw refusal(403, 'session_task_pending', 'Finish setting up two-step verification to continue.', {
      pendingTasks: auth.pendingTasks,
    });
  }
  if (options.requireMfa && !auth.isMfaVerified) {
    throw refusal(403, 'mfa_required', 'Sign in with two-step verification to continue.');
  }

  return auth;
}

function refusal(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ error: { code, message, ...extra } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
