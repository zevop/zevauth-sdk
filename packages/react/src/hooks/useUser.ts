import { useZevAuthContext } from '../internal/context.js';
import type { ZevAuthUser } from '@zevauth/js';

export interface UseUser {
  /** False until the session has been restored. See the note below. */
  isLoaded: boolean;
  /** True only once loading has finished AND somebody is signed in. */
  isSignedIn: boolean;
  user: ZevAuthUser | null;
}

/**
 * Who is signed in.
 *
 * ── Why `isLoaded` is separate from `isSignedIn` ──────────────────
 * On the first render of a page there is no answer yet: a session may
 * be restorable from storage, and finding out takes a request. Folding
 * that into a single boolean would make "not signed in" and "we do not
 * know yet" the same value, and every app built on it would flash its
 * signed-out UI for a moment on every reload before correcting itself.
 *
 * So the honest shape is three states, and the middle one has a name.
 */
export function useUser(): UseUser {
  const { state } = useZevAuthContext('useUser');

  return {
    isLoaded: state.isLoaded,
    isSignedIn: state.isLoaded && state.user !== null,
    user: state.user,
  };
}
