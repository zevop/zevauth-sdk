import { useState, type FormEvent, type ReactNode } from 'react';
import { ZevAuthError } from '@zevauth/js';
import { useZevAuthContext } from '../internal/context.js';
import { Brandable } from './Brandable.js';
import {
  Alert,
  Divider,
  Identity,
  PoweredBy,
  Spinner,
  TestModeBadge,
  ZevMark,
} from './parts.js';

export interface SignUpProps {
  afterSignUpUrl?: string;
  /** Rendered once the account exists and a session started. */
  children?: ReactNode;
  className?: string;
}

/**
 * Account creation.
 *
 * ── Why a successful sign-up may not sign anybody in ──────────────
 * Whether a new account gets a session immediately or has to confirm
 * its address first is the developer's setting, not this component's
 * decision. So it reads what the server did rather than assuming: a
 * session means straight in, and no session means the confirmation
 * screen. Forcing either would override a deliberate configuration.
 */
export function SignUp({ afterSignUpUrl, children, className }: SignUpProps) {
  const { client, state } = useZevAuthContext('<SignUp>');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);

  const branding = client.branding;
  const hasPassword = client.signInMethods.includes('email_password');
  const hasZevId = client.signInMethods.includes('zevid');

  if (state.isLoaded && state.user) {
    if (afterSignUpUrl && typeof window !== 'undefined') {
      window.location.assign(afterSignUpUrl);
    }
    return <>{children ?? null}</>;
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);

    void client.signUp
      .create({
        email,
        password,
        firstName: firstName || undefined,
      })
      .then((result) => {
        // No session and a verification requirement means the server
        // wants the address proved first.
        if (result.requiresEmailVerification && !client.user) {
          setAwaitingVerification(true);
        }
      })
      .catch((err) => {
        setError(
          err instanceof ZevAuthError
            ? err.message
            : 'Something went wrong. Please try again.',
        );
      })
      .finally(() => setIsBusy(false));
  };

  return (
    <Brandable branding={branding} className={className}>
      <div className="zv-card">
        {client.isTestMode ? <TestModeBadge /> : null}
        <Identity branding={branding} />

        {awaitingVerification ? (
          <>
            <h1 className="zv-title">Confirm your email</h1>
            <p className="zv-subtitle">
              We sent a link to {email}. Open it to finish setting up your
              account.
            </p>
          </>
        ) : (
          <>
            <h1 className="zv-title">Create your account</h1>
            {error ? <Alert>{error}</Alert> : null}

            {hasZevId ? (
              <>
                <button
                  type="button"
                  className="zv-button"
                  data-variant="secondary"
                  disabled={isBusy}
                  onClick={() => client.signIn.withZevId()}
                >
                  {/*
                    The provider's mark, the way every other SSO button
                    in the category carries one. A button that names a
                    provider without showing it asks somebody to read
                    where they would otherwise recognise, and it is the
                    one control on the page that leaves the site.
                  */}
                  <ZevMark size={13} />
                  Continue with ZevID
                </button>
                {hasPassword ? <Divider label="or" /> : null}
              </>
            ) : null}

            {hasPassword ? (
              <form className="zv-fields" onSubmit={onSubmit}>
                <div className="zv-field">
                  <label className="zv-label" htmlFor="zv-firstname">
                    First name
                  </label>
                  <input
                    id="zv-firstname"
                    className="zv-input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isBusy}
                    autoComplete="given-name"
                  />
                  <span className="zv-hint">Optional.</span>
                </div>

                <div className="zv-field">
                  <label className="zv-label" htmlFor="zv-signup-email">
                    Email
                  </label>
                  <input
                    id="zv-signup-email"
                    className="zv-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isBusy}
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="zv-field">
                  <label className="zv-label" htmlFor="zv-signup-password">
                    Password
                  </label>
                  <input
                    id="zv-signup-password"
                    className="zv-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isBusy}
                    /* `new-password`, so a password manager offers to
                       generate one instead of filling the old one in. */
                    autoComplete="new-password"
                    required
                  />
                  <span className="zv-hint">8 characters or more.</span>
                </div>

                <button
                  type="submit"
                  className="zv-button"
                  data-variant="primary"
                  disabled={isBusy || !email || password.length < 8}
                >
                  {isBusy ? <Spinner /> : null}
                  Create account
                </button>
              </form>
            ) : null}

            {!hasPassword && !hasZevId && state.isLoaded ? (
              <div className="zv-notice">
                No sign-up methods are enabled for this environment. Turn one
                on under Authentication in the ZevAuth console.
              </div>
            ) : null}
          </>
        )}

        {branding?.showPoweredBy !== false ? (
          <PoweredBy environmentId={client.environmentId} />
        ) : null}
      </div>
    </Brandable>
  );
}
