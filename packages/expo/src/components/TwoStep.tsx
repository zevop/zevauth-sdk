import { useEffect, useState } from 'react';
import { Linking, Pressable, Share, Text, View } from 'react-native';
import { ZevAuthError, type MfaStatus, type TotpEnrollment } from '@zevauth/js';
import { errorMessage, format, type Strings } from '@zevauth/react/headless';
import { useNativeContext } from '../provider.js';
import { Alert, Button, Card, Field, Footer, Heading, Identity, Muted, useTheme } from './parts.js';

function mfaError(strings: Strings, err: unknown): string {
  if (!(err instanceof ZevAuthError)) return strings.mfa.genericFailed;
  const ours: Record<string, string> = {
    mfa_code_invalid: strings.mfa.codeInvalid,
    mfa_challenge_expired: strings.mfa.challengeExpired,
    mfa_locked: strings.mfa.locked,
  };
  return strings.errors[err.code] ?? ours[err.code] ?? errorMessage(strings, err, strings.mfa.genericFailed);
}

/** Digits only, at most six. */
const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

/**
 * The code step of a sign-in that needs a second factor. Rendered by
 * `<SignIn>` and `<SignUp>` whenever the client holds a challenge,
 * including one that arrived through a link.
 */
export function SecondFactorStep() {
  const { client, strings } = useNativeContext('<SignIn>');
  const t = strings.mfa;
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rememberDays = client.mfaSettings?.rememberDeviceDays ?? 0;

  const submit = () => {
    setBusy(true);
    setError(null);
    client.signIn
      .verifySecondFactor({ code: code.trim(), rememberDevice: rememberDays > 0 ? remember : undefined })
      .catch((err: unknown) => {
        setError(mfaError(strings, err));
        if (err instanceof ZevAuthError && err.code === 'mfa_challenge_expired') client.cancelSecondFactor();
      })
      .finally(() => setBusy(false));
  };

  return (
    <Card testID="zevauth-second-factor">
      <Identity />
      <Heading title={t.challengeTitle} subtitle={recovery ? t.recoverySubtitle : t.challengeSubtitle} />
      {error ? <Alert>{error}</Alert> : null}
      <Field
        testID="zevauth-mfa-code"
        label={recovery ? t.recoveryLabel : t.codeLabel}
        value={code}
        onChangeText={(v) => setCode(recovery ? v : digits(v))}
        onSubmitEditing={submit}
        code={!recovery}
        keyboardType={recovery ? 'default' : 'number-pad'}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus
      />
      {rememberDays > 0 ? (
        <Toggle value={remember} onChange={setRemember} label={format(t.rememberDevice, { days: rememberDays })} />
      ) : null}
      <Button label={t.verify} onPress={submit} busy={busy} disabled={code.trim().length < (recovery ? 6 : 6)} testID="zevauth-mfa-verify" />
      <Button
        variant="link"
        label={recovery ? t.useApp : t.useRecovery}
        onPress={() => {
          setRecovery((r) => !r);
          setCode('');
          setError(null);
        }}
      />
      <Button variant="link" label={t.backToSignIn} onPress={() => client.cancelSecondFactor()} />
      <Footer />
    </Card>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const theme = useTheme();
  const t = theme.tokens;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: value ? t.primary : t.border,
          backgroundColor: value ? t.primary : 'transparent',
        }}
      />
      <Text style={{ color: t.text, fontSize: t.fontSize * 0.93, fontFamily: t.fontFamily, flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Setting up an authenticator on a phone.
 *
 * No QR code: the person is holding the device the code would be
 * scanned with. Instead, "Open authenticator app" hands the `otpauth://`
 * link to whichever authenticator is installed, and the key is shown,
 * grouped and selectable, for typing in by hand.
 */
export function EnrollTotp({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const { client, strings, native, theme } = useNativeContext('<TaskSetupMfa>');
  const t = strings.mfa;
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setBusy(true);
    setError(null);
    client.mfa
      .startTotp()
      .then(setEnrollment)
      .catch((err: unknown) => setError(mfaError(strings, err)))
      .finally(() => setBusy(false));
  };

  const confirm = () => {
    setBusy(true);
    setError(null);
    client.mfa
      .confirmTotp({ code: code.trim() })
      .then((result) => setCodes(result.recoveryCodes))
      .catch((err: unknown) => setError(mfaError(strings, err)))
      .finally(() => setBusy(false));
  };

  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;

  if (!enrollment) {
    return (
      <View style={{ gap: 12 }}>
        {error ? <Alert>{error}</Alert> : null}
        <Button label={t.setupStart} onPress={start} busy={busy} testID="zevauth-mfa-start" />
        {onCancel ? <Button variant="secondary" label={t.cancel} onPress={onCancel} /> : null}
      </View>
    );
  }

  const openAuthenticator = () => {
    void Linking.canOpenURL(enrollment.otpauthUri)
      .then((can) => (can ? Linking.openURL(enrollment.otpauthUri) : Promise.reject(new Error('none'))))
      .catch(() => setError(native.noAuthenticator));
  };

  return (
    <View style={{ gap: 12 }}>
      {error ? <Alert>{error}</Alert> : null}
      <Button variant="secondary" label={native.openAuthenticator} onPress={openAuthenticator} testID="zevauth-mfa-open-app" />
      <View style={{ gap: 6 }}>
        <Muted>{native.setupKeyLabel}</Muted>
        <Text
          selectable
          testID="zevauth-mfa-secret"
          style={theme.style('secretKey', {
            color: theme.tokens.text,
            fontFamily: 'Menlo',
            fontSize: theme.tokens.fontSize,
            letterSpacing: 1,
          })}
        >
          {enrollment.secret.replace(/(.{4})/g, '$1 ').trim()}
        </Text>
        <Button variant="link" label={native.shareKey} onPress={() => void Share.share({ message: enrollment.secret })} />
      </View>
      <Field
        testID="zevauth-mfa-confirm-code"
        label={t.confirmLabel}
        value={code}
        onChangeText={(v) => setCode(digits(v))}
        onSubmitEditing={confirm}
        code
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
      />
      <Button label={t.confirm} onPress={confirm} busy={busy} disabled={code.length < 6} testID="zevauth-mfa-confirm" />
      {onCancel ? <Button variant="link" label={t.cancel} onPress={onCancel} /> : null}
    </View>
  );
}

/** Shown once, straight after setup or regeneration. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { strings, native, theme } = useNativeContext('<TaskSetupMfa>');
  const t = strings.mfa;
  return (
    <View style={{ gap: 12 }} testID="zevauth-recovery-codes">
      <Text style={{ color: theme.tokens.text, fontWeight: '600', fontSize: theme.tokens.fontSize * 1.05 }}>{t.recoveryTitle}</Text>
      <Muted>{t.recoveryHint}</Muted>
      <View style={theme.style('recoveryCodes', { gap: 4, padding: 12, borderRadius: theme.tokens.radius, borderWidth: 1, borderColor: theme.tokens.border })}>
        {codes.map((c) => (
          <Text key={c} selectable style={{ color: theme.tokens.text, fontFamily: 'Menlo', fontSize: theme.tokens.fontSize }}>
            {c}
          </Text>
        ))}
      </View>
      <Button variant="secondary" label={native.shareCodes} onPress={() => void Share.share({ message: codes.join('\n') })} />
      <Button label={t.savedCodes} onPress={onDone} testID="zevauth-codes-saved" />
    </View>
  );
}

/**
 * The step a session must finish when the app requires two-step
 * verification. `<SignIn>` shows it on its own; render it yourself if
 * you route signed-in people elsewhere.
 */
export function TaskSetupMfa({ onComplete }: { onComplete?: () => void }) {
  const { client, strings } = useNativeContext('<TaskSetupMfa>');
  const t = strings.mfa;
  return (
    <Card testID="zevauth-task-setup-mfa">
      <Identity />
      <Heading title={t.setupTitle} subtitle={t.setupSubtitle} />
      <EnrollTotp onDone={() => onComplete?.()} />
      <Button variant="link" label={t.signOut} onPress={() => void client.signOut()} />
      <Footer />
    </Card>
  );
}

/** The two-step section of `<UserProfile>`. */
export function TwoStepSection() {
  const { client, strings, theme } = useNativeContext('<UserProfile>');
  const t = strings.mfa;
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [mode, setMode] = useState<'idle' | 'enroll' | 'remove' | 'regenerate'>('idle');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    client.mfa
      .status()
      .then(setStatus)
      .catch(() => setError(t.loadFailed));
  useEffect(() => {
    void load();
  }, [client]);

  if (!status) return error ? <Alert>{error}</Alert> : null;
  const factor = status.factors[0];

  const act = () => {
    if (!factor) return;
    setBusy(true);
    setError(null);
    const run =
      mode === 'remove'
        ? client.mfa.removeFactor({ factorId: factor.id, code: code.trim() }).then(() => null)
        : client.mfa.regenerateRecoveryCodes({ code: code.trim() }).then((r) => r.recoveryCodes);
    run
      .then((fresh) => {
        setMode('idle');
        setCode('');
        if (fresh) setCodes(fresh);
        return load();
      })
      .catch((err: unknown) => setError(mfaError(strings, err)))
      .finally(() => setBusy(false));
  };

  return (
    <View style={{ gap: 10 }} testID="zevauth-two-step">
      <Text style={theme.style('sectionTitle', { color: theme.tokens.text, fontWeight: '600', fontSize: theme.tokens.fontSize })}>
        {t.sectionTitle}
      </Text>
      <Muted>{factor ? t.statusOn : status.policy === 'required' ? t.required : t.statusOff}</Muted>
      {error ? <Alert>{error}</Alert> : null}
      {codes ? (
        <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
      ) : mode === 'enroll' ? (
        <EnrollTotp onDone={() => { setMode('idle'); void load(); }} onCancel={() => setMode('idle')} />
      ) : mode !== 'idle' ? (
        <View style={{ gap: 10 }}>
          <Muted>{mode === 'remove' ? t.removeHint : t.regenerateHint}</Muted>
          <Field label={t.codeLabel} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" />
          <Button variant={mode === 'remove' ? 'danger' : 'primary'} label={mode === 'remove' ? t.remove : t.regenerate} onPress={act} busy={busy} />
          <Button variant="link" label={t.cancel} onPress={() => setMode('idle')} />
        </View>
      ) : factor ? (
        <View style={{ gap: 8 }}>
          <Muted>{format(t.recoveryRemaining, { count: status.recoveryCodesRemaining })}</Muted>
          <Button variant="secondary" label={t.regenerate} onPress={() => setMode('regenerate')} />
          {status.policy === 'required' ? (
            <Muted>{t.cannotRemoveRequired}</Muted>
          ) : (
            <Button variant="secondary" label={t.remove} onPress={() => setMode('remove')} />
          )}
        </View>
      ) : (
        <Button label={t.setUp} onPress={() => setMode('enroll')} testID="zevauth-mfa-setup" />
      )}
    </View>
  );
}
