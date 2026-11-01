import type { SessionStorageAdapter } from './tokens.js';

/**
 * The seams a client needs off the web: a phone has no `localStorage`,
 * no `location`, often no Web Crypto, and a `URL` implementation that
 * cannot be trusted with query parameters (React Native's throws "not
 * implemented" on `searchParams` in several versions). Everything here
 * is plain string and byte work so it runs the same in Hermes, JSC and
 * Node.
 *
 * The web paths do not use any of this; they keep the code they had.
 */

/**
 * Storage that answers asynchronously, like expo-secure-store or the
 * iOS Keychain. Values are strings, as with the sync adapter.
 */
export interface AsyncSessionStorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * Cryptography the client cannot assume on a phone. `sha256` takes the
 * ASCII verifier and returns the raw digest.
 */
export interface CryptoAdapter {
  getRandomValues(bytes: Uint8Array): Uint8Array;
  sha256(input: string): Promise<Uint8Array>;
}

/**
 * An async store, read through a synchronous mirror.
 *
 * ── Why a mirror, not async all the way down ───────────────────────
 * The token store and the cross-tab refresh coordinator read the stored
 * session synchronously, and they are the parts of this SDK most worth
 * not rewriting: the refresh-reuse rules live there. So the async store
 * is read ONCE, for the keys the client uses, before anything else runs
 * (`preload`), and from then on reads come from memory. Writes land in
 * memory immediately and are queued to the real store in order, so a
 * quick sign-in followed by a sign-out cannot reach the keychain in the
 * opposite order.
 */
export class MirroredStorage implements SessionStorageAdapter {
  private readonly memory = new Map<string, string>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly backing: AsyncSessionStorageAdapter) {}

  async preload(keys: string[]): Promise<void> {
    await Promise.all(
      keys.map(async (key) => {
        try {
          const value = await this.backing.get(key);
          if (value !== null && value !== undefined) this.memory.set(key, value);
        } catch {
          // An unreadable entry is treated as absent: signed out, not crashed.
        }
      }),
    );
  }

  get(key: string): string | null {
    return this.memory.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.memory.set(key, value);
    this.enqueue(() => this.backing.set(key, value));
  }

  remove(key: string): void {
    this.memory.delete(key);
    this.enqueue(() => this.backing.remove(key));
  }

  /** Resolves once every queued write has reached the backing store. */
  flush(): Promise<void> {
    return this.queue;
  }

  private enqueue(write: () => Promise<void>): void {
    this.queue = this.queue.then(write).catch(() => {
      // A failed write leaves memory correct for this run; the next
      // write of the same key tries again.
    });
  }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** RFC 4648 §5 base64url, no padding, without `btoa`. */
export function base64url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63];
  }
  return out;
}

/** Web Crypto, when the runtime has it. */
export function webCrypto(): CryptoAdapter | null {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle || !crypto.getRandomValues) return null;
  return {
    getRandomValues: (bytes) => crypto.getRandomValues(bytes),
    sha256: async (input) => {
      const data = new Uint8Array(input.length);
      for (let i = 0; i < input.length; i++) data[i] = input.charCodeAt(i) & 0xff;
      return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    },
  };
}

export interface NativePkce {
  verifier: string;
  challenge: string;
  state: string;
}

/** A verifier (43 characters, the RFC minimum), its S256 challenge, and a state. */
export async function createPkce(crypto: CryptoAdapter): Promise<NativePkce> {
  const random = (length: number) => base64url(crypto.getRandomValues(new Uint8Array(length)));
  const verifier = random(32);
  const state = random(16);
  const challenge = base64url(await crypto.sha256(verifier));
  return { verifier, challenge, state };
}

/**
 * The query string of a URL as a plain object, parsed by hand.
 *
 * Deep links arrive as `myapp://callback?code=…` or
 * `https://example.com/auth?code=…#…`. Only the query is read, and the
 * first value of a repeated key wins, which is what `URLSearchParams.get`
 * does.
 */
export function parseQuery(url: string): Record<string, string> {
  const withoutHash = url.split('#')[0] ?? '';
  const start = withoutHash.indexOf('?');
  if (start === -1) return {};
  const params: Record<string, string> = {};
  for (const pair of withoutHash.slice(start + 1).split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
    const key = safeDecode(rawKey);
    if (!(key in params)) params[key] = safeDecode(rawValue);
  }
  return params;
}

/** The URL without its query or fragment: the redirect the code was sent to. */
export function stripQuery(url: string): string {
  return (url.split('#')[0] ?? '').split('?')[0] ?? '';
}

/** `a=1&b=2`, encoded, in insertion order. */
export function buildQuery(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}
