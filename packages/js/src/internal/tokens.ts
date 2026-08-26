import type { ActiveOrganization, ZevAuthUser } from '../types';

/**
 * Where the session lives between page loads.
 *
 * ── The access token is deliberately NOT persisted ────────────────
 * It sits in memory only. It is short-lived and it is the credential a
 * developer's own API accepts, so the cost of writing it anywhere a
 * script can read is high and the benefit is one avoided refresh on
 * reload. On a fresh page load the SDK exchanges the refresh token for a
 * new access token, which takes one request and starts the session
 * clean.
 *
 * ── The refresh token IS persisted, and here is the honest trade ──
 * A session has to survive a reload, and the browser gives us three
 * options: a first-party cookie (impossible from a script on a different
 * origin to the API), a third-party cookie (blocked by every modern
 * browser), or storage. Storage is readable by any script on the page,
 * so an XSS on the developer's site can take the refresh token.
 *
 * What makes that survivable rather than fatal is rotation with reuse
 * detection: a stolen token buys the attacker at most one refresh before
 * the real client's next refresh trips the alarm, and the server burns
 * the entire session. It is not a substitute for not having XSS, and the
 * SDK docs say so rather than implying storage is safe.
 */
export interface StoredSession {
  refreshToken: string;
  /** Epoch ms. When the ACCESS token expires, not the refresh token. */
  expiresAt: number;
}

export interface SessionStorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** `localStorage`, when there is one. */
export function defaultStorage(): SessionStorageAdapter {
  try {
    const probe = '__zevauth_probe__';
    globalThis.localStorage?.setItem(probe, '1');
    globalThis.localStorage?.removeItem(probe);
    return {
      get: (key) => globalThis.localStorage.getItem(key),
      set: (key, value) => globalThis.localStorage.setItem(key, value),
      remove: (key) => globalThis.localStorage.removeItem(key),
    };
  } catch {
    /*
     * Private mode, disabled storage, a sandboxed iframe. An in-memory
     * store keeps the SDK working for the life of the page instead of
     * throwing on construction, and the session simply does not survive
     * a reload — which is the correct outcome when the browser has told
     * us not to persist anything.
     */
    const memory = new Map<string, string>();
    return {
      get: (key) => memory.get(key) ?? null,
      set: (key, value) => memory.set(key, value),
      remove: (key) => memory.delete(key),
    };
  }
}

export class TokenStore {
  /** Memory only. See the note above. */
  private accessToken: string | null = null;
  private user: ZevAuthUser | null = null;
  private organization: ActiveOrganization | null = null;

  private readonly key: string;

  constructor(
    private readonly storage: SessionStorageAdapter,
    environmentId: string,
  ) {
    /*
     * Namespaced by environment. A developer running test and production
     * builds on the same localhost origin would otherwise have one
     * clobber the other, and the resulting "signed in as the wrong user"
     * is baffling to debug.
     */
    this.key = `zevauth.session.${environmentId}`;
  }

  readPersisted(): StoredSession | null {
    const raw = this.storage.get(this.key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredSession;
      if (typeof parsed?.refreshToken !== 'string') return null;
      return parsed;
    } catch {
      // Corrupt or from an older shape. Treat as signed out rather than
      // throwing on load and bricking the app.
      this.storage.remove(this.key);
      return null;
    }
  }

  write(params: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: ZevAuthUser;
    organization: ActiveOrganization | null;
  }): void {
    this.accessToken = params.accessToken;
    this.user = params.user;
    this.organization = params.organization;

    this.storage.set(
      this.key,
      JSON.stringify({
        refreshToken: params.refreshToken,
        expiresAt: Date.now() + params.expiresIn * 1000,
      } satisfies StoredSession),
    );
  }

  clear(): void {
    this.accessToken = null;
    this.user = null;
    this.organization = null;
    this.storage.remove(this.key);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getUser(): ZevAuthUser | null {
    return this.user;
  }

  getOrganization(): ActiveOrganization | null {
    return this.organization;
  }
}
