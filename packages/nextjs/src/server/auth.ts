import { bearerFrom, verifyZevAuthToken, type ZevAuthClaims } from './verify.js';

export interface ZevAuthServerConfig {
  environmentId: string;
  apiUrl?: string;
}

export interface ServerAuth {
  isSignedIn: boolean;
  userId: string | null;
  sessionId: string | null;
  organizationId: string | null;
  organizationRole: string | null;
  claims: ZevAuthClaims | null;
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
  has: () => false,
};

/**
 * Who is calling, from a request.
 *
 * ── Why this takes a Request rather than reading a global ─────────
 * Next.js has had three different ways to reach the current request
 * across its recent versions, and each has behaved differently in the
 * app router, the pages router, route handlers and middleware. Taking
 * the request explicitly means this works in all of them and does not
 * break on their next release.
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
 * For route handlers, where "signed out" is a 401 rather than a
 * different page. It throws a `Response` so a handler can let it
 * propagate, which is the shape Next understands.
 */
export async function requireAuth(
  request: Request,
  config: ZevAuthServerConfig,
): Promise<ServerAuth> {
  const auth = await getAuth(request, config);

  if (!auth.isSignedIn) {
    throw new Response(
      JSON.stringify({
        error: { code: 'unauthorized', message: 'Sign in to continue.' },
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return auth;
}
