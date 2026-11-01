import { useState } from 'react';
import { View } from 'react-native';
import { ZevAuthError } from '@zevauth/js';
import { errorMessage, format } from '@zevauth/react/headless';
import { useNativeContext } from '../provider.js';
import { Alert, Button, Card, Divider, Field, Footer, Heading, Identity, Notice } from './parts.js';
import { SecondFactorStep, TaskSetupMfa } from './TwoStep.js';

export interface SignUpProps {
  /** Called once the account exists and a session has started. */
  onSignedUp?: () => void;
  /**
   * Called when the email is confirmed but the environment does not
   * start a session on confirmation, so the person should sign in.
   */
  onVerifiedNeedsSignIn?: () => void;
  /** Ask for the password twice. On by default, as on the web. */
  requireConfirmPassword?: boolean;
}

/**
 * Account creation, including confirming the address with the emailed
 * code when the environment asks for it. Links in that email open the
 * app through the provider's redirect, the same as a sign-in link.
 */
export function SignUp({ onSignedUp, onVerifiedNeedsSignIn, requireConfirmPassword = true }: SignUpProps) {
  const { client, state, strings, native, redirectUrl, browser, branding, handleUrl } = useNativeContext('<SignUp>');
  const t = strings.signUp;
  const c = strings.common;
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.secondFactor) return <SecondFactorStep />;
  if (state.user && state.pendingTasks?.includes('setup_mfa')) return <TaskSetupMfa onComplete={onSignedUp} />;
  if (state.user) return null;

  const methods = client.signInMethods;
  const hasPassword = methods.includes('email_password');
  const hasZevId = methods.includes('zevid');
  const mismatch = requireConfirmPassword && confirm.length > 0 && confirm !== password;
  const fail = (err: unknown, fallback: string) =>
    setError(err instanceof ZevAuthError ? errorMessage(strings, err, fallback) : fallback);

  const submit = () => {
    setBusy(true);
    setError(null);
    client.signUp
      .create({ email: email.trim(), password, firstName: firstName.trim() || undefined, redirectUrl })
      .then((result) => {
        if (result.requiresEmailVerification) setAwaitingCode(true);
        else if (client.user) onSignedUp?.();
      })
      .catch((err: unknown) => fail(err, c.genericError))
      .finally(() => setBusy(false));
  };

  if (awaitingCode) {
    const strategies = client.emailVerification?.strategies ?? [];
    const wantsCode = strategies.length === 0 || strategies.includes('code');
    const body = wantsCode
      ? format(strategies.includes('link') ? t.verifyBodyLinkAndCode : t.verifyBodyCode, { email: email.trim() })
      : format(t.verifyBodyLink, { email: email.trim() });
    const verify = () => {
      setBusy(true);
      setError(null);
      client.signUp
        .verifyCode({ email: email.trim(), code: code.trim() })
        // Confirming returns no session. The password typed a moment ago
        // in this form signs them in; a second step takes over if needed.
        .then(() => (client.user ? undefined : client.signIn.withPassword({ identifier: email.trim(), password })))
        .then(() => {
          if (client.user) onSignedUp?.();
          else if (!client.secondFactor) {
            setNotice(native.emailVerifiedSignIn);
            onVerifiedNeedsSignIn?.();
          }
        })
        .catch((err: unknown) => fail(err, t.codeRejected))
        .finally(() => setBusy(false));
    };
    return (
      <Card testID="zevauth-verify-email">
        <Identity />
        <Heading title={t.verifyTitle} subtitle={body} />
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Notice>{notice}</Notice> : null}
        {wantsCode && !notice ? (
          <>
            <Field
              testID="zevauth-verify-code"
              label={t.verifyCodeLabel}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              onSubmitEditing={verify}
              code
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              autoFocus
            />
            <Button label={t.verifySubmit} onPress={verify} busy={busy} disabled={code.length < 6} testID="zevauth-verify-submit" />
          </>
        ) : null}
        <Footer />
      </Card>
    );
  }

  const title = branding?.signUpTitle === undefined ? t.title : branding.signUpTitle;

  return (
    <Card testID="zevauth-sign-up">
      <Identity />
      <Heading title={title} subtitle={branding?.signUpSubtitle} />
      {error ? <Alert>{error}</Alert> : null}
      {hasZevId ? (
        <>
          <Button
            variant="secondary"
            zevId
            label={c.continueWithZevId}
            disabled={busy}
            onPress={() =>
              void (async () => {
                const url = await client.createZevIdAuthorizationUrl({ redirectUrl });
                const result = await browser.open(url, redirectUrl);
                if (result.type === 'cancel') client.cancelZevIdSignIn();
                else await handleUrl(result.url);
              })().catch((err: unknown) => fail(err, c.genericError))
            }
          />
          {hasPassword ? <Divider label={c.or} /> : null}
        </>
      ) : null}
      {hasPassword ? (
        <View style={{ gap: 12 }}>
          <Field label={t.firstName} hint={t.optional} value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoComplete="given-name" textContentType="givenName" />
          <Field testID="zevauth-signup-email" label={c.email} value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
          <Field testID="zevauth-signup-password" label={c.password} hint={t.passwordHint} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
          {requireConfirmPassword ? (
            <Field
              testID="zevauth-signup-confirm"
              label={t.confirmPassword}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              error={mismatch ? t.passwordsDiffer : null}
            />
          ) : null}
          <Button
            label={t.submit}
            onPress={submit}
            busy={busy}
            testID="zevauth-signup-submit"
            disabled={!email || password.length < 8 || mismatch || (requireConfirmPassword && confirm.length === 0)}
          />
        </View>
      ) : null}
      {!hasPassword && !hasZevId ? <Notice>{t.noMethods}</Notice> : null}
      <Footer />
    </Card>
  );
}
