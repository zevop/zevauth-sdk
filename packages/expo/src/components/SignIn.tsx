import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { ZevAuthError } from '@zevauth/js';
import { errorMessage, format } from '@zevauth/react/headless';
import { useNativeContext } from '../provider.js';
import type { NativeAppearance } from '../theme.js';
import { Alert, Button, Card, Divider, Field, Footer, Heading, Identity, Muted, Notice } from './parts.js';
import { SecondFactorStep, TaskSetupMfa } from './TwoStep.js';

export interface SignInProps {
  /**
   * Called once somebody is signed in (and any required two-step setup
   * is done). Navigate from here; the component never navigates itself,
   * because it cannot know your router.
   */
  onSignedIn?: () => void;
  /** Rendered instead of the form while somebody is signed in. */
  children?: ReactNode;
  /** Kept for parity with the web prop; native appearance is set on the provider. */
  appearance?: NativeAppearance;
}

type Stage =
  | { name: 'credentials' }
  | { name: 'code-sent'; email: string }
  | { name: 'link-sent'; email: string };

/**
 * A complete native sign-in: whichever of password, email code, sign-in
 * link and ZevID the environment has enabled, the same as the web
 * component, then the second factor or the required two-step setup when
 * they apply.
 */
export function SignIn({ onSignedIn, children }: SignInProps) {
  const { client, state, strings, native, redirectUrl, browser, branding, handoffError, clearHandoffError, handleUrl } =
    useNativeContext('<SignIn>');
  const t = strings.signIn;
  const c = strings.common;
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<Stage>({ name: 'credentials' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => client.takeHandoffError()?.description ?? null);

  if (state.secondFactor) return <SecondFactorStep />;
  if (state.user && state.pendingTasks?.includes('setup_mfa')) {
    return <TaskSetupMfa onComplete={onSignedIn} />;
  }
  if (state.user) return <>{children ?? null}</>;

  const methods = client.signInMethods;
  const hasPassword = methods.includes('email_password');
  const hasMagicLink = methods.includes('magic_link');
  const hasEmailCode = methods.includes('email_otp');
  const hasZevId = methods.includes('zevid');
  const shown = error ?? handoffError?.description ?? null;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    clearHandoffError();
    try {
      await action();
      if (client.user && !client.secondFactor && !client.pendingTasks.includes('setup_mfa')) onSignedIn?.();
    } catch (err) {
      setError(err instanceof ZevAuthError ? errorMessage(strings, err, c.genericError) : c.genericError);
    } finally {
      setBusy(false);
    }
  };

  const withZevId = () =>
    run(async () => {
      const url = await client.createZevIdAuthorizationUrl({ redirectUrl });
      const result = await browser.open(url, redirectUrl);
      if (result.type === 'cancel') {
        client.cancelZevIdSignIn();
        return;
      }
      // The provider finishes it, once, whichever way the return arrives.
      await handleUrl(result.url);
    });

  if (!state.isLoaded) {
    return (
      <Card>
        <Identity />
      </Card>
    );
  }

  if (stage.name === 'link-sent') {
    return (
      <Card testID="zevauth-link-sent">
        <Identity />
        <Heading title={t.linkSentTitle} subtitle={format(t.linkSentBody, { email: stage.email })} />
        <Muted style={{ textAlign: 'center' }}>{native.openLinkOnPhone}</Muted>
        <Button variant="link" label={t.useSomethingElse} onPress={() => setStage({ name: 'credentials' })} />
        <Footer />
      </Card>
    );
  }

  if (stage.name === 'code-sent') {
    const verify = () => run(() => client.signIn.verifyEmailCode({ email: stage.email, code: code.trim() }));
    return (
      <Card testID="zevauth-code-sent">
        <Identity />
        <Heading title={t.codeSentTitle} subtitle={format(t.codeSentBody, { email: stage.email })} />
        {shown ? <Alert>{shown}</Alert> : null}
        <Field
          testID="zevauth-email-code"
          label={t.codeLabel}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          onSubmitEditing={verify}
          code
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          autoFocus
        />
        <Button label={c.continue} onPress={verify} busy={busy} disabled={code.length < 6} />
        <Button variant="link" label={t.useSomethingElse} onPress={() => setStage({ name: 'credentials' })} />
        <Footer />
      </Card>
    );
  }

  const title = branding?.signInTitle === undefined ? t.title : branding.signInTitle;
  const emailFirst = () => {
    if (!identifier.trim()) {
      setError(t.emailFirst);
      return false;
    }
    return true;
  };

  return (
    <Card testID="zevauth-sign-in">
      <Identity />
      <Heading title={title} subtitle={branding?.signInSubtitle} />
      {shown ? <Alert>{shown}</Alert> : null}

      {hasZevId ? (
        <>
          <Button variant="secondary" zevId label={c.continueWithZevId} onPress={() => void withZevId()} disabled={busy} testID="zevauth-zevid" />
          {hasPassword || hasMagicLink || hasEmailCode ? <Divider label={c.or} /> : null}
        </>
      ) : null}

      {hasPassword || hasMagicLink || hasEmailCode ? (
        <View style={{ gap: 12 }}>
          <Field
            testID="zevauth-identifier"
            label={c.email}
            value={identifier}
            onChangeText={setIdentifier}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="username"
          />
          {hasPassword ? (
            <>
              <Field
                testID="zevauth-password"
                label={c.password}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                onSubmitEditing={() => void run(() => client.signIn.withPassword({ identifier: identifier.trim(), password }))}
              />
              <Button
                label={t.submit}
                busy={busy}
                disabled={!identifier || !password}
                testID="zevauth-submit"
                onPress={() => void run(() => client.signIn.withPassword({ identifier: identifier.trim(), password }))}
              />
            </>
          ) : null}
          {hasPassword && (hasMagicLink || hasEmailCode) ? <Divider label={c.or} /> : null}
          {hasMagicLink ? (
            <Button
              variant="secondary"
              label={t.emailLink}
              disabled={busy}
              testID="zevauth-magic-link"
              onPress={() => {
                if (!emailFirst()) return;
                const email = identifier.trim();
                void run(async () => {
                  await client.signIn.startMagicLink({ email, redirectUrl });
                  setStage({ name: 'link-sent', email });
                });
              }}
            />
          ) : null}
          {hasEmailCode ? (
            <Button
              variant="secondary"
              label={t.emailCode}
              disabled={busy}
              testID="zevauth-email-code-start"
              onPress={() => {
                if (!emailFirst()) return;
                const email = identifier.trim();
                void run(async () => {
                  await client.signIn.startEmailCode({ email });
                  setStage({ name: 'code-sent', email });
                });
              }}
            />
          ) : null}
        </View>
      ) : null}

      {!hasPassword && !hasMagicLink && !hasEmailCode && !hasZevId ? <Notice>{t.noMethods}</Notice> : null}
      <Footer />
    </Card>
  );
}
