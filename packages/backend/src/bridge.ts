/**
 * The session bridge: ZevAuth sessions on server-rendered pages.
 *
 * ── The problem ───────────────────────────────────────────────────
 * A ZevAuth session lives in the browser: the SDK holds a refresh token
 * and a short-lived access token, and sends the access token with its
 * own requests. A page rendered on the server (PHP, Rails, Django, an
 * Express template) is requested by the browser itself, with no
 * `Authorization` header, so the server cannot tell who is asking.
 *
 * ── The bridge ────────────────────────────────────────────────────
 * The browser SDK, given `sessionBridge: { url }`, posts every new
 * access token to an endpoint on the developer's own server. That
 * endpoint (`handleSessionBridge`) verifies it and stores it in the
 * developer's own HttpOnly cookie. Page requests then carry the cookie,
 * and `authenticateRequest` reads it.
 *
 * ── Why the server never refreshes ────────────────────────────────
 * Refresh tokens rotate, and ZevAuth treats a refresh token used twice
 * as stolen and ends the session (there is no grace window). A server
 * refreshing alongside the browser would race it and sign the person
 * out. So the refresh token never leaves the browser; only access
 * tokens cross the bridge, and only the browser makes new ones.
 *
 * ── When the cookie has expired: the handshake ────────────────────
 * Access tokens live minutes. A page requested after the token in the
 * cookie expired gets a redirect to a tiny handshake page, which loads
 * the SDK, lets it refresh, posts the new token over the bridge, and
 * returns to the original URL. A marker on the way back stops a second
 * handshake, so there is no redirect loop: if the browser has no session
 * either, the page simply renders signed out.
 *
 * The full protocol, shared by every ZevAuth server SDK, is in
 * spec/SERVER_SDK.md ("Session bridge").
 */
import {
  bearerFrom,
  verifyZevAuthToken,
  ZevAuthVerifyError,
  type ServerAuth,
  type VerifyOptions,
  type ZevAuthClaims,
} from './verify.js';

/** The header the browser SDK sends; a cross-site form cannot add it. */
export const BRIDGE_HEADER = 'x-zevauth-bridge';
/** Added to the return URL after a handshake, so it runs once. */
export const HANDSHAKE_MARKER = '__zevauth_handshake';

export interface BridgeConfig extends VerifyOptions {
  /**
   * Origins allowed to post tokens, e.g. `['https://app.example.com']`.
   * Defaults to the bridge request's own origin, which is right when the
   * pages and the bridge are served from the same host.
   */
  allowedOrigins?: string[];
  /**
   * Share the cookie with subdomains, e.g. `.example.com`. Leave unset
   * to keep it on the exact host (and get the stricter `__Host-` name).
   */
  cookieDomain?: string;
  /**
   * `Secure` cookies. Leave on; turn off only for plain-http local
   * development, since Safari refuses `Secure` cookies on `http://localhost`.
   */
  secure?: boolean;
  /** Where the handshake page is served. Defaults to `/zevauth/handshake`. */
  handshakePath?: string;
}

export interface BridgedAuth extends ServerAuth {
  /**
   * The browser has a session but the cookie's token has expired: run
   * the handshake (`authenticateRequest` does it for you).
   */
  needsHandshake: boolean;
}

/** The cookie names for this configuration. */
export function bridgeCookieNames(config: Pick<BridgeConfig, 'cookieDomain' | 'secure'>): {
  session: string;
  client: string;
} {
  const prefix = config.secure === false ? '' : config.cookieDomain ? '__Secure-' : '__Host-';
  return { session: `${prefix}zevauth_session`, client: `${prefix}zevauth_client` };
}

/**
 * The bridge endpoint. Mount it at the URL you give the browser SDK as
 * `sessionBridge.url`, for POST.
 *
 *   app.post('/zevauth/session', (req) => handleSessionBridge(req, config))
 */
