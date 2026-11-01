import { bearerFrom, verifyZevAuthToken, type VerifyOptions, type ZevAuthClaims } from './verify.js';

/**
 * `environmentId` and `apiUrl`, plus any option the shared verifier
 * takes (`clockSkewSeconds`, a local `jwks` with its `issuer`…).
 */
export interface ZevAuthServerConfig extends VerifyOptions {}

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
 * For route handlers, where "signed out" is a 401 rather than a
 * different page. It throws a `Response` so a handler can let it
 * propagate, which is the shape Next understands.
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
