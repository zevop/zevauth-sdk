import { useState, type FormEvent, type ReactNode } from 'react';
import { ZevAuthError } from '@zevauth/js';
import { useComponentAppearance } from '../internal/context.js';
import type { Appearance } from '../internal/appearance.js';
import { errorMessage, format, type Localization } from '../internal/localization.js';
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
import { SecondFactorStep } from './TwoStep.js';

export interface SignUpProps {
  afterSignUpUrl?: string;
  /**
   * Ask for the password twice. On by default: a typo in a new password
   * is invisible until it locks somebody out of the account they just
   * made.
   */
  requireConfirmPassword?: boolean;

  /** Rendered once the account exists and a session started. */
  children?: ReactNode;
  className?: string;

  /** Where the form sits. Defaults to the console's setting, as sign-in does. */
  layout?: SignInLayout;

  /** What fills the other half of a split screen. Overrides the console. */
  aside?: ReactNode;

  /**
   * Branding for this component only, over whatever the provider and
   * the console already decided. Use the provider's `appearance` when
   * every screen should match; use this when one should not.
   */
  appearance?: Appearance;
  /** The words on this component, merged over the provider's `localization`. */
  localization?: Localization;
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
export function SignUp({
  afterSignUpUrl,
  children,
  className,
  layout,
  aside,
  appearance,
  localization,
  requireConfirmPassword = true,
}: SignUpProps) {
  const {
    client,
    state,
    branding,
    appearance: appearanceLayers,
    el,
    strings,
    isLocalized,
  } = useComponentAppearance('<SignUp>', appearance, localization);
  const t = strings.signUp;
  const c = strings.common;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);


  /*
   * The same layout as sign-in, from the same setting. A product whose
   * sign-in is a split screen and whose sign-up is a centered card
   * looks like two different products at the moment somebody is
   * deciding whether to trust it.
   */
  const resolvedLayout: SignInLayout =
    layout ??
    ((branding?.signInLayout?.replace('_', '-') as SignInLayout) ?? 'centered');
  /*
   * Shown once the second field has something in it, so the error
   * appears when a mistake exists rather than while one is being typed.
   */
  const mismatch =
    requireConfirmPassword &&
    confirmPassword.length > 0 &&
    confirmPassword !== password;

