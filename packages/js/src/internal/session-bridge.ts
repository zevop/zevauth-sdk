/**
 * Posts the current access token to the developer's own server.
 *
 * For server-rendered apps (PHP, Rails, Django, Express templates):
 * their pages are requested by the browser with no `Authorization`
 * header, so the server cannot see the session. With
 * `sessionBridge: { url }`, every time the token changes the SDK sends
 * it to that endpoint, which stores it in the developer's own HttpOnly
 * cookie. The refresh token never leaves the browser, because the
 * browser is the only thing allowed to refresh. See spec/SERVER_SDK.md,
 * "Session bridge".
 */
export interface SessionBridgeOptions {
  /**
   * The developer's endpoint, same-site with the page, e.g.
   * `/zevauth/session`. Receives `POST { token: string | null }` with
   * the `x-zevauth-bridge: 1` header and the page's cookies.
   */
  url: string;
}

export class SessionBridge {
  /** `undefined` until the first post: nothing has been told yet. */
  private sent: string | null | undefined = undefined;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly options: SessionBridgeOptions,
    private readonly doFetch: typeof fetch,
  ) {}

  /**
   * Called on every state change. Posts only when the token changed, and
   * never posts "signed out" on a first page load that simply has no
   * session: there is nothing to clear, and a signed-out visitor should
   * not cost the developer's server a request per page.
   */
  observe(token: string | null): void {
    if (token === this.sent) return;
    if (this.sent === undefined && token === null) return;
    this.enqueue(token);
  }

  /**
   * Posts the current state now, whatever was sent before, and resolves
   * once the server has answered. The handshake page uses it to know
   * the cookie is in place before it navigates back.
   */
  sync(token: string | null): Promise<void> {
    return this.enqueue(token);
  }

  /*
   * One post at a time, in order. Two quick changes (a refresh, then an
   * organization switch) must not arrive reversed and leave the cookie
   * holding the older token.
   */
  private enqueue(token: string | null): Promise<void> {
    this.sent = token;
    this.queue = this.queue.then(() => this.post(token)).catch(() => {});
    return this.queue;
  }

  private async post(token: string | null): Promise<void> {
    try {
      await this.doFetch(this.options.url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-zevauth-bridge': '1' },
        body: JSON.stringify({ token }),
      });
    } catch {
      /*
       * A bridge that cannot be reached costs the server-rendered pages
       * their view of the session, nothing more: the SDK's own session
       * is untouched, and the next change tries again.
       */
    }
  }
}
