import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useNativeContext } from '../provider.js';
import type { NativeStyle } from '../theme.js';

/** The theme for the component being rendered. */
export function useTheme() {
  const { theme } = useNativeContext('A ZevAuth component');
  return theme;
}

/**
 * The box every screen sits in.
 *
 * `flat` drops the border and surface, as on the web, for an app that
 * already draws its own panel.
 */
export function Card({ children, testID }: { children: ReactNode; testID?: string }) {
  const { theme, branding } = useNativeContext('A ZevAuth component');
  const t = theme.tokens;
  const flat = branding?.cardStyle === 'flat';
  return (
    <View
      testID={testID}
      style={theme.style('card', {
        width: '100%',
        maxWidth: 420,
        alignSelf: 'center',
        gap: 16,
        padding: flat ? 0 : 24,
        backgroundColor: flat ? 'transparent' : t.surface,
        borderWidth: flat ? 0 : 1,
        borderColor: t.border,
        borderRadius: Math.min(t.radius * 1.5, 28),
      })}
    >
      {children}
    </View>
  );
}

export function Identity() {
  const { theme, branding } = useNativeContext('A ZevAuth component');
  if (!branding || branding.showIdentity === false) return null;
  const showName = !branding.logoUrl || branding.showAppName;
  return (
    <View style={theme.style('identity', { alignItems: 'center', gap: 8 })}>
      {branding.logoUrl ? (
        <Image
          source={{ uri: branding.logoUrl }}
          resizeMode="contain"
          accessibilityLabel={showName ? undefined : branding.appName}
          style={theme.style('logo', { height: 32, width: 160 })}
        />
      ) : null}
      {showName ? (
        <Text style={theme.style('appName', textStyle(theme.tokens, 'muted', 0.9))}>{branding.appName}</Text>
      ) : null}
    </View>
  );
}

type Tone = 'text' | 'muted' | 'danger';

function textStyle(t: ReturnType<typeof useTheme>['tokens'], tone: Tone, scale = 1): NativeStyle {
  return {
    color: tone === 'text' ? t.text : tone === 'muted' ? t.muted : t.danger,
    fontSize: Math.round(t.fontSize * scale * 10) / 10,
    fontFamily: t.fontFamily,
  };
}

