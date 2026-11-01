import { takePendingPkce } from './internal/pkce.js';
import type { HandoffError } from './types.js';
import { Http } from './internal/http.js';
import { RefreshCoordinator } from './internal/refresh-coordinator.js';
import {
  TokenStore,
  defaultStorage,
  type SessionStorageAdapter,
} from './internal/tokens.js';
import { SignInFlow, type SessionResponse, type SignInResponse } from './flows/sign-in.js';
import { MfaFlow } from './flows/mfa.js';
import { SignUpFlow } from './flows/sign-up.js';
import { PasswordResetFlow } from './flows/password-reset.js';
import { OrganizationsFlow } from './flows/organizations.js';
import { UserFlow } from './flows/user.js';
import {
  ZevAuthError,
  type Branding,
  type ActiveOrganization,
  type EnvironmentConfig,
  type OrganizationSettings,
  type MfaSettings,
  type SecondFactorChallenge,
  type SessionTask,
  type SignInMethod,
  type SignInResult,
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

    const storage = options.storage ?? defaultStorage();
    /*
     * Per environment, like the session, and kept apart from it: signing
     * out ends the session but deliberately keeps the device remembered,
     * which is the point of remembering it. The server ends a device on
     * password change or factor removal.
     */
    const deviceKey = `zevauth.device.${environmentOf(options.publishableKey)}`;

    this.http = new Http({
      baseUrl: options.apiUrl ?? inferApiUrl(options.publishableKey),
      publishableKey: options.publishableKey,
      fetch: options.fetch,
      deviceToken: () => storage.get(deviceKey),
    });

    this.tokens = new TokenStore(storage, environmentOf(options.publishableKey));

    this.coordinator = new RefreshCoordinator({
      read: () => this.tokens.readPersisted(),
      perform: (refreshToken) => this.performRefresh(refreshToken),
    });

    const adopt = (response: SignInResponse) => this.adopt(response);
    this.signIn = new SignInFlow(
      this.http,
      adopt,
      () => this.challenge?.id ?? null,
      (token) => storage.set(deviceKey, token),
    );
    this.signUp = new SignUpFlow(this.http, adopt);
    this.passwordReset = new PasswordResetFlow(this.http);

    const token = () => this.getToken();
    this.organizations = new OrganizationsFlow(this.http, token, (id) =>
      this.setActiveOrganization(id),
    );
    this.mfa = new MfaFlow(this.http, token, () => this.coordinator.refresh());
    this.me = new UserFlow(this.http, token, (user) => this.replaceUser(user), this.mfa);
  }

  /**
   * The signed-in person's own two-step verification. Also reachable as
   * `me.mfa`.
   */
  readonly mfa: MfaFlow;

  /**
   * A sign-in waiting for its second factor. In memory only: a reload
   * starts the sign-in again, which is what a five-minute challenge
   * should do anyway, and nothing that proves half a sign-in is written
   * to storage.
   */
  private challenge: { id: string; factors: string[]; expiresAt: string } | null = null;

  /** What the session must still do, from its latest response. */
  private tasks: string[] = [];

  /** The second step a sign-in is waiting for, or null. */
  get secondFactor(): SecondFactorChallenge | null {
    return this.challenge ? { factors: this.challenge.factors, expiresAt: this.challenge.expiresAt } : null;
  }

  /** What the session must still do, e.g. `setup_mfa`. Usually empty. */
  get pendingTasks(): SessionTask[] {
    return [...this.tasks];
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
  load(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    /*
     * One load at a time. A second caller while the first is in flight
     * (React's strict-mode double effect, a Vue plugin and a component,
     * two islands) used to start a second run: a second environment
     * fetch, and a second attempt to spend a one-time handoff or email
     * code that the first had already spent, which then surfaced as a
     * sign-in error. Cleared on failure so a later call can retry.
     */
    this.loading ??= this.performLoad().catch((error: unknown) => {
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  private loading: Promise<void> | null = null;

  private async performLoad(): Promise<void> {
    this.environment = await this.http.get<EnvironmentConfig>('/v1/environment');

    await this.completeHandoffIfPresent();
    await this.completeEmailLinkIfPresent();

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

  private pendingHandoffError: HandoffError | null = null;

  /**
   * The error a sign-in came back with, once.
   *
   * Returns it and clears it, so the component that shows it is the
   * only one that does. `<SignIn>` calls this on mount; call it yourself
   * if you render your own sign-in and want to tell the person why the
   * ZevID button brought them straight back.
   */
  takeHandoffError(): HandoffError | null {
    const error = this.pendingHandoffError;
    this.pendingHandoffError = null;
    return error;
  }

  get user(): ZevAuthUser | null {
    return this.tokens.getUser();
  }

  get organization(): ActiveOrganization | null {
    return this.tokens.getOrganization();
  }

  /**
   * What this environment does about confirming addresses.
   *
   * Exposed so the components can render the right verification screen
   * rather than assuming a link.
   */
  get emailVerification(): EnvironmentConfig['emailVerification'] {
    return this.environment?.emailVerification;
  }

  /**
   * The app's two-step policy, or null from an API older than it. The
   * server enforces it regardless; this is for drawing the right screen.
   */
  get mfaSettings(): MfaSettings | null {
    return this.environment?.mfa ?? null;
  }

  /**
   * Abandons a sign-in that is waiting for its second factor, back to
   * signed out. For a "Back to sign in" link; the server-side challenge
   * simply expires.
   */
  cancelSecondFactor(): void {
    if (!this.challenge) return;
    this.challenge = null;
    this.emit();
  }

  /**
   * The organization policy, or `null` from an API older than it, in
   * which case a UI should behave as it did before it could know.
   */
  get organizationSettings(): OrganizationSettings | null {
    return this.environment?.organizations ?? null;
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
    this.challenge = null;
    this.tasks = [];
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

    this.adoptSession(response);
  }

  // ── Internals ───────────────────────────────────────────────────

  /**
   * Adopts a sign-in response and tells everyone about it. A response
   * that asks for a second factor holds the challenge instead.
   */
  private adopt(response: SignInResponse): SignInResult {
    if ('status' in response && response.status === 'needs_second_factor') {
      this.challenge = response.challenge;
      this.emit();
      return {
        status: 'needs_second_factor',
        factors: response.challenge.factors,
        expiresAt: response.challenge.expiresAt,
      };
    }
    this.adoptSession(response as SessionResponse);
    return { status: 'complete' };
  }

  /** Adopts a session response and tells everyone about it. */
  private adoptSession(response: SessionResponse): void {
    this.challenge = null;
    this.tasks = response.session.pendingTasks ?? [];
    /*
     * A response without a user must never erase the one we have.
     *
     * Sign-in returns a user; for a while, refresh did not — and this
     * line adopted both, so every fresh page load refreshed the session
     * successfully and then set `user` to undefined. The stored session
     * sat in localStorage, valid and rotated, next to a sign-in form.
     * The refresh only proves the session is alive; it does not change
     * whose it is.
     */
    this.tokens.write({
      accessToken: response.session.accessToken,
      refreshToken: response.session.refreshToken,
      expiresIn: response.session.expiresIn,
      user: response.user ?? this.tokens.getUser() ?? response.user,
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

    // Who was signed in is known before any network happens, so the
    // refresh below only has to prove the session is still alive.
    this.tokens.hydrate(stored);

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
      /*
       * A ZevID session past its fresh-sign-in window. Not an error the
       * person caused: say why, where <SignIn> will show it, so "you
       * were signed out" reads as routine rather than as something broken.
       */
      if (err.code === 'reauthentication_required') {
        this.pendingHandoffError = {
          code: 'zevid_reauthentication_required',
          description: 'For your security, please sign in with ZevID again.',
        };
      }
    }
  }

  private async performRefresh(refreshToken: string): Promise<void> {
    const response = await this.http.post<SessionResponse>('/v1/auth/refresh', {
      refreshToken,
    });
    this.adoptSession(response);
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

    /*
     * A failed brokered sign-in comes back the same way a successful
     * one does — to this page — but with `error` instead of `code`.
     * Kept for whoever asks (the <SignIn> component does, on mount),
     * and scrubbed from the URL so a reload does not show it twice.
     */
    if (!code) {
      const error = url.searchParams.get('error');
      if (error) {
        this.pendingHandoffError = {
          code: error,
          description:
            url.searchParams.get('error_description') ??
            'The sign-in could not be completed.',
        };
        for (const key of ['error', 'error_description', 'state']) {
          url.searchParams.delete(key);
        }
        globalThis.history?.replaceState({}, '', url.toString());
      }
      return;
    }

    let hadPkce = false;
    try {
      /*
       * A ZevID sign-in this tab started with PKCE: the state must be the
       * one we sent (otherwise someone else's sign-in is being planted
       * here), and the exchange proves the verifier and names the exact
       * redirect the code was sent to. Without a pending PKCE, the code
       * is exchanged as it always was.
       */
      const pkce = takePendingPkce();
      hadPkce = pkce !== null;
      let binding: { codeVerifier: string; redirectUri: string } | null = null;
      if (pkce) {
        if (url.searchParams.get('state') !== pkce.state) {
          this.pendingHandoffError = {
            code: 'state_mismatch',
            description: 'This sign-in was not started from this page. Please try again.',
          };
          return;
        }
        const destination = new URL(url.toString());
        destination.searchParams.delete('code');
        destination.searchParams.delete('state');
        binding = { codeVerifier: pkce.verifier, redirectUri: destination.toString() };
      }

      // A hosted or ZevID sign-in can need a second factor too; `adopt`
      // holds the challenge for the UI to finish.
      const response = await this.http.post<SignInResponse>(
        '/v1/auth/handoff/exchange',
        binding ? { code, ...binding } : { code },
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
      // Ours only when this tab sent one; a page's own `state` stays.
      if (hadPkce) url.searchParams.delete('state');
      globalThis.history?.replaceState({}, '', url.toString());
    }
  }

  /**
   * Finishes a flow that arrived as a link in an email.
   *
   * ── Why this exists alongside the handoff ─────────────────────────
   * A magic link used to have exactly one destination: our hosted page,
   * which redeemed the token and bounced the person back here with a
   * one-time code. That works, and for a developer who has built no
   * pages of their own it is the right default.
   *
   * It is a visible seam for everybody else. An app that has embedded
   * `<SignIn />` already has a sign-in page, and sending its users
   * through a zevauth.com screen to get back to it is a stranger's
   * branding in the middle of somebody's product — on the one flow where
   * the person is already wondering whether the email was genuine.
   *
   * So `startMagicLink({ redirectUrl })` points the link at the app
   * instead, and this is the other half: on load, the token is spotted,
   * redeemed here, and the session begins on this origin without the
   * person going anywhere.
   *
   * ── What it deliberately does NOT finish ──────────────────────────
   * A password reset. That one needs a new password, which means a form,
   * which means the developer's own UI. The token is left in the URL for
   * them to read and pass to `passwordReset.complete()`; swallowing it
   * here would strip the credential their form still needs.
   */
  private async completeEmailLinkIfPresent(): Promise<void> {
    const location = globalThis.location;
    if (!location) return;

    const url = new URL(location.href);
    const token = url.searchParams.get('zv_token');
    const flow = url.searchParams.get('zv_flow');
    if (!token || !flow) return;

    // Left for the developer's own form. See the note above.
    if (flow === 'reset-password') return;

    try {
      if (flow === 'sign-in') {
        const response = await this.http.post<SignInResponse>(
          '/v1/auth/magic-link/verify',
          { token },
        );
        this.adopt(response);
      } else if (flow === 'verify-email') {
        await this.http.post('/v1/auth/verify-email', { token });
        /*
         * No session from this one. Confirming an address is not signing
         * in: the person may already be signed in on this device, or may
         * have opened the link on their phone having signed up on a
         * laptop. `restore()` runs next either way and finds whatever
         * session actually exists here.
         */
      }
    } catch {
      /*
       * Swallowed on purpose. A link is opened once and then sits in an
       * inbox, so the second visit is expired-or-used, which is normal
       * rather than exceptional. Throwing out of `load()` would leave the
       * whole app unmounted over a stale link, when the correct outcome
       * is simply "you are not signed in".
       */
    } finally {
      /*
       * The token leaves the URL whether or not it worked, for the same
       * reason the handoff code does: it is single use, and one left in
       * the address bar gets bookmarked, pasted into chat, and reported
       * as "the link stopped working".
       */
      url.searchParams.delete('zv_token');
      url.searchParams.delete('zv_flow');
      url.searchParams.delete('zv_t');
      globalThis.history?.replaceState({}, '', url.toString());
    }
  }

  private snapshot(): ZevAuthState {
    return {
      isLoaded: this.loaded,
      user: this.tokens.getUser(),
      organization: this.tokens.getOrganization(),
      secondFactor: this.secondFactor,
      pendingTasks: this.pendingTasks,
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
