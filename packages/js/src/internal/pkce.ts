/**
 * PKCE (RFC 7636) and `state` for the ZevID sign-in.
 *
 * The verifier never leaves the browser until the exchange, and the
 * challenge is its SHA-256, so a code intercepted on the way back (a
 * browser extension, a log, another app claiming the same link) is
 * useless without it. `state` ties the response to the request this tab
 * made, so a sign-in someone else started cannot be planted on this one.
 *
 * Kept in `sessionStorage`: per tab, gone when the tab closes, and the
 * same tab is where the redirect returns.
 */

const KEY = 'zevauth.zevid.pkce';

export interface PendingPkce {
  verifier: string;
  state: string;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function random(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** A fresh verifier, its S256 challenge, and a state, remembered for the return. */
export async function beginPkce(): Promise<PendingPkce & { challenge: string }> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('PKCE needs the Web Crypto API (a secure context: https or localhost).');
  }
  const verifier = random(32); // 43 characters, the RFC minimum
  const state = random(16);
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64url(new Uint8Array(digest));
  try {
    globalThis.sessionStorage?.setItem(KEY, JSON.stringify({ verifier, state }));
  } catch {
    // Storage blocked: the return cannot prove anything, so it will fail
    // closed at the exchange rather than open here.
  }
  return { verifier, state, challenge };
}

/** What `beginPkce` remembered, once, and forgets it. */
export function takePendingPkce(): PendingPkce | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(KEY);
    if (!raw) return null;
    globalThis.sessionStorage?.removeItem(KEY);
    const parsed = JSON.parse(raw) as Partial<PendingPkce>;
    return typeof parsed.verifier === 'string' && typeof parsed.state === 'string'
      ? { verifier: parsed.verifier, state: parsed.state }
      : null;
  } catch {
    return null;
  }
}
