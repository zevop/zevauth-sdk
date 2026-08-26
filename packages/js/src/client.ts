import { Http } from './internal/http.js';
import { RefreshCoordinator } from './internal/refresh-coordinator.js';
import {
  TokenStore,
  defaultStorage,
  type SessionStorageAdapter,
} from './internal/tokens.js';
import { SignInFlow, type SessionResponse } from './flows/sign-in.js';
import { SignUpFlow } from './flows/sign-up.js';
import { PasswordResetFlow } from './flows/password-reset.js';
import { OrganizationsFlow } from './flows/organizations.js';
import { UserFlow } from './flows/user.js';
import {
  ZevAuthError,
  type Branding,
  type ActiveOrganization,
  type EnvironmentConfig,
  type SignInMethod,
  type ZevAuthState,
  type ZevAuthUser,
} from './types.js';

export interface ZevAuthOptions {
  publishableKey: string;
  /** Defaults to the API the key belongs to. Override for self-hosting. */
  apiUrl?: string;
  storage?: SessionStorageAdapter;
  fetch?: typeof globalThis.fetch;
}

/**
 * How early a token is refreshed, in seconds.
 *
 * A request that leaves with 4 seconds of validity left can still arrive
 * expired: the network takes time and clocks disagree. Refreshing on the
 * last second produces intermittent 401s that look like a server bug.
 */
const REFRESH_SKEW_SECONDS = 60;

export class ZevAuth {
  private readonly http: Http;
  private readonly tokens: TokenStore;
  private readonly coordinator: RefreshCoordinator;
  private readonly listeners = new Set<(state: ZevAuthState) => void>();

  private environment: EnvironmentConfig | null = null;
  private loaded = false;

  /** Every way in. */
  readonly signIn: SignInFlow;
  readonly signUp: SignUpFlow;
  readonly passwordReset: PasswordResetFlow;
  readonly organizations: OrganizationsFlow;
  /** The profile as the server has it now, not as the token remembers it. */
  readonly me: UserFlow;

