import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ZevAuthError, type MfaStatus, type TotpEnrollment, type ZevAuth } from '@zevauth/js';
import { useElements, type Appearance } from '../internal/appearance.js';
import { useComponentAppearance } from '../internal/context.js';
import { errorMessage, format, useStrings, type Localization, type Strings } from '../internal/localization.js';
import { Brandable } from './Brandable.js';
import { Alert, Heading, Identity, PoweredBy, Spinner, TestModeBadge } from './parts.js';

/*
 * Two-step verification, as the person meets it:
 *
 *   SecondFactorStep   the second step of a sign-in
 *   MfaEnrollment      setting up an authenticator app, then saving codes
 *   MfaSection         the block in <UserProfile>'s Security section
 *   TaskSetupMfa       the screen an app that requires it shows after
 *                      sign-in, until the person has set it up
 *
 * The first three render inside a component's root (they read strings
 * and element classes from context); TaskSetupMfa is a component of its
 * own. The rules behind them are in the backend's ARCHITECTURE.md, MFA.
 */

/** The API's reasons, in words for the person. */
function mfaError(strings: Strings, err: unknown): string {
  if (!(err instanceof ZevAuthError)) return strings.mfa.genericFailed;
  const ours: Record<string, string> = {
    mfa_code_invalid: strings.mfa.codeInvalid,
    mfa_challenge_expired: strings.mfa.challengeExpired,
    mfa_locked: strings.mfa.locked,
  };
  return strings.errors[err.code] ?? ours[err.code] ?? errorMessage(strings, err, strings.mfa.genericFailed);
}

/** Digits only, at most six, for the authenticator field. */
function digits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

/**
 * The code field. `one-time-code` lets the phone offer a code it just
 * saw; `numeric` brings up the number pad. A recovery code is letters
 * and a dash, so that variant is a plain text field.
 */
function CodeField({
  id,
  label,
  value,
  onChange,
  recovery,
  disabled,
  autoFocus = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  recovery?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const el = useElements();
  return (
    <div {...el('field')}>
      <label {...el('label')} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        {...el(recovery ? 'input' : ['input', 'codeInput'])}
        data-kind={recovery ? undefined : 'code'}
        value={value}
        onChange={(e) => onChange(recovery ? e.target.value.slice(0, 32) : digits(e.target.value))}
        inputMode={recovery ? 'text' : 'numeric'}
        autoComplete={recovery ? 'off' : 'one-time-code'}
        autoCapitalize={recovery ? 'characters' : undefined}
        spellCheck={false}
        pattern={recovery ? undefined : '[0-9]*'}
        maxLength={recovery ? 32 : 6}
        disabled={disabled}
        required
        autoFocus={autoFocus}
      />
    </div>
  );
}

/**
 * The second step of a sign-in: a code from the app, or a recovery code.
 *
 * Driven by `client.secondFactor`, so it works the same whether the
 * first step happened in this component (a password) or before the page
 * loaded (a magic link, the ZevID handoff): the client holds the
 * challenge either way.
 */
export function SecondFactorStep({ client }: { client: ZevAuth }) {
  const el = useElements();
  const strings = useStrings();
  const t = strings.mfa;

  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const rememberDays = client.mfaSettings?.rememberDeviceDays ?? 0;
  const ready = useRecovery ? code.trim().length >= 8 : code.length === 6;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setIsBusy(true);
    setError(null);
    client.signIn
      .verifySecondFactor({ code: code.trim(), rememberDevice: remember || undefined })
      .catch((err: unknown) => {
        /*
         * An expired challenge cannot be retried with a better code; the
         * only way on is to sign in again, so the step steps aside.
         */
        if (err instanceof ZevAuthError && err.code === 'mfa_challenge_expired') {
          client.cancelSecondFactor();
        }
        setError(mfaError(strings, err));
        setCode('');
      })
      .finally(() => setIsBusy(false));
  };

  return (
    <>
      <Heading
        title={t.challengeTitle}
        subtitle={useRecovery ? t.recoverySubtitle : t.challengeSubtitle}
        fallbackTitle={t.challengeTitle}
      />
      {error ? <Alert>{error}</Alert> : null}
      <form {...el('fields')} onSubmit={onSubmit}>
        <CodeField
          id={useRecovery ? 'zv-mfa-recovery' : 'zv-mfa-code'}
          label={useRecovery ? t.recoveryLabel : t.codeLabel}
          value={code}
          onChange={setCode}
          recovery={useRecovery}
          disabled={isBusy}
        />
        {rememberDays > 0 ? (
          <label {...el('checkbox')}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={isBusy} />
            {format(t.rememberDevice, { days: rememberDays })}
          </label>
        ) : null}
        <button type="submit" {...el(['button', 'buttonPrimary'])} data-variant="primary" disabled={isBusy || !ready}>
          {isBusy ? <Spinner /> : null}
          {t.verify}
        </button>
      </form>
      <button
        type="button"
        {...el(['button', 'buttonLink'])}
        data-variant="ghost"
        onClick={() => {
          setUseRecovery((on) => !on);
          setCode('');
          setError(null);
        }}
      >
        {useRecovery ? t.useApp : t.useRecovery}
      </button>
      <button
        type="button"
        {...el(['button', 'buttonLink'])}
        data-variant="ghost"
        onClick={() => client.cancelSecondFactor()}
      >
        {t.backToSignIn}
      </button>
    </>
  );
}

