/**
 * Makes sure a session is only ever refreshed once at a time, across
 * every tab.
 *
 * ── Why this is not an optimisation ───────────────────────────────
 * ZevAuth rotates refresh tokens and detects reuse. A token that has
 * already been spent means either a stolen copy is being replayed or the
 * client raced itself, and the server cannot tell those apart — so it
 * burns the whole session. That is the correct server behaviour, and it
 * makes a racing client catastrophic rather than merely wasteful: two
 * tabs refreshing in the same instant signs the person out of every tab,
 * with a "token reuse detected" entry in the developer's auth log
 * pointing at an attack that never happened.
 *
 * A single-flight promise inside one tab is not enough, because each tab
 * has its own. This coordinates ACROSS tabs.
 *
 * ── How ──────────────────────────────────────────────────────────
 * `navigator.locks` is the browser's own mutex, shared by every context
 * on an origin, and it releases automatically if a tab crashes or is
 * closed mid-hold. The winner refreshes and broadcasts the new tokens;
 * the losers wait for the lock, then find fresh tokens already in
 * storage and use those instead of refreshing again.
 *
 * Where Web Locks is unavailable the fallback is a timestamp claim in
 * shared storage. That is genuinely weaker — two tabs can still claim it
 * in the same millisecond — so it is a fallback, not the design.
 */

export interface CoordinatorDeps {
  /** Reads whatever tokens are currently stored, from shared storage. */
  read: () => { refreshToken: string; expiresAt: number } | null;
  /** Performs the network refresh. Only ever called by a lock holder. */
  perform: (refreshToken: string) => Promise<void>;
}

const LOCK_NAME = 'zevauth.refresh';

export class RefreshCoordinator {
  /** In-tab single flight, so one tab never queues two waiters. */
  private inFlight: Promise<void> | null = null;

  constructor(private readonly deps: CoordinatorDeps) {}

  async refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private async run(): Promise<void> {
    const before = this.deps.read();
    if (!before) return;

    const locks = globalThis.navigator?.locks;

    if (!locks) {
      // No Web Locks. One tab wins on ordering alone, which is why this
      // is the fallback and not the plan.
      return this.deps.perform(before.refreshToken);
    }

    await locks.request(LOCK_NAME, async () => {
      /*
       * Re-read INSIDE the lock. This is the whole point: a tab that
       * queued behind another arrives here after the winner has already
       * refreshed and stored a new token. Using the token we read before
       * queueing would present a spent one, which is exactly the reuse
       * the server burns sessions over.
       */
      const current = this.deps.read();
      if (!current) return;

      // Somebody else already did the work while we waited.
      if (current.refreshToken !== before.refreshToken) return;

      await this.deps.perform(current.refreshToken);
    });
  }
}
