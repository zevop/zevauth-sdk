import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ZevAuthError, type UserSession } from '@zevauth/js';
import { errorMessage, format } from '@zevauth/react/headless';
import { useNativeContext } from '../provider.js';
import { Alert, Button, Card, Field, Muted, Notice } from './parts.js';
import { TwoStepSection } from './TwoStep.js';

export interface UserProfileProps {
  /**
   * The two-step section. `'auto'` (default) shows it when the app
   * requires two-step or the person already has it, as on the web.
   */
  showMfa?: boolean | 'auto';
  /** The person's signed-in devices, with sign-out. Off by default, as on the web. */
  showSessions?: boolean;
}

/** Name, password, two-step and devices, for a settings screen. */
export function UserProfile({ showMfa = 'auto', showSessions = false }: UserProfileProps) {
  const { client, state, strings, theme } = useNativeContext('<UserProfile>');
  if (!state.user) return null;
  const policy = client.mfaSettings?.policy;
  const mfaVisible = showMfa === true || (showMfa === 'auto' && policy !== undefined && policy !== 'off');
  return (
    <ScrollView contentContainerStyle={{ gap: 16, padding: 16 }} keyboardShouldPersistTaps="handled">
      <Card testID="zevauth-user-profile">
        <Text
          accessibilityRole="header"
          style={theme.style('title', { color: theme.tokens.text, fontWeight: '600', fontSize: theme.tokens.fontSize * 1.25 })}
        >
          {strings.userProfile.title}
        </Text>
        <ProfileSection />
        <PasswordSection />
        {mfaVisible ? <TwoStepSection /> : null}
        {showSessions ? <SessionsSection /> : null}
      </Card>
    </ScrollView>
  );
}

function SectionTitle({ children }: { children: string }) {
  const { theme } = useNativeContext('<UserProfile>');
  return (
    <Text style={theme.style('sectionTitle', { color: theme.tokens.text, fontWeight: '600', fontSize: theme.tokens.fontSize })}>
      {children}
    </Text>
  );
}

function ProfileSection() {
  const { client, state, strings } = useNativeContext('<UserProfile>');
  const t = strings.userProfile;
  const [firstName, setFirstName] = useState(state.user?.firstName ?? '');
  const [lastName, setLastName] = useState(state.user?.lastName ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const save = () => {
    setBusy(true);
    setMessage(null);
    client.me
      .update({ firstName: firstName.trim(), lastName: lastName.trim() })
      .then(() => setMessage({ ok: true, text: t.saved }))
      .catch((err: unknown) => setMessage({ ok: false, text: errorMessage(strings, err, t.saveFailed) }))
      .finally(() => setBusy(false));
  };
  return (
    <View style={{ gap: 10 }}>
      <Field label={t.firstName} value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoComplete="given-name" />
      <Field label={t.lastName} value={lastName} onChangeText={setLastName} autoCapitalize="words" autoComplete="family-name" />
      <Field label={t.email} value={state.user?.email ?? ''} onChangeText={() => {}} editable={false} />
      {message ? message.ok ? <Notice>{message.text}</Notice> : <Alert>{message.text}</Alert> : null}
      <Button label={t.save} onPress={save} busy={busy} testID="zevauth-profile-save" />
    </View>
  );
}

function PasswordSection() {
  const { client, strings } = useNativeContext('<UserProfile>');
  const t = strings.userProfile;
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const change = () => {
    setBusy(true);
    setMessage(null);
    client.me
      .changePassword({ currentPassword: current, newPassword: next })
      .then(({ otherSessionsRevoked: n }) => {
        setCurrent('');
        setNext('');
        const others = n === 0 ? '' : ' ' + format(n === 1 ? t.otherSessionSignedOut : t.otherSessionsSignedOut, { count: n });
        setMessage({ ok: true, text: t.passwordChanged + others });
      })
      .catch((err: unknown) =>
        setMessage({ ok: false, text: err instanceof ZevAuthError ? errorMessage(strings, err, t.passwordChangeFailed) : t.passwordChangeFailed }),
      )
      .finally(() => setBusy(false));
  };
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle>{t.changePassword}</SectionTitle>
      {message ? message.ok ? <Notice>{message.text}</Notice> : <Alert>{message.text}</Alert> : null}
      {open ? (
        <>
          <Field label={t.currentPassword} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" textContentType="password" />
          <Field label={t.newPassword} hint={t.newPasswordHint} value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
          <Button label={t.changePassword} onPress={change} busy={busy} disabled={!current || next.length < 8} />
        </>
      ) : (
        <Button variant="secondary" label={t.changePassword} onPress={() => setOpen(true)} />
      )}
    </View>
  );
}