export async function handleSessionBridge(request: Request, config: BridgeConfig): Promise<Response> {
  if (request.method !== 'POST') {
    return json(405, { error: { code: 'method_not_allowed', message: 'The session bridge accepts POST only.' } }, { allow: 'POST' });
  }

  /*
   * Two checks against login CSRF: a page elsewhere posting ITS OWN valid
   * token to sign the visitor in as somebody else. The custom header
   * cannot be set by a plain cross-site form, and forces a CORS preflight
   * from script; the Origin check refuses what slips through.
   */
  if (request.headers.get(BRIDGE_HEADER) !== '1') {
    return json(403, { error: { code: 'bridge_header_missing', message: `Send the ${BRIDGE_HEADER}: 1 header. The ZevAuth browser SDK does this for you.` } });
  }
  const origin = request.headers.get('origin');
  const allowed = config.allowedOrigins ?? [new URL(request.url).origin];
  if (origin && !allowed.includes(origin)) {
    return json(403, { error: { code: 'bridge_origin_not_allowed', message: `${origin} may not post sessions here. Add it to allowedOrigins.` } });
  }

  let body: { token?: unknown };
  try {
    body = (await request.json()) as { token?: unknown };
  } catch {
    return json(400, { error: { code: 'invalid_request', message: 'Expected a JSON body: { "token": string | null }.' } });
  }

  const names = bridgeCookieNames(config);
  if (body.token === null || body.token === undefined || body.token === '') {
    return empty(204, [clearCookie(names.session, config), clearCookie(names.client, config)]);
  }
  if (typeof body.token !== 'string') {
    return json(400, { error: { code: 'invalid_request', message: '`token` must be a string or null.' } });
  }

  let claims: ZevAuthClaims;
  try {
    claims = await verifyZevAuthToken(body.token, config);
  } catch (error) {
    // A token that does not verify also ends whatever was there, so a
    // stale cookie never outlives a refusal.
    return json(
      401,
      { error: { code: 'unauthorized', message: 'That session token was refused.', reason: error instanceof ZevAuthVerifyError ? error.code : 'malformed_token' } },
      {},
      [clearCookie(names.session, config), clearCookie(names.client, config)],
    );
  }

  const now = Math.floor((config.currentDate?.getTime() ?? Date.now()) / 1000);
  const maxAge = Math.max(0, (claims.exp ?? now) - now);
  return empty(204, [
    // The access token, until it expires. Never the refresh token.
    cookie(names.session, body.token, maxAge, config),
    /*
     * "This browser has a ZevAuth session", outliving the token. Without
     * it an expired-and-deleted session cookie looks exactly like nobody
     * ever signed in, and the handshake could never be offered. It holds
     * no credential; the bridge clears it on sign-out.
     */
    cookie(names.client, '1', 30 * 24 * 60 * 60, config),
  ]);
}

/**
 * Who is asking: the `Authorization` header first (API calls from the
 * SDK), then the bridge cookie (page requests).
 */
export async function getAuth(request: Request, config: BridgeConfig): Promise<BridgedAuth> {
  const header = bearerFrom(request.headers.get('authorization'));
  const cookies = parseCookies(request.headers.get('cookie'));
  const names = bridgeCookieNames(config);
  const token = header ?? cookies.get(names.session) ?? null;
  const hasClient = cookies.get(names.client) === '1';

  if (!token) {
    return { ...signedOut(), needsHandshake: !header && hasClient };
  }

  try {
    const claims = await verifyZevAuthToken(token, config);
    return { ...authFrom(claims), needsHandshake: false };
  } catch (error) {
    const expired = error instanceof ZevAuthVerifyError && error.code === 'token_expired';
    return { ...signedOut(), needsHandshake: !header && (expired || hasClient) };
  }
}

/**
 * The usual entry point for a page request:
 *
 *   const { auth, handshake } = await authenticateRequest(request, config);
 *   if (handshake) return handshake;
 *
 * `handshake` is a redirect for a page navigation, or a 401 with
 * `session_refresh_required` for anything else (an API call should send
 * the SDK's token in `Authorization` instead of relying on the cookie).
 */
