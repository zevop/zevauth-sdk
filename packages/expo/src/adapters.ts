import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import type { AsyncSessionStorageAdapter, CryptoAdapter } from '@zevauth/js';

/**
 * The refresh token, in the iOS Keychain or Android Keystore.
 *
 * `THIS_DEVICE_ONLY`: a session should not travel to a new phone inside
 * an iCloud or device backup. Someone restoring a backup signs in again,
 * which is the right cost for a credential.
 */
export const secureStoreStorage: AsyncSessionStorageAdapter = {
  get: (key) => SecureStore.getItemAsync(key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
  set: (key, value) =>
    SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
  remove: (key) => SecureStore.deleteItemAsync(key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
};

/** Random bytes and SHA-256 for PKCE. Hermes has no Web Crypto. */
export const expoCrypto: CryptoAdapter = {
  getRandomValues: (bytes) => Crypto.getRandomValues(bytes),
  sha256: async (input) => {
    const data = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) data[i] = input.charCodeAt(i) & 0xff;
    return new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data));
  },
};

/**
 * How the ZevID sign-in is shown: the system authentication session.
 *
 * Replaceable for bare React Native apps that use a different module,
 * or for tests.
 */
export interface AuthBrowser {
  /** Opens `url`; resolves with the URL the sign-in returned to, or a cancel. */
  open(url: string, redirectUrl: string): Promise<{ type: 'success'; url: string } | { type: 'cancel' }>;
  /** Closes the sheet when the return arrived some other way (a universal link). */
  dismiss?(): void;
}

/**
 * `ASWebAuthenticationSession` on iOS, Custom Tabs on Android.
 *
 * ── Why never an embedded web view ────────────────────────────────
 * Only the system browser shares the person's existing ZevID session and
 * their password manager, and an app cannot read what is typed into it.
 * A web view gives the app both, which is why ZevID shows a warning in
 * one and why this SDK never opens one.
 *
 * ── Why not ephemeral ─────────────────────────────────────────────
 * `preferEphemeralSession` would hide the person's ZevID cookies, so
 * someone already signed in to ZevID in Safari would have to sign in
 * again. ZevID asked brokers to leave it off, and it is left off.
 */
export const systemBrowser: AuthBrowser = {
  async open(url, redirectUrl) {
    const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);
    return result.type === 'success' ? { type: 'success', url: result.url } : { type: 'cancel' };
  },
  dismiss() {
    try {
      WebBrowser.dismissAuthSession();
    } catch {
      // Nothing open to dismiss.
    }
  },
};
