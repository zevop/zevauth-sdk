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
  /** The words on this component, merged over the provider's `localization`. */
  localization?: Localization;
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
  localization,
  children,
  className,
}: SignInProps) {
  const {
    client,
    state,
    branding,
    appearance: appearanceLayers,
    el,
    strings,
    isLocalized,
  } = useComponentAppearance('<SignIn>', appearance, localization);
  const t = strings.signIn;
  const c = strings.common;

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
  /*
   * Seeded from the client, once: a brokered sign-in that failed comes
   * back to this page with a reason, and the person should read it
   * here, in the box they started from, not in a console log.
   */
  const [error, setError] = useState<string | null>(
    () => client.takeHandoffError()?.description ?? null,
  );
  const [isBusy, setIsBusy] = useState(false);

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
          ? errorMessage(strings, err, c.genericError)
          : c.genericError,
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
    <Brandable branding={branding} appearance={appearanceLayers} el={el} strings={strings} className={className}>
      <Shell
        layout={resolvedLayout}
        align={branding?.contentAlign ?? 'center'}
        aside={aside ?? <BrandedAside branding={branding} />}
      >
      <div {...el('card')} data-chrome={branding?.cardStyle ?? 'card'}>
        {client.isTestMode ? <TestModeBadge /> : null}
        <Identity branding={branding} />

        {stage.name === 'reset-request' ? (
          <>
            <Heading
              title={t.resetTitle}
              subtitle={t.resetSubtitle}
              fallbackTitle={t.resetTitle}
            />
            {error ? <Alert>{error}</Alert> : null}
            <form
              {...el('fields')}
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await client.passwordReset.start({ email: resetEmail });
                  setStage({ name: 'link-sent', email: resetEmail });
                });
              }}
            >
              <div {...el('field')}>
                <label {...el('label')} htmlFor="zv-reset-email">
                  {c.email}
                </label>
                <input
                  id="zv-reset-email"
                  {...el('input')}
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
                {...el(['button', 'buttonPrimary'])}
                data-variant="primary"
                disabled={isBusy}
              >
                {isBusy ? <Spinner /> : t.resetSubmit}
              </button>
            </form>
            <button
              type="button"
              {...el(['button', 'buttonLink'])}
              data-variant="ghost"
              onClick={() => {
                setError(null);
                setStage({ name: 'credentials' });
              }}
            >
              {t.backToSignIn}
            </button>
          </>
        ) : stage.name === 'link-sent' ? (
          <>
            <h1 {...el('title')}>{t.linkSentTitle}</h1>
            <p {...el('subtitle')}>
              {format(t.linkSentBody, { email: stage.email })}
            </p>
            <button
              type="button"
              {...el(['button', 'buttonLink'])}
              data-variant="ghost"
              onClick={() => setStage({ name: 'credentials' })}
            >
              {t.useSomethingElse}
            </button>
          </>
        ) : stage.name === 'code-sent' ? (
          <>
            <h1 {...el('title')}>{t.codeSentTitle}</h1>
            <p {...el('subtitle')}>
              {format(t.codeSentBody, { email: stage.email })}
            </p>
            {error ? <Alert>{error}</Alert> : null}
            <form {...el('fields')} onSubmit={onVerifyCode}>
              <div {...el('field')}>
                <label {...el('label')} htmlFor="zv-code">
                  {t.codeLabel}
                </label>
                <input
                  id="zv-code"
                  {...el('input')}
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
                {...el(['button', 'buttonPrimary'])}
                data-variant="primary"
                disabled={isBusy || code.length === 0}
              >
                {isBusy ? <Spinner /> : null}
                {c.continue}
              </button>
            </form>
            <button
              type="button"
              {...el(['button', 'buttonLink'])}
              data-variant="ghost"
              onClick={() => setStage({ name: 'credentials' })}
            >
              {t.useSomethingElse}
            </button>
          </>
        ) : (
          <>
            <Heading
              title={isLocalized('signIn', 'title') ? t.title : branding?.signInTitle}
              subtitle={branding?.signInSubtitle}
              fallbackTitle={t.title}
            />
            {error ? <Alert>{error}</Alert> : null}

            {hasZevId && !zevIdIsSecondary ? (
              <>
                <button
                  type="button"
                  {...el(['button', 'buttonSecondary', 'zevIdButton'])}
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
                {hasPassword || hasMagicLink || hasEmailCode ? (
                  <Divider label={c.or} />
                ) : null}
              </>
            ) : null}

            {hasPassword ? (
              <form {...el('fields')} onSubmit={onSubmitPassword}>
                <div {...el('field')}>
                  <label {...el('label')} htmlFor="zv-identifier">
                    {c.email}
                  </label>
                  <input
                    id="zv-identifier"
                    {...el('input')}
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
                <div {...el('field')}>
                  <label {...el('label')} htmlFor="zv-password">
                    {c.password}
                  </label>
                  <input
                    id="zv-password"
                    {...el('input')}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isBusy}
                    autoComplete="current-password"
                  />
                </div>
                <button
                  type="submit"
                  {...el(['button', 'buttonPrimary'])}
                  data-variant="primary"
                  disabled={isBusy || !identifier || !password}
                >
                  {isBusy ? <Spinner /> : null}
                  {t.submit}
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
                  {...el('moreToggle')}
                  aria-expanded={showMore}
                  onClick={() => setShowMore((open) => !open)}
                >
                  {t.moreOptions}
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
                <Divider label={c.or} />
              )
            ) : null}

            {!hasPassword && (hasMagicLink || hasEmailCode) ? (
              <div {...el('fields')}>
                <div {...el('field')}>
                  <label {...el('label')} htmlFor="zv-email">
                    {c.email}
                  </label>
                  <input
                    id="zv-email"
                    {...el('input')}
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
                      {...el(['button', 'buttonSecondary', 'zevIdButton'])}
                      data-variant="secondary"
                      disabled={isBusy}
                      onClick={() => client.signIn.withZevId()}
                    >
                      <ZevMark size={13} />
                      {c.continueWithZevId}
                    </button>
                  ) : null}
                  {hasMagicLink ? (
                    <button
                      type="button"
                      {...el(['button', 'buttonSecondary'])}
                      data-variant="secondary"
                      disabled={isBusy || !identifier}
                      onClick={onSendLink}
                    >
                      {t.emailLink}
                    </button>
                  ) : null}

                  {hasEmailCode ? (
                    <button
                      type="button"
                      {...el(['button', 'buttonSecondary'])}
                      data-variant="secondary"
                      disabled={isBusy || !identifier}
                      onClick={onSendCode}
                    >
                      {t.emailCode}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {hasPassword ? (
              <div {...el('footer')}>
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
                  {...el(['button', 'buttonLink'])}
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
                        setError(t.emailFirst);
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
                  {t.forgotPassword}
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