/**
 * The QR code for the authenticator app, drawn as SVG.
 *
 * The encoder (`uqr`, ~8 kB gzipped, no dependencies) is loaded only
 * when this renders, so apps that never show setup never download it.
 * Drawn here rather than with its own SVG renderer so the markup is one
 * path we control: a fixed quiet zone and nothing else.
 */
function QrCode({ value, label }: { value: string; label: string }) {
  const el = useElements();
  const [path, setPath] = useState<{ d: string; size: number } | null>(null);

  useEffect(() => {
    let live = true;
    void import('uqr').then(({ encode }) => {
      if (!live) return;
      const { data, size } = encode(value, { ecc: 'M', border: 0 });
      let d = '';
      data.forEach((row, y) =>
        row.forEach((on, x) => {
          if (on) d += `M${x} ${y}h1v1h-1z`;
        }),
      );
      setPath({ d, size });
    });
    return () => {
      live = false;
    };
  }, [value]);

  if (!path) return <div {...el('qrCode')} data-loading="true" role="img" aria-label={label} />;
  return (
    <svg
      {...el('qrCode')}
      viewBox={`0 0 ${path.size} ${path.size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <path d={path.d} fill="#000000" />
    </svg>
  );
}

/** Recovery codes, shown once, with ways to keep them. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const el = useElements();
  const t = useStrings().mfa;
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');

  return (
    <div className="zv-section">
      <span {...el('sectionTitle')}>{t.recoveryTitle}</span>
      <span {...el('hint')}>{t.recoveryHint}</span>
      <ul {...el('recoveryCodes')}>
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="zv-button-row">
        <button
          type="button"
          {...el(['button', 'buttonSecondary'])}
          data-variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => setCopied(true));
          }}
        >
          {copied ? t.copied : t.copyCodes}
        </button>
        <button
          type="button"
          {...el(['button', 'buttonSecondary'])}
          data-variant="secondary"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'recovery-codes.txt';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          {t.downloadCodes}
        </button>
      </div>
      <button type="button" {...el(['button', 'buttonPrimary'])} data-variant="primary" onClick={onDone}>
        {t.savedCodes}
      </button>
    </div>
  );
}

/**
 * Setting up an authenticator app: scan, confirm with the first code,
 * then save the recovery codes. `onDone` runs after the codes are saved;
 * the session has already been refreshed by then, so a `setup_mfa` task
 * is gone.
 */
export function MfaEnrollment({
  client,
  onDone,
  onCancel,
}: {
  client: ZevAuth;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const el = useElements();
  const strings = useStrings();
  const t = strings.mfa;

  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const start = () => {
    setIsBusy(true);
    setError(null);
    client.mfa
      .startTotp()
      .then(setEnrollment)
      .catch((err: unknown) => setError(mfaError(strings, err)))
      .finally(() => setIsBusy(false));
  };

  const confirm = (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) return;
    setIsBusy(true);
    setError(null);
    client.mfa
      .confirmTotp({ code })
      .then((result) => setCodes(result.recoveryCodes))
      .catch((err: unknown) => {
        setError(mfaError(strings, err));
        setCode('');
      })
      .finally(() => setIsBusy(false));
  };

  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;

  if (!enrollment) {
    return (
      <>
        {error ? <Alert>{error}</Alert> : null}
        <div className="zv-button-row">
          <button type="button" {...el(['button', 'buttonPrimary'])} data-variant="primary" onClick={start} disabled={isBusy}>
            {isBusy ? <Spinner /> : null}
            {t.setupStart}
          </button>
          {onCancel ? (
            <button type="button" {...el(['button', 'buttonSecondary'])} data-variant="secondary" onClick={onCancel}>
              {t.cancel}
            </button>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <div className="zv-section">
      <span {...el('hint')}>{t.scanQr}</span>
      <QrCode value={enrollment.otpauthUri} label={t.qrAlt} />
      <span {...el('hint')}>{t.manualEntry}</span>
      <span {...el('secretKey')}>{enrollment.secret.replace(/(.{4})/g, '$1 ').trim()}</span>
      {error ? <Alert>{error}</Alert> : null}
      <form {...el('fields')} onSubmit={confirm}>
        <CodeField id="zv-mfa-confirm" label={t.confirmLabel} value={code} onChange={setCode} disabled={isBusy} autoFocus={false} />
        <div className="zv-button-row">
          <button type="submit" {...el(['button', 'buttonPrimary'])} data-variant="primary" disabled={isBusy || code.length !== 6}>
            {isBusy ? <Spinner /> : null}
            {t.confirm}
          </button>
          {onCancel ? (
            <button type="button" {...el(['button', 'buttonSecondary'])} data-variant="secondary" onClick={onCancel}>
              {t.cancel}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

type SectionMode = 'idle' | 'enroll' | 'remove' | 'regenerate';

/**
 * Two-step verification in a profile's Security section.
 *
 * Reads the person's status from the API once, then offers what applies:
 * set it up, or (once on) new recovery codes and turning it off. Turning
 * it off and new codes both need a current code, as the API does.
 */
export function MfaSection({
  client,
  visibility = 'always',
  divider = false,
}: {
  client: ZevAuth;
  /**
   * `always` shows the section. `auto` shows it only once the status says
   * it matters: the app requires two-step, or the person already has it
   * (so they can manage or remove it). Nothing renders while it loads.
   */
  visibility?: 'always' | 'auto';
  /** Draw a section divider above it, only when it renders. */
  divider?: boolean;
}) {
  const el = useElements();
  const strings = useStrings();
  const t = strings.mfa;

  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [mode, setMode] = useState<SectionMode>('idle');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const load = () =>
    client.mfa
      .status()
      .then(setStatus)
      .catch(() => setError(t.loadFailed));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const enabled = (status?.factors.length ?? 0) > 0;
  const required = status?.policy === 'required';
  const factor = status?.factors[0];
  const hidden = visibility === 'auto' && !(enabled || required);

  const reset = () => {
    setMode('idle');
    setCode('');
    setError(null);
  };

  const withCode = (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    setIsBusy(true);
    setError(null);
    const action =
      mode === 'remove' && factor
        ? client.mfa.removeFactor({ factorId: factor.id, code: code.trim() }).then(() => null)
        : client.mfa.regenerateRecoveryCodes({ code: code.trim() });
    void action
      .then((result) => {
        if (Array.isArray(result)) setCodes(result);
        reset();
        return load();
      })
      .catch((err: unknown) => {
        setError(mfaError(strings, err));
        setCode('');
      })
      .finally(() => setIsBusy(false));
  };

  if (hidden) return null;

  return (
    <>
    {divider ? <hr {...el('sectionDivider')} /> : null}
    <div className="zv-section">
      <div className="zv-section-row">
        <span {...el('sectionTitle')}>{t.sectionTitle}</span>
        {status ? <span {...el('badge')}>{enabled ? t.statusOn : t.statusOff}</span> : null}
      </div>
      <span {...el('hint')}>{t.sectionHint}</span>
      {error && mode === 'idle' ? <Alert>{error}</Alert> : null}

      {status === null && !error ? <Spinner /> : null}

      {codes ? (
        <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
      ) : mode === 'enroll' ? (
        <MfaEnrollment
          client={client}
          onCancel={reset}
          onDone={() => {
            reset();
            void load();
          }}
        />
      ) : mode === 'remove' || mode === 'regenerate' ? (
        <form {...el('fields')} onSubmit={withCode}>
          <span {...el('hint')}>{mode === 'remove' ? t.removeHint : t.regenerateHint}</span>
          {error ? <Alert>{error}</Alert> : null}
          {/* Either a code from the app or a recovery code, so a plain field. */}
          <CodeField id="zv-mfa-stepup" label={t.stepUpLabel} value={code} onChange={setCode} recovery disabled={isBusy} />
          <div className="zv-button-row">
            <button
              type="submit"
              {...el(mode === 'remove' ? ['button', 'buttonDanger'] : ['button', 'buttonPrimary'])}
              data-variant={mode === 'remove' ? 'danger' : 'primary'}
              disabled={isBusy || !code.trim()}
            >
              {isBusy ? <Spinner /> : null}
              {mode === 'remove' ? t.remove : t.regenerate}
            </button>
            <button type="button" {...el(['button', 'buttonSecondary'])} data-variant="secondary" onClick={reset}>
              {t.cancel}
            </button>
          </div>
        </form>
      ) : status && !enabled ? (
        <>
          {required ? <span {...el('hint')}>{t.required}</span> : null}
          <button
            type="button"
            {...el(['button', 'buttonSecondary'])}
            data-variant="secondary"
            style={{ width: 'auto', alignSelf: 'flex-start' }}
            onClick={() => setMode('enroll')}
          >
            {t.setUp}
          </button>
        </>
      ) : status && enabled ? (
        <>
          <span {...el('hint')}>{format(t.recoveryRemaining, { count: status.recoveryCodesRemaining })}</span>
          {required ? <span {...el('hint')}>{t.cannotRemoveRequired}</span> : null}
          <div className="zv-button-row">
            <button type="button" {...el(['button', 'buttonSecondary'])} data-variant="secondary" onClick={() => setMode('regenerate')}>
              {t.regenerate}
            </button>
            {required ? null : (
              <button type="button" {...el(['button', 'buttonDanger'])} data-variant="danger" onClick={() => setMode('remove')}>
                {t.remove}
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
    </>
  );
}

export interface TaskSetupMfaProps {
  /** Where to go once two-step verification is set up. */
  afterSetupUrl?: string;
  /** Called once it is set up and the codes are saved. */
  onComplete?: () => void;
  /** How this component looks, merged over the provider's `appearance`. */
  appearance?: Appearance;
  /** The words on this component, merged over the provider's `localization`. */
  localization?: Localization;
  className?: string;
}

/**
 * The screen an app that requires two-step verification shows after
 * sign-in, until the person has set it up.
 *
 * Renders nothing unless the session has a `setup_mfa` task, so it can
 * sit on a page unconditionally. `<SignIn>` shows it by itself when a
 * sign-in ends with that task; place it yourself to catch somebody who
 * arrives some other way (a page reload, a session restored on load).
 */
export function TaskSetupMfa({ afterSetupUrl, onComplete, appearance, localization, className }: TaskSetupMfaProps) {
  const {
    client,
    state,
    branding,
    appearance: appearanceLayers,
    el,
    strings,
  } = useComponentAppearance('<TaskSetupMfa>', appearance, localization);
  const t = strings.mfa;

  const pending = Boolean(
    state.isLoaded && state.user && (state.pendingTasks ?? client.pendingTasks).includes('setup_mfa'),
  );
  /*
   * Latched once shown. Confirming the app refreshes the session, which
   * clears the task, and without the latch this screen would vanish
   * before the person saw the recovery codes it exists to show them.
   */
  const shown = useRef(false);
  const [done, setDone] = useState(false);
  if (pending) shown.current = true;
  if (done || !state.user || !(pending || shown.current)) return null;

  return (
    <Brandable branding={branding} appearance={appearanceLayers} el={el} strings={strings} className={className}>
      <div {...el('card')} data-chrome={branding?.cardStyle ?? 'card'}>
        {client.isTestMode ? <TestModeBadge /> : null}
        <Identity branding={branding} />
        <Heading title={t.setupTitle} subtitle={t.setupSubtitle} fallbackTitle={t.setupTitle} />
        <MfaEnrollment
          client={client}
          onDone={() => {
            setDone(true);
            onComplete?.();
            if (afterSetupUrl && typeof window !== 'undefined') window.location.assign(afterSetupUrl);
          }}
        />
        <button
          type="button"
          {...el(['button', 'buttonLink'])}
          data-variant="ghost"
          onClick={() => void client.signOut()}
        >
          {t.signOut}
        </button>
        {branding?.showPoweredBy !== false ? <PoweredBy environmentId={client.environmentId} /> : null}
      </div>
    </Brandable>
  );
}
