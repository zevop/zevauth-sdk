import { useState, type FormEvent, type ReactNode } from 'react';
import { ZevAuthError, type Appearance } from '@zevauth/js';
import {
  mergeAppearance,
  useZevAuthContext,
} from '../internal/context.js';
import { Brandable } from './Brandable.js';
import {
  Alert,
  BrandedAside,
  Divider,
  Heading,
  Identity,
  Shell,
  PoweredBy,
  Spinner,
  TestModeBadge,
  ZevMark,
  type SignInLayout,
} from './parts.js';

export interface SignInProps {
  /** Where to send somebody after a successful sign-in. */
  afterSignInUrl?: string;
  /**
   * How the passwordless alternatives are presented.
   *
   * `inline` (default) shows every enabled method as its own button.
   * Honest, and it gets long: with password, magic link and email code
   * all on, that is three buttons and two dividers under the form.
   *
   * `collapsed` shows the primary method and folds the rest behind a
   * "More options" toggle. Better when several are enabled, and the
   * choice is yours because it depends on which method you actually
   * want people to reach for.
   */
  secondaryMethods?: 'inline' | 'collapsed';

  /**
   * Where the form sits. Defaults to whatever the console is set to,
   * so a developer who has not asked for anything gets the centered
   * card they already had.
   */
  layout?: SignInLayout;

  /**
   * What fills the other half of a split screen.
   *
   * Overrides the picture and copy set in the console: passing JSX is a
   * more specific instruction than a settings page, and somebody who
   * wrote a panel did not write it to be replaced from elsewhere.
   */
  aside?: ReactNode;

  /**
   * Branding for this component only, over whatever the provider and
   * the console already decided. Use the provider's `appearance` when
   * every screen should match; use this when one should not.
   */
  appearance?: Appearance;
  /** Rendered instead of the form once somebody is signed in. */
  children?: React.ReactNode;
  className?: string;
}

type Stage =
  | { name: 'credentials' }
  /**
   * The password reset, asking for the address itself.
   *
   * It used to reuse the sign-in field and refuse when that was empty,
   * with the only cue being reduced opacity on a ghost button. Nobody
   * reads that as "type your email above first"; they read it as a
   * broken link, which is exactly what the first developer to try it
   * reported.
   */
  | { name: 'reset-request' }
  | { name: 'code-sent'; email: string }
  | { name: 'link-sent'; email: string };

/**
 * A complete sign-in box.
 *
 * ── It renders what the environment has ENABLED, not a fixed set ──
 * The methods come from the API at load. A developer who turns passkeys
 * off in the console should stop being offered them in their app without
 * a deploy, and one who turns magic links on should get them the same
 * way. Hard-coding the list here would make the console's switches
 * advisory.
 *
 * ── Why it does not redirect by itself ────────────────────────────
 * `afterSignInUrl` is honoured when given, and otherwise the component
 * simply stops rendering the form and lets the app decide. A component
 * that always navigated would fight every router it was dropped into.
 */