  /*
   * What this environment actually sends. An empty list means the
   * environment default, which is a link.
   */
  const wantsCode =
    client.emailVerification?.strategies?.includes('code') ?? false;
  const wantsLink =
    (client.emailVerification?.strategies?.includes('link') ??
      false) || (client.emailVerification?.strategies?.length ?? 0) === 0;

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
            ? errorMessage(strings, err, c.genericError)
            : c.genericError,
        );
      })
      .finally(() => setIsBusy(false));
  };

  return (
    <Brandable branding={branding} appearance={appearanceLayers} el={el} strings={strings} className={className}>
      <Shell
        layout={resolvedLayout}
        align={branding?.contentAlign ?? 'center'}
        aside={aside ?? <BrandedAside branding={branding} />}
      >
      <div {...el('card')} data-chrome={branding?.cardStyle ?? 'card'}>
        {client.isTestMode ? <TestModeBadge /> : null}
        <Identity branding={branding} />

        {state.secondFactor ? (
          /*
           * Signing up with an address that already has an account and
           * two-step (the email link signs that person in) ends in the
           * second step, not a dead end.
           */
          <SecondFactorStep client={client} />
        ) : awaitingVerification ? (
          <>
            <h1 {...el('title')}>{t.verifyTitle}</h1>
            <p {...el('subtitle')}>
              {wantsCode && wantsLink
                ? format(t.verifyBodyLinkAndCode, { email })
                : wantsCode
                  ? format(t.verifyBodyCode, { email })
                  : format(t.verifyBodyLink, { email })}
            </p>
            {error ? <Alert>{error}</Alert> : null}

            {/*
              A field, when the environment sends a code.
              
              This screen used to say "we sent a link" whatever the
              environment was configured to send, so anybody on the code
              strategy waited for mail that told them to type six digits
              into a screen with nowhere to type them.
            */}
            {wantsCode ? (
              <form
                {...el('fields')}
                onSubmit={(event) => {
                  event.preventDefault();
                  setError(null);
                  setIsBusy(true);
                  client.signUp
                    .verifyCode({ email, code })
                    .catch((err: unknown) =>
                      setError(
                        err instanceof ZevAuthError
                          ? errorMessage(strings, err, t.codeRejected)
                          : t.codeRejected,
                      ),
                    )
                    .finally(() => setIsBusy(false));
                }}
              >
                <div {...el('field')}>
                  <label {...el('label')} htmlFor="zv-verify-code">
                    {t.verifyCodeLabel}
                  </label>
                  <input
                    id="zv-verify-code"
                    {...el('input')}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={isBusy}
                    /* So a phone offers the numeric keypad and the OS
                       can fill it straight from the message. */
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  {...el(['button', 'buttonPrimary'])}
                  data-variant="primary"
                  disabled={isBusy || code.length === 0}
                >
                  {isBusy ? <Spinner /> : null}
                  {t.verifySubmit}
                </button>
              </form>
            ) : null}
          </>
        ) : (
          <>
            <Heading
              title={isLocalized('signUp', 'title') ? t.title : branding?.signUpTitle}
              subtitle={branding?.signUpSubtitle}
              fallbackTitle={t.title}
            />
            {error ? <Alert>{error}</Alert> : null}

            {hasZevId ? (
              <>
                <button
                  type="button"
                  {...el(['button', 'buttonSecondary'])}
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
                  {c.continueWithZevId}
                </button>
                {hasPassword ? <Divider label={c.or} /> : null}
              </>
            ) : null}

            {hasPassword ? (
              <form {...el('fields')} onSubmit={onSubmit}>
                <div {...el('field')}>
                  <label {...el('label')} htmlFor="zv-firstname">
                    {t.firstName}
                  </label>
                  <input
                    id="zv-firstname"
                    {...el('input')}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isBusy}
                    autoComplete="given-name"
                  />
                  <span {...el('hint')}>{t.optional}</span>
                </div>

                <div {...el('field')}>
                  <label {...el('label')} htmlFor="zv-signup-email">
                    {c.email}
                  </label>
                  <input
                    id="zv-signup-email"
                    {...el('input')}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isBusy}
                    autoComplete="email"
                    required
                  />
                </div>

                <div {...el('field')}>
                  <label {...el('label')} htmlFor="zv-signup-password">
                    {c.password}
                  </label>
                  <input
                    id="zv-signup-password"
                    {...el('input')}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isBusy}
                    /* `new-password`, so a password manager offers to
                       generate one instead of filling the old one in. */
                    autoComplete="new-password"
                    required
                  />
                  <span {...el('hint')}>{t.passwordHint}</span>
                </div>

                {/*
                  A second field, because a typo in the first one is
                  invisible and only surfaces later as a password reset.
                  Off by default is the wrong default here: the cost is
                  one field, and the cost of getting it wrong is a
                  person locked out of an account they just created.

                  `requireConfirmPassword={false}` turns it off for
                  products that would rather trust the reveal button.
                */}
                {requireConfirmPassword ? (
                  <div {...el('field')}>
                    <label {...el('label')} htmlFor="zv-signup-confirm">
                      {t.confirmPassword}
                    </label>
                    <input
                      id="zv-signup-confirm"
                      {...el('input')}
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={isBusy}
                      autoComplete="new-password"
                      required
                      aria-invalid={mismatch ? true : undefined}
                    />
                    {/* Only once they have typed enough to have made a
                        mistake. Saying "does not match" against an empty
                        box is telling somebody off for not finishing. */}
                    {mismatch ? (
                      <span {...el('fieldError')}>
                        {t.passwordsDiffer}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="submit"
                  {...el(['button', 'buttonPrimary'])}
                  data-variant="primary"
                  disabled={
                    isBusy || !email || password.length < 8 || mismatch ||
                    (requireConfirmPassword && confirmPassword.length === 0)
                  }
                >
                  {isBusy ? <Spinner /> : null}
                  {t.submit}
                </button>
              </form>
            ) : null}

            {!hasPassword && !hasZevId && state.isLoaded ? (
              <div {...el('notice')}>
                {t.noMethods}
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