export function Heading({ title, subtitle }: { title: string | null | undefined; subtitle?: string | null }) {
  const theme = useTheme();
  const t = theme.tokens;
  return (
    <View style={{ gap: 6 }}>
      {title ? (
        <Text accessibilityRole="header" style={theme.style('title', [textStyle(t, 'text', 1.25), { fontWeight: '600', textAlign: 'center' }])}>
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text style={theme.style('subtitle', [textStyle(t, 'muted', 0.95), { textAlign: 'center', lineHeight: t.fontSize * 1.4 }])}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function Field({
  label,
  hint,
  error,
  code = false,
  testID,
  ...input
}: {
  label: string;
  hint?: string | null;
  error?: string | null;
  code?: boolean;
  testID?: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  secureTextEntry?: boolean;
  autoComplete?: string;
  textContentType?: string;
  keyboardType?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
}) {
  const theme = useTheme();
  const t = theme.tokens;
  return (
    <View style={theme.style('field', { gap: 6 })}>
      <Text style={theme.style('label', [textStyle(t, 'text', 0.93), { fontWeight: '500' }])}>{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        autoCorrect={false}
        autoCapitalize={input.autoCapitalize ?? 'none'}
        placeholderTextColor={t.muted}
        {...input}
        style={theme.style(code ? 'codeInput' : 'input', [
          {
            minHeight: 46,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: error ? t.danger : t.fieldBorder,
            borderRadius: t.radius,
            backgroundColor: t.field,
            color: t.fieldText,
            fontSize: t.fontSize,
            fontFamily: t.fontFamily,
          },
          code ? { letterSpacing: 6, fontSize: t.fontSize * 1.3, textAlign: 'center' } : null,
        ])}
      />
      {error ? (
        <Text style={theme.style('fieldError', textStyle(t, 'danger', 0.85))}>{error}</Text>
      ) : hint ? (
        <Text style={theme.style('hint', textStyle(t, 'muted', 0.85))}>{hint}</Text>
      ) : null}
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'link' | 'danger';

const VARIANT_KEY = {
  primary: 'buttonPrimary',
  secondary: 'buttonSecondary',
  link: 'buttonLink',
  danger: 'buttonDanger',
} as const;

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
  zevId = false,
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  busy?: boolean;
  disabled?: boolean;
  zevId?: boolean;
  icon?: ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  const t = theme.tokens;
  const inactive = disabled || busy;
  const filled = variant === 'primary' || variant === 'danger';
  const fill = variant === 'danger' ? t.danger : t.primary;
  const ink = filled ? (variant === 'danger' ? '#ffffff' : t.onPrimary) : variant === 'link' ? t.muted : t.text;

  const base: NativeStyle =
    variant === 'link'
      ? { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 4 }
      : {
          minHeight: 46,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: t.radius,
          borderWidth: 1,
          borderColor: filled ? fill : t.border,
          backgroundColor: filled ? fill : 'transparent',
        };

  const keyed = theme.style(VARIANT_KEY[variant], theme.style('button', base));
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [keyed, zevId ? theme.style('zevIdButton') : null, { opacity: inactive ? 0.55 : pressed ? 0.85 : 1 }]}
    >
      {busy ? <ActivityIndicator color={ink} size="small" /> : icon ?? null}
      <Text
        style={theme.style('buttonText', [
          { color: ink, fontSize: t.fontSize, fontFamily: t.fontFamily, fontWeight: variant === 'link' ? '400' : '500' },
          variant === 'link' ? { textDecorationLine: 'underline' } : null,
        ])}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Divider({ label }: { label: string }) {
  const theme = useTheme();
  const t = theme.tokens;
  const line = { flex: 1, height: 1, backgroundColor: t.border };
  return (
    <View style={theme.style('divider', { flexDirection: 'row', alignItems: 'center', gap: 10 })}>
      <View style={line} />
      <Text style={textStyle(t, 'muted', 0.85)}>{label}</Text>
      <View style={line} />
    </View>
  );
}

export function Alert({ children }: { children: string }) {
  const theme = useTheme();
  const t = theme.tokens;
  return (
    <View
      accessibilityRole="alert"
      style={theme.style('alert', { padding: 12, borderRadius: t.radius, borderWidth: 1, borderColor: t.danger })}
    >
      <Text style={textStyle(t, 'danger', 0.93)}>{children}</Text>
    </View>
  );
}

export function Notice({ children }: { children: string }) {
  const theme = useTheme();
  const t = theme.tokens;
  return (
    <View style={theme.style('notice', { padding: 12, borderRadius: t.radius, borderWidth: 1, borderColor: t.border })}>
      <Text style={textStyle(t, 'muted', 0.93)}>{children}</Text>
    </View>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: NativeStyle }) {
  const theme = useTheme();
  return <Text style={[textStyle(theme.tokens, 'muted', 0.9), style]}>{children}</Text>;
}

export function Footer() {
  const { theme, branding, client, strings } = useNativeContext('A ZevAuth component');
  const t = theme.tokens;
  return (
    <View style={theme.style('footer', { alignItems: 'center', gap: 8 })}>
      {client.isTestMode ? (
        <Text style={theme.style('testModeBadge', textStyle(t, 'muted', 0.8))}>{strings.common.testMode}</Text>
      ) : null}
      {branding?.showPoweredBy !== false ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.zevauth.com/?utm_source=zevauth-expo')}>
          <Text style={theme.style('poweredBy', textStyle(t, 'muted', 0.75))}>
            {strings.common.securedBy} <Text style={{ fontWeight: '600' }}>ZevAuth</Text>
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