export function SignIn({
  afterSignInUrl,
  secondaryMethods = 'inline',
  layout,
  aside,
  appearance,
  children,
  className,
}: SignInProps) {
  const { client, state, branding: contextBranding } = useZevAuthContext('<SignIn>');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<Stage>({ name: 'credentials' });

  /*
   * Its own field, seeded from the sign-in one. Somebody who typed
   * their address and then realised they had forgotten the password
   * should not have to type it again.
   */
  const [resetEmail, setResetEmail] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  /*
   * From context, not from the client: the provider has already
   * merged any `appearance` over the server's values, and a component
   * reading `client.branding` would quietly ignore it.
   */
  const branding = appearance
    ? mergeAppearance(contextBranding, appearance)
    : contextBranding;
  const methods = client.signInMethods;

  const hasPassword = methods.includes('email_password');
  const hasMagicLink = methods.includes('magic_link');
  const hasEmailCode = methods.includes('email_otp');
  const hasZevId = methods.includes('zevid');

  /*
   * Where the ZevID button goes.
   *
   * It used to be pinned above the form with no way to move it, and
   * `secondaryMethods` did not reach it: the prop only governed magic
   * link and email code, so an environment with just a password and
   * ZevID found it did nothing at all. For a product whose users are
   * mostly existing customers with a password, that put the primary
   * path second on the screen.
   *
   * `collapsed` now means what it says: the form first, and everything
   * else behind the toggle, ZevID included. `inline` is unchanged and
   * is still the default, so no existing screen moves unless its
   * developer asks.
   */
  /*
   * Stored as `split_left`, read as `split-left`. The API keeps the
   * underscore because that is what the column holds; the prop takes a
   * hyphen because that is what a React prop looks like everywhere
   * else. Converting once here beats asking a developer to remember
   * which surface uses which.
   */
  const resolvedLayout: SignInLayout =
    layout ??
    ((branding?.signInLayout?.replace('_', '-') as SignInLayout) ?? 'centered');

  const resetMode = branding?.passwordResetMode ?? 'dedicated';

  const zevIdIsSecondary =
    hasZevId && hasPassword && secondaryMethods === 'collapsed';

  if (state.isLoaded && state.user) {
    if (afterSignInUrl && typeof window !== 'undefined') {
      window.location.assign(afterSignInUrl);
    }
    return <>{children ?? null}</>;
  }

  async function run(action: () => Promise<void>) {
    setIsBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      /*
       * The API writes its messages for people, so they are shown as
       * written. Anything else is ours and says nothing useful about
       * their credentials.
       */
      setError(
        err instanceof ZevAuthError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  const onSubmitPassword = (event: FormEvent) => {
    event.preventDefault();
    void run(() => client.signIn.withPassword({ identifier, password }));
  };

  const onSendCode = () =>
    void run(async () => {
      await client.signIn.startEmailCode({ email: identifier });
      setStage({ name: 'code-sent', email: identifier });
    });

  const onSendLink = () =>
    void run(async () => {
      await client.signIn.startMagicLink({ email: identifier });
      setStage({ name: 'link-sent', email: identifier });
    });

  const onVerifyCode = (event: FormEvent) => {
    event.preventDefault();
    if (stage.name !== 'code-sent') return;
    void run(() => client.signIn.verifyEmailCode({ email: stage.email, code }));
  };

  return (
    <Brandable branding={branding} className={className}>
      <Shell
        layout={resolvedLayout}
        align={branding?.contentAlign ?? 'center'}
        aside={aside ?? <BrandedAside branding={branding} />}
      >
      <div className="zv-card" data-chrome={branding?.cardStyle ?? 'card'}>
        {client.isTestMode ? <TestModeBadge /> : null}
        <Identity branding={branding} />

        {stage.name === 'reset-request' ? (
          <>
            <Heading
              title="Reset your password"
              subtitle="We will email you a link to set a new one."
              fallbackTitle="Reset your password"
            />
            {error ? <Alert>{error}</Alert> : null}
            <form
              className="zv-fields"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await client.passwordReset.start({ email: resetEmail });
                  setStage({ name: 'link-sent', email: resetEmail });
                });
              }}
            >
              <div className="zv-field">
                <label className="zv-label" htmlFor="zv-reset-email">
                  Email
                </label>
                <input
                  id="zv-reset-email"
                  className="zv-input"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  disabled={isBusy}
                  autoComplete="email"
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="zv-button"
                data-variant="primary"
                disabled={isBusy}
              >
                {isBusy ? <Spinner /> : 'Send reset link'}
              </button>
            </form>
            <button
              type="button"
              className="zv-button"
              data-variant="ghost"
              onClick={() => {
                setError(null);
                setStage({ name: 'credentials' });
              }}
            >
              Back to sign in
            </button>
          </>
        ) : stage.name === 'link-sent' ? (
          <>
            <h1 className="zv-title">Check your email</h1>
            <p className="zv-subtitle">
              If {stage.email} has an account, a sign-in link is on its way.
            </p>
            <button
              type="button"
              className="zv-button"
              data-variant="ghost"
              onClick={() => setStage({ name: 'credentials' })}
            >
              Use something else
            </button>
          </>
        ) : stage.name === 'code-sent' ? (
          <>
            <h1 className="zv-title">Enter your code</h1>
            <p className="zv-subtitle">
              If {stage.email} has an account, we sent it a code.
            </p>
            {error ? <Alert>{error}</Alert> : null}
            <form className="zv-fields" onSubmit={onVerifyCode}>
              <div className="zv-field">
                <label className="zv-label" htmlFor="zv-code">
                  Code
                </label>
                <input
                  id="zv-code"
                  className="zv-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={isBusy}
                  /* Lets a phone offer the code from the message rather
                     than making somebody switch apps to read it. */
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="zv-button"
                data-variant="primary"
                disabled={isBusy || code.length === 0}
              >
                {isBusy ? <Spinner /> : null}
                Continue
              </button>
            </form>
            <button
              type="button"
              className="zv-button"
              data-variant="ghost"
              onClick={() => setStage({ name: 'credentials' })}
            >
              Use something else
            </button>
          </>
        ) : (
          <>
            <Heading
              title={branding?.signInTitle}
              subtitle={branding?.signInSubtitle}
              fallbackTitle="Sign in"
            />
            {error ? <Alert>{error}</Alert> : null}

            {hasZevId && !zevIdIsSecondary ? (
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
                {hasPassword || hasMagicLink || hasEmailCode ? (
                  <Divider label="or" />
                ) : null}
              </>
            ) : null}

            {hasPassword ? (
              <form className="zv-fields" onSubmit={onSubmitPassword}>
                <div className="zv-field">
                  <label className="zv-label" htmlFor="zv-identifier">
                    Email
                  </label>
                  <input
                    id="zv-identifier"
                    className="zv-input"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={isBusy}
                    /*
                     * `username` rather than `email`: the field accepts
                     * either, and password managers file the credential
                     * under whatever is typed here.
                     */
                    autoComplete="username"
                    autoFocus
                  />
                </div>
                <div className="zv-field">
                  <label className="zv-label" htmlFor="zv-password">
                    Password
                  </label>
                  <input
                    id="zv-password"
                    className="zv-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isBusy}
                    autoComplete="current-password"
                  />
                </div>
                <button
                  type="submit"
                  className="zv-button"
                  data-variant="primary"
                  disabled={isBusy || !identifier || !password}
                >
                  {isBusy ? <Spinner /> : null}
                  Sign in
                </button>
              </form>
            ) : null}

            {/*
              The alternatives, either laid out or folded away.

              Collapsed still RENDERS them, so the toggle can animate and
              so a form autofill or a screen reader is not surprised by
              content appearing from nowhere. `inert` keeps them out of
              the tab order while they are hidden, or somebody tabbing
              through lands on buttons they cannot see.
            */}
            {(hasMagicLink || hasEmailCode || zevIdIsSecondary) &&
            hasPassword ? (
              secondaryMethods === 'collapsed' ? (
                <button
                  type="button"
                  className="zv-more"
                  aria-expanded={showMore}
                  onClick={() => setShowMore((open) => !open)}
                >
                  More options
                  <svg
                    className="zv-chevron"
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              ) : (
                <Divider label="or" />
              )
            ) : null}

            {!hasPassword && (hasMagicLink || hasEmailCode) ? (
              <div className="zv-fields">
                <div className="zv-field">
                  <label className="zv-label" htmlFor="zv-email">
                    Email
                  </label>
                  <input
                    id="zv-email"
                    className="zv-input"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={isBusy}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>
            ) : null}

            {hasMagicLink || hasEmailCode || zevIdIsSecondary ? (
              <div
                className="zv-reveal"
                data-open={
                  secondaryMethods === 'inline' || showMore ? 'true' : 'false'
                }
                inert={secondaryMethods === 'collapsed' && !showMore}
              >
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  {zevIdIsSecondary ? (
                    <button
                      type="button"
                      className="zv-button"
                      data-variant="secondary"
                      disabled={isBusy}
                      onClick={() => client.signIn.withZevId()}
                    >
                      <ZevMark size={13} />
                      Continue with ZevID
                    </button>
                  ) : null}
                  {hasMagicLink ? (
                    <button
                      type="button"
                      className="zv-button"
                      data-variant="secondary"
                      disabled={isBusy || !identifier}
                      onClick={onSendLink}
                    >
                      Email me a sign-in link
                    </button>
                  ) : null}

                  {hasEmailCode ? (
                    <button
                      type="button"
                      className="zv-button"
                      data-variant="secondary"
                      disabled={isBusy || !identifier}
                      onClick={onSendCode}
                    >
                      Email me a code
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {hasPassword ? (
              <div className="zv-footer">
                {/*
                  Enabled even with an empty field, and it says why when
                  it cannot act.

                  It used to be `disabled` until an address was typed.
                  The reasoning was sound — the reset needs one — but the
                  ghost variant's only disabled cue is reduced opacity,
                  so it was indistinguishable from a dead link and read
                  as broken. A control that refuses silently teaches
                  nobody what to do next.
                */}
                <button
                  type="button"
                  className="zv-button"
                  data-variant="ghost"
                  disabled={isBusy}
                  onClick={() => {
                    /*
                     * `dedicated` is the default because the alternative
                     * is a link that appears to do nothing. `inline`
                     * keeps the original behaviour for anybody who
                     * deliberately wants one fewer screen.
                     */
                    if (resetMode === 'inline') {
                      if (!identifier.trim()) {
                        setError('Enter your email address first, then choose this again.');
                        return;
                      }
                      void run(async () => {
                        await client.passwordReset.start({ email: identifier });
                        setStage({ name: 'link-sent', email: identifier });
                      });
                      return;
                    }
                    setError(null);
                    setResetEmail(identifier);
                    setStage({ name: 'reset-request' });
                  }}
                >
                  Forgot your password?
                </button>
              </div>
            ) : null}

            {methods.length === 0 && state.isLoaded ? (
              /*
               * Said plainly rather than rendering an empty box. An
               * environment with nothing enabled is a configuration
               * mistake, and the person who can fix it is the developer
               * looking at this in their own app.
               */
              <div className="zv-notice">
                No sign-in methods are enabled for this environment. Turn one on
                under Authentication in the ZevAuth console.
              </div>
            ) : null}
          </>
        )}

        {branding?.showPoweredBy !== false ? (
          <PoweredBy environmentId={client.environmentId} />
        ) : null}
      </div>
      </Shell>
    </Brandable>
  );
}
