import type { ReactNode } from 'react';
import { useZevAuthContext } from '../internal/context.js';

/**
 * Renders only when somebody is signed in.
 *
 * ── Why nothing renders while loading ─────────────────────────────
 * Both `<SignedIn>` and `<SignedOut>` render nothing until the session
 * has resolved. The alternative — treating "not yet known" as signed
 * out — makes every reload flash the signed-out UI before correcting
 * itself, which reads as a bug and, on a page with a sign-in button in
 * the header, as being logged out.
 *
 * These are a CONVENIENCE, not a security boundary. Everything they
 * hide is still in the JavaScript bundle. Authorization belongs on the
 * server, where the access token is verified.
 */
export function SignedIn({ children }: { children: ReactNode }) {
  const { state } = useZevAuthContext('<SignedIn>');
  if (!state.isLoaded || !state.user) return null;
  return <>{children}</>;
}

/** Renders only when nobody is signed in. */
export function SignedOut({ children }: { children: ReactNode }) {
  const { state } = useZevAuthContext('<SignedOut>');
  if (!state.isLoaded || state.user) return null;
  return <>{children}</>;
}

/** Renders while the session is still being restored. */
export function ZevAuthLoading({ children }: { children: ReactNode }) {
  const { state } = useZevAuthContext('<ZevAuthLoading>');
  if (state.isLoaded) return null;
  return <>{children}</>;
}

export interface ProtectProps {
  /** Require the session's active organization to hold this role. */
  role?: string;
  /** Require this permission on the active organization. */
  permission?: string;
  /** Shown when the check fails. Nothing, by default. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders children only for a session that passes the check.
 *
 * ── Read the warning above, and then this one ─────────────────────
 * `<Protect>` hides UI. It does not protect data. A determined person
 * reads the bundle, calls your API directly, and gets whatever your API
 * gives them — so the same check has to exist on the server, against
 * the verified token. This component's job is to stop showing people
 * buttons that would fail.
 */
export function Protect({
  role,
  permission,
  fallback = null,
  children,
}: ProtectProps) {
  const { state } = useZevAuthContext('<Protect>');

  if (!state.isLoaded) return null;
  if (!state.user) return <>{fallback}</>;

  const organization = state.organization;

  if (role || permission) {
    if (!organization) return <>{fallback}</>;
    if (role && organization.role !== role) return <>{fallback}</>;
    if (
      permission &&
      !(organization.permissions ?? []).includes(permission)
    ) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
}

/**
 * Renders only when the signed-in person has confirmed their address.
 *
 * ── Why this pairs with `<EmailUnverified>` and not with a boolean ──
 * The relaxed policy lets somebody in before they confirm, and leaves
 * the developer to decide what that restricts. In practice that is two
 * questions with two different answers on the same page: what to hide
 * from them, and what to tell them about it. Two components read better
 * at the call site than one flag tested twice.
 *
 * Both render nothing until the session has loaded, so neither flashes
 * the wrong branch on first paint.
 *
 * ```tsx
 * <EmailUnverified>
 *   <Banner>Confirm your email to enable payouts.</Banner>
 * </EmailUnverified>
 * <EmailVerified>
 *   <PayoutSettings />
 * </EmailVerified>
 * ```
 *
 * This is a UI decision, not a security boundary. Your API must check
 * the `email_verified` claim itself: hiding a button does not stop a
 * request.
 */
export function EmailVerified({ children }: { children: ReactNode }) {
  const { state } = useZevAuthContext('<EmailVerified>');
  if (!state.isLoaded || !state.user?.emailVerified) return null;
  return <>{children}</>;
}

/** Renders only when the signed-in person has NOT confirmed their address. */
export function EmailUnverified({ children }: { children: ReactNode }) {
  const { state } = useZevAuthContext('<EmailUnverified>');
  if (!state.isLoaded || !state.user) return null;
  if (state.user.emailVerified) return null;
  return <>{children}</>;
}