/** "iPhone · Safari"-style label from a user agent, without a parser dependency. */
function deviceName(userAgent: string | null, fallback: string): string {
  if (!userAgent) return fallback;
  const os = /iPhone/.test(userAgent) ? 'iPhone' : /iPad/.test(userAgent) ? 'iPad' : /Android/.test(userAgent) ? 'Android'
    : /Mac OS X/.test(userAgent) ? 'Mac' : /Windows/.test(userAgent) ? 'Windows' : /Linux/.test(userAgent) ? 'Linux' : null;
  const app = /Edg\//.test(userAgent) ? 'Edge' : /Chrome\//.test(userAgent) ? 'Chrome' : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Safari\//.test(userAgent) ? 'Safari' : /okhttp|CFNetwork|Expo/i.test(userAgent) ? 'App' : null;
  return [os, app].filter(Boolean).join(' · ') || fallback;
}

function SessionsSection() {
  const { client, strings, theme } = useNativeContext('<UserProfile>');
  const t = strings.userProfile;
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () =>
    client.me
      .sessions()
      .then(setSessions)
      .catch(() => setError(t.sessionsLoadFailed));
  useEffect(() => {
    void load();
  }, [client]);

  const revoke = (id: string | 'others') => {
    setBusy(id);
    setError(null);
    (id === 'others' ? client.me.revokeOtherSessions() : client.me.revokeSession(id))
      .then(load)
      .catch((err: unknown) => setError(errorMessage(strings, err, t.sessionRevokeFailed)))
      .finally(() => setBusy(null));
  };

  return (
    <View style={{ gap: 10 }} testID="zevauth-sessions">
      <SectionTitle>{t.sessionsTitle}</SectionTitle>
      <Muted>{t.sessionsHint}</Muted>
      {error ? <Alert>{error}</Alert> : null}
      {sessions?.length === 0 ? <Muted>{t.sessionsEmpty}</Muted> : null}
      {sessions?.map((s) => (
        <View
          key={s.id}
          style={theme.style('sessionRow', {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingVertical: 8,
          })}
        >
          <View style={{ flexShrink: 1, gap: 2 }}>
            <Text style={{ color: theme.tokens.text, fontSize: theme.tokens.fontSize, fontFamily: theme.tokens.fontFamily }}>
              {deviceName(s.userAgent, t.unknownDevice)}
              {s.isCurrent ? ` · ${t.thisDevice}` : ''}
            </Text>
            {s.ipAddress ? (
              <Muted>{s.ipDisplay === 'coarse' ? format(t.approximateIp, { ip: s.ipAddress }) : s.ipAddress}</Muted>
            ) : null}
          </View>
          {s.isCurrent ? null : (
            <Button variant="secondary" label={t.signOutDevice} onPress={() => revoke(s.id)} busy={busy === s.id} />
          )}
        </View>
      ))}
      {sessions && sessions.some((s) => !s.isCurrent) ? (
        <Button variant="secondary" label={t.signOutOthers} onPress={() => revoke('others')} busy={busy === 'others'} />
      ) : null}
    </View>
  );
}