  constructor(options: ZevAuthOptions) {
    if (!options.publishableKey?.startsWith('pk_')) {
      /*
       * Caught at construction rather than at the first request. Passing
       * a SECRET key here is the mistake worth failing loudly on: it
       * would ship a key with full account access inside a browser
       * bundle, and it would otherwise work perfectly until somebody
       * read the JavaScript.
       */
      throw new ZevAuthError(
        'A publishable key is required. It starts with `pk_`. Never put a secret key in a browser.',
        'invalid_publishable_key',
        0,
      );
    }

    this.http = new Http({
      baseUrl: options.apiUrl ?? inferApiUrl(options.publishableKey),
      publishableKey: options.publishableKey,
      fetch: options.fetch,
    });

    this.tokens = new TokenStore(
      options.storage ?? defaultStorage(),
      environmentOf(options.publishableKey),
    );

    this.coordinator = new RefreshCoordinator({
      read: () => this.tokens.readPersisted(),
      perform: (refreshToken) => this.performRefresh(refreshToken),
    });

    const adopt = (response: SessionResponse) => this.adopt(response);
    this.signIn = new SignInFlow(this.http, adopt);
    this.signUp = new SignUpFlow(this.http, adopt);
    this.passwordReset = new PasswordResetFlow(this.http);

    const token = () => this.getToken();
    this.organizations = new OrganizationsFlow(this.http, token, (id) =>
      this.setActiveOrganization(id),
    );
    this.me = new UserFlow(this.http, token, (user) => this.replaceUser(user));
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  /**
   * Prepares the SDK: reads the environment, restores any session, and
   * completes a hosted-page handoff if the URL carries one.
   *
   * Everything else waits on this. Calling a flow before it resolves is
   * allowed — the call simply awaits the same promise — so an app never
   * has to sequence its own startup.
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    this.environment = await this.http.get<EnvironmentConfig>('/v1/environment');

    await this.completeHandoffIfPresent();

    if (!this.tokens.getUser()) {
      // A stored refresh token but no user in memory is the normal state
      // on a fresh page load.
      await this.restore();
    }

    this.loaded = true;
    this.emit();
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  get user(): ZevAuthUser | null {
    return this.tokens.getUser();
  }

  get organization(): ActiveOrganization | null {
    return this.tokens.getOrganization();
  }

  get signInMethods(): SignInMethod[] {
    return this.environment?.signInMethods ?? [];
  }

  get isTestMode(): boolean {
    return this.environment?.isTestMode ?? false;
  }

  /** The developer's brand, for anything the SDK renders. */
  get branding(): Branding | null {
    return this.environment?.branding ?? null;
  }

  /**
   * The environment this key resolves to, e.g. `env_live_…`.
   *
   * Public: it is already the audience inside every token this app
   * holds. Used for attribution links and for telling test from
   * production in a log.
   */
  get environmentId(): string | null {
    return this.environment?.id ?? null;
  }

  /** Subscribe to sign-in, sign-out and organization changes. */
  addListener(listener: (state: ZevAuthState) => void): () => void {
    this.listeners.add(listener);
    // Called immediately, so a subscriber never renders a frame against
    // state it has not been told about yet.
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  // ── Credentials for the developer's own API ─────────────────────

  /**
   * A valid access token, refreshing first if it is close to expiry.
   *
   * This is what an application attaches to its own API calls. It is a
   * method rather than a property on purpose: a property would hand back
   * whatever was last minted, including an expired one, and the caller
   * would have no way to know.
   */
  async getToken(): Promise<string | null> {
    const stored = this.tokens.readPersisted();
    if (!stored) return null;

    const isNearExpiry =
      stored.expiresAt - Date.now() < REFRESH_SKEW_SECONDS * 1000;

    if (isNearExpiry || !this.tokens.getAccessToken()) {
      await this.coordinator.refresh();
    }

    return this.tokens.getAccessToken();
  }

  // ── Session ─────────────────────────────────────────────────────

  async signOut(): Promise<void> {
    const stored = this.tokens.readPersisted();

    if (stored) {
      try {
        await this.http.post('/v1/auth/signout', {
          refreshToken: stored.refreshToken,
        });
      } catch {
        /*
         * Local sign-out happens regardless.
         *
         * If the network is down, the person clicking "sign out" on a
         * shared machine must still end up signed out on that machine.
         * The server-side session expires on its own; leaving the tokens
         * in storage because a request failed is the worse outcome by
         * far.
         */
      }
    }

    this.tokens.clear();
    this.emit();
  }

  /**
   * Switches the active organization, rotating the session's tokens.
   *
   * Pass `null` to return to personal scope. The tokens change because
   * the organization is a CLAIM inside them: an app that kept the old
   * access token would keep acting as the old organization until it
   * expired.
   */
  async setActiveOrganization(organizationId: string | null): Promise<void> {
    const stored = this.tokens.readPersisted();
    if (!stored) {
      throw new ZevAuthError(
        'Nobody is signed in.',
        'not_authenticated',
        401,
      );
    }

    const response = await this.http.post<SessionResponse>(
      '/v1/auth/switch-organization',
      { refreshToken: stored.refreshToken, organizationId },
    );

    this.adopt(response);
  }

  // ── Internals ───────────────────────────────────────────────────

  /** Adopts a session response and tells everyone about it. */
  private adopt(response: SessionResponse): void {
    this.tokens.write({
      accessToken: response.session.accessToken,
      refreshToken: response.session.refreshToken,
      expiresIn: response.session.expiresIn,
      user: response.user,
      organization: response.session.organization ?? null,
    });
    this.emit();
  }

  /**
   * Swaps in a freshly-updated profile without touching the session.
   *
   * The tokens are untouched on purpose: a name change does not need new
   * credentials, and minting them would mean a rotation — and a
   * rotation for a profile edit is a refresh nobody asked for.
   */
  private replaceUser(user: ZevAuthUser): void {
    const stored = this.tokens.readPersisted();
    if (!stored) return;

    this.tokens.write({
      accessToken: this.tokens.getAccessToken() ?? '',
      refreshToken: stored.refreshToken,
      expiresIn: Math.max(
        0,
        Math.round((stored.expiresAt - Date.now()) / 1000),
      ),
      user,
      organization: this.tokens.getOrganization(),
    });
    this.emit();
  }

  private async restore(): Promise<void> {
    const stored = this.tokens.readPersisted();
    if (!stored) return;

    try {
      await this.coordinator.refresh();
    } catch (err) {
      /*
       * A refresh that fails on startup means the session is over:
       * expired, revoked, or burned by reuse detection. Clearing is the
       * only sane response — retrying would present the same dead token
       * and, if the session was burned, keep tripping the alarm.
       */
      this.tokens.clear();
      if (!(err instanceof ZevAuthError)) throw err;
    }
  }

  private async performRefresh(refreshToken: string): Promise<void> {
    const response = await this.http.post<SessionResponse>('/v1/auth/refresh', {
      refreshToken,
    });
    this.adopt(response);
  }

  /**
   * Finishes a sign-in that started on a hosted page.
   *
   * The person clicked a magic link, landed on `accounts.zevauth.com`,
   * and was redirected back here with a one-time code. Exchanging it is
   * where the session is finally minted — on this origin, with this
   * app's own key.
   */
  private async completeHandoffIfPresent(): Promise<void> {
    const location = globalThis.location;
    if (!location) return;

    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    if (!code) return;

    try {
      const response = await this.http.post<SessionResponse>(
        '/v1/auth/handoff/exchange',
        { code },
      );
      this.adopt(response);
    } finally {
      /*
       * The code leaves the URL whether or not it worked.
       *
       * It is single use, so a code left in the address bar is a stale
       * credential that gets copied into chat, saved in a bookmark, and
       * reported as "the link stopped working" on the second visit.
       * `replaceState` removes it without adding a history entry.
       */
      url.searchParams.delete('code');
      globalThis.history?.replaceState({}, '', url.toString());
    }
  }

  private snapshot(): ZevAuthState {
    return {
      isLoaded: this.loaded,
      user: this.tokens.getUser(),
      organization: this.tokens.getOrganization(),
    };
  }

  private emit(): void {
    const state = this.snapshot();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // One badly-behaved subscriber must not stop the others being
        // told that the user just signed out.
      }
    }
  }
}

/** `pk_test_…` / `pk_live_…` → the environment it belongs to. */
function environmentOf(publishableKey: string): string {
  const [, kind] = publishableKey.split('_');
  return kind === 'live' ? 'live' : 'test';
}

/**
 * Where the API lives, derived from the key's own prefix.
 *
 * Saves every developer a configuration line they would otherwise get
 * wrong once. Overridable for self-hosting and for local development.
 */
function inferApiUrl(publishableKey: string): string {
  void publishableKey;
  return 'https://api.zevauth.net';
}
