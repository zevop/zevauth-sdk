import { getAuth, type ServerAuth, type ZevAuthServerConfig } from './auth.js';

export interface RouteMatcher {
  /** Paths that require a signed-in user. Everything else is public. */
  protected?: Array<string | RegExp>;
  /** Paths that stay public even if they match `protected`. */
  public?: Array<string | RegExp>;
}

export interface MiddlewareOptions extends ZevAuthServerConfig, RouteMatcher {
  /** Where to send a signed-out visitor. Defaults to `/sign-in`. */
  signInUrl?: string;
  /**
   * Called for every request, after auth is resolved.
   * Return a `Response` to take over; return nothing to continue.
   */
  onRequest?: (
    auth: ServerAuth,
    request: Request,
  ) => Response | undefined | Promise<Response | undefined>;
}

/**
 * Route protection for Next.js middleware.
 *
 * ── Why protection is opt-IN, path by path ────────────────────────
 * The tempting default is "everything is protected unless listed",
 * because it fails closed. In middleware it fails closed onto the
 * SIGN-IN PAGE too, and onto the callback the sign-in redirects to — so
 * the app redirect-loops and the developer's first experience of the
 * library is an infinite bounce they have to debug. Listing what to
 * protect is explicit, and the mistake it allows (forgetting a route) is
 * caught by the server check that has to exist anyway.
 *
 * ── This is not the security boundary ─────────────────────────────
 * Middleware decides what to RENDER. Data is protected by the check in
 * the route handler or the API, against the verified token. A page that
 * middleware forgot must still refuse to hand over anything.
 */
export function createZevAuthMiddleware(options: MiddlewareOptions) {
  const protectedRoutes = options.protected ?? [];
  const publicRoutes = options.public ?? [];
  const signInUrl = options.signInUrl ?? '/sign-in';

  return async function middleware(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url);
    const path = url.pathname;

    const auth = await getAuth(request, {
      environmentId: options.environmentId,
      apiUrl: options.apiUrl,
    });

    if (options.onRequest) {
      const taken = await options.onRequest(auth, request);
      if (taken) return taken;
    }

    const isPublic = matches(path, publicRoutes);
    const needsAuth = !isPublic && matches(path, protectedRoutes);

    if (!needsAuth || auth.isSignedIn) return undefined;

    /*
     * Where they were going travels with the redirect, so signing in
     * returns them there instead of dumping everybody on a dashboard.
     * The path only — never the full URL — because echoing an absolute
     * URL back into a redirect is how an open redirect is built.
     */
    const destination = new URL(signInUrl, url.origin);
    destination.searchParams.set('redirect_url', path + url.search);

    return new Response(null, {
      status: 307,
      headers: { Location: destination.toString() },
    });
  };
}

/**
 * Whether a path matches a rule.
 *
 * A string matches the path itself or anything beneath it, so
 * `/dashboard` covers `/dashboard/settings` — which is what somebody
 * writing that rule means. `/` would otherwise match everything, so it
 * is treated as exact.
 */
function matches(path: string, rules: Array<string | RegExp>): boolean {
  return rules.some((rule) => {
    if (rule instanceof RegExp) return rule.test(path);
    if (rule === '/') return path === '/';
    return path === rule || path.startsWith(`${rule}/`);
  });
}