export async function authenticateRequest(
  request: Request,
  config: BridgeConfig,
): Promise<{ auth: BridgedAuth; handshake: Response | null }> {
  const auth = await getAuth(request, config);
  if (!auth.needsHandshake) return { auth, handshake: null };

  const url = new URL(request.url);
  // Back from a handshake and still no session: render signed out.
  if (url.searchParams.has(HANDSHAKE_MARKER)) return { auth, handshake: null };

  const isNavigation =
    (request.method === 'GET' || request.method === 'HEAD') &&
    (request.headers.get('accept') ?? '').includes('text/html');

  if (!isNavigation) {
    return {
      auth,
      handshake: json(401, { error: { code: 'session_refresh_required', message: 'The session cookie expired. Send the SDK token in Authorization, or reload the page.' } }),
    };
  }

  const target = new URL(config.handshakePath ?? '/zevauth/handshake', url.origin);
  target.searchParams.set('redirect_url', url.pathname + url.search);
  return { auth, handshake: new Response(null, { status: 302, headers: { location: target.pathname + target.search, 'cache-control': 'no-store' } }) };
}

export interface HandshakePageOptions {
  publishableKey: string;
  /** The bridge endpoint's path, e.g. `/zevauth/session`. */
  bridgePath: string;
  apiUrl?: string;
  /** Where to load `@zevauth/ui` from. Defaults to jsDelivr, major version 0. */
  uiScriptUrl?: string;
}

/**
 * The handshake page. Serve it at `handshakePath` for GET.
 *
 * Plain HTML and one script tag, so it works on any stack. It loads the
 * SDK (which refreshes the session if the browser has one), posts the
 * new token over the bridge, and goes back to where it was asked from.
 */
export function handshakePage(request: Request, options: HandshakePageOptions): Response {
  const url = new URL(request.url);
  const requested = url.searchParams.get('redirect_url') ?? '/';
  // Same-site paths only. `//evil.example` and `/\evil.example` are
  // absolute URLs to a browser, and would make this an open redirect.
  const safe = /^\/(?![/\\])/.test(requested) ? requested : '/';
  const back = new URL(safe, url.origin);
  back.searchParams.set(HANDSHAKE_MARKER, '1');

  const config = JSON.stringify({
    publishableKey: options.publishableKey,
    apiUrl: options.apiUrl,
    bridge: options.bridgePath,
    back: back.pathname + back.search,
  }).replace(/</g, '\\u003c');
  const script = options.uiScriptUrl ?? 'https://cdn.jsdelivr.net/npm/@zevauth/ui@0/dist/zevauth-ui.global.js';

  const html = `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Signing in…</title>
<script src="${escapeAttribute(script)}"></script>
<script>
(async function () {
  var c = ${config};
  try {
    window.ZevAuthUI.init({ publishableKey: c.publishableKey, apiUrl: c.apiUrl, sessionBridge: { url: c.bridge } });
    var client = window.ZevAuthUI.getClient();
    await client.load();
    await client.syncSessionBridge();
  } catch (e) {}
  location.replace(c.back);
})();
</script>`;

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'same-origin' },
  });
}

// ── helpers ─────────────────────────────────────────────────────

function authFrom(claims: ZevAuthClaims): ServerAuth {
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
      if (permission && !(claims.org_permissions ?? []).includes(permission)) return false;
      return Boolean(role || permission);
    },
  };
}

function signedOut(): ServerAuth {
  return {
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
}

function cookie(name: string, value: string, maxAge: number, config: BridgeConfig): string {
  const parts = [`${name}=${value}`, 'Path=/', `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Lax'];
  if (config.secure !== false) parts.push('Secure');
  if (config.cookieDomain) parts.push(`Domain=${config.cookieDomain}`);
  return parts.join('; ');
}

function clearCookie(name: string, config: BridgeConfig): string {
  return cookie(name, '', 0, config);
}

function parseCookies(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) out.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  return out;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}, cookies: string[] = []): Response {
  const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status, headers: h });
}

function empty(status: number, cookies: string[]): Response {
  const h = new Headers({ 'cache-control': 'no-store' });
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(null, { status, headers: h });
}

function escapeAttribute(value: string): string {
  return value.replace(/[&"<>]/g, (ch) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[ch] ?? ch);
}
