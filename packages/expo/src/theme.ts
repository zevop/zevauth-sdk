import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { Branding } from '@zevauth/js';
import type { ThemeName, ThemedColor } from '@zevauth/react/headless';

/**
 * The same vocabulary as the web's `appearance`, in native units.
 *
 * Colours take one value or a `{ light, dark }` pair, exactly as on the
 * web, so a team can share colour tokens between their site and their
 * app. Sizes are numbers (points), because that is what React Native
 * styles take; there is no CSS here to put a `px` into.
 */
export interface NativeVariables {
  colorPrimary?: ThemedColor;
  colorTextOnPrimary?: ThemedColor;
  colorBackground?: ThemedColor;
  colorText?: ThemedColor;
  colorTextSecondary?: ThemedColor;
  colorBorder?: ThemedColor;
  colorInputBackground?: ThemedColor;
  colorInputText?: ThemedColor;
  colorInputBorder?: ThemedColor;
  colorDanger?: ThemedColor;
  fontFamily?: string;
  /** Field and button text, in points. Everything else scales from it. */
  fontSize?: number;
  /** Fields and buttons; the card uses 1.5×. */
  borderRadius?: number;
}

/**
 * The parts a developer can style. Named as on the web wherever the part
 * exists on both, so one design spec covers both apps.
 */
export type NativeElementKey =
  | 'root'
  | 'card'
  | 'identity'
  | 'logo'
  | 'appName'
  | 'title'
  | 'subtitle'
  | 'fields'
  | 'field'
  | 'label'
  | 'input'
  | 'codeInput'
  | 'hint'
  | 'fieldError'
  | 'button'
  | 'buttonText'
  | 'buttonPrimary'
  | 'buttonSecondary'
  | 'buttonLink'
  | 'buttonDanger'
  | 'zevIdButton'
  | 'divider'
  | 'alert'
  | 'notice'
  | 'footer'
  | 'poweredBy'
  | 'testModeBadge'
  | 'avatar'
  | 'menu'
  | 'menuItem'
  | 'sectionTitle'
  | 'sessionRow'
  | 'badge'
  | 'secretKey'
  | 'recoveryCodes';

export type NativeStyle = StyleProp<ViewStyle | TextStyle>;

export interface NativeAppearance {
  /** A ready-made look: `'default'`, `'soft'`, `'minimal'`, `'sharp'` or `'contrast'`. */
  theme?: ThemeName;
  /** Overrides the console's choice. `'system'` follows the phone. */
  colorScheme?: 'system' | 'light' | 'dark';
  variables?: NativeVariables;
  elements?: Partial<Record<NativeElementKey, NativeStyle>>;
  /** As on the web: the same names as the console's fields. */
  signInTitle?: string | null;
  signInSubtitle?: string | null;
  signUpTitle?: string | null;
  signUpSubtitle?: string | null;
  showIdentity?: boolean;
  cardStyle?: 'card' | 'flat';
}

/** Every resolved value a component paints with. */
export interface Tokens {
  isDark: boolean;
  primary: string;
  onPrimary: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  field: string;
  fieldText: string;
  fieldBorder: string;
  danger: string;
  fontFamily: string | undefined;
  fontSize: number;
  radius: number;
}

const LIGHT = { surface: '#ffffff', text: '#18181b', muted: '#71717a', border: '#e4e4e7', field: '#ffffff', danger: '#b91c1c' };
const DARK = { surface: '#18181b', text: '#fafafa', muted: '#a1a1aa', border: '#333338', field: '#0f0f11', danger: '#f87171' };
const RADIUS: Record<string, number> = { none: 0, small: 4, medium: 8, large: 14, pill: 999 };

/**
 * The five named looks, in native terms. Like the web themes, none sets
 * the brand colour, and every colour has a dark value. Functions of the
 * tokens, because "outline in the text colour" has to be the resolved
 * text colour here; there are no CSS variables to point at.
 */
const NATIVE_THEMES: Record<ThemeName, (t: Tokens) => Pick<NativeAppearance, 'variables' | 'elements'>> = {
  default: () => ({}),
  soft: (t) => ({
    variables: { borderRadius: 10, colorBorder: { light: '#e9e9ec', dark: '#2a2a30' } },
    elements: {
      card: {
        shadowColor: '#000000',
        shadowOpacity: t.isDark ? 0.4 : 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      },
    },
  }),
  minimal: () => ({
    variables: {
      borderRadius: 6,
      colorInputBorder: { light: 'transparent', dark: 'transparent' },
      colorInputBackground: { light: '#f1f1f3', dark: '#26262b' },
    },
    elements: {
      card: { borderColor: 'transparent' },
      identity: { alignItems: 'flex-start' },
      title: { textAlign: 'left', fontSize: 21 },
      subtitle: { textAlign: 'left' },
    },
  }),
  sharp: (t) => ({
    variables: { borderRadius: 0, colorInputBorder: t.text },
    elements: {
      card: { borderWidth: 2, borderColor: t.text },
      buttonSecondary: { borderColor: t.text },
      buttonText: { letterSpacing: 0.4 },
    },
  }),
  contrast: () => ({
    variables: {
      fontSize: 16,
      colorTextSecondary: { light: '#3f3f46', dark: '#d4d4d8' },
      colorBorder: { light: '#71717a', dark: '#a1a1aa' },
    },
    elements: { label: { fontWeight: '600' } },
  }),
};

function pick(color: ThemedColor | undefined, isDark: boolean): string | undefined {
  if (color === undefined) return undefined;
  return typeof color === 'string' ? color : isDark ? color.dark : color.light;
}

/** Near-black or white, whichever reads on the colour. Same rule as the web. */
export function readableOn(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return '#ffffff';
  const value = parseInt(match[1], 16);
  const channel = (raw: number) => {
    const v = raw / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel((value >> 16) & 255) + 0.7152 * channel((value >> 8) & 255) + 0.0722 * channel(value & 255);
  return luminance > 0.45 ? '#171717' : '#ffffff';
}

export interface ResolvedTheme {
  tokens: Tokens;
  /** Styles for one part: ours first, the theme's, then the developer's. */
  style(key: NativeElementKey, base?: NativeStyle): NativeStyle;
}

/**
 * Console branding, then the theme, then the developer's variables and
 * elements. The order matches the web: the narrower instruction wins.
 */
export function resolveTheme(
  branding: Branding | null,
  appearance: NativeAppearance | undefined,
  systemScheme: 'light' | 'dark' | null | undefined,
): ResolvedTheme {
  const scheme = appearance?.colorScheme ?? branding?.colorScheme ?? 'system';
  const isDark = scheme === 'dark' || (scheme === 'system' && systemScheme === 'dark');
  const palette = isDark ? DARK : LIGHT;
  const consoleAccent = branding ? (isDark ? branding.accentOnDark : branding.accentOnLight) : undefined;

  const base: Tokens = {
    isDark,
    primary: consoleAccent ?? (isDark ? '#fafafa' : '#18181b'),
    onPrimary: '',
    surface: palette.surface,
    text: palette.text,
    muted: palette.muted,
    border: palette.border,
    field: palette.field,
    fieldText: palette.text,
    fieldBorder: palette.border,
    danger: palette.danger,
    fontFamily: undefined,
    fontSize: 15,
    radius: RADIUS[branding?.borderRadius ?? 'medium'] ?? 8,
  };

  const theme = appearance?.theme ? NATIVE_THEMES[appearance.theme]?.(base) ?? {} : {};
  const tokens = applyVariables(applyVariables(base, theme.variables), appearance?.variables);
  if (!tokens.onPrimary) tokens.onPrimary = readableOn(tokens.primary);

  return {
    tokens,
    style(key, own) {
      return [own, theme.elements?.[key], appearance?.elements?.[key]];
    },
  };
}

function applyVariables(t: Tokens, v: NativeVariables | undefined): Tokens {
  if (!v) return t;
  const d = t.isDark;
  const out = { ...t };
  const set = <K extends keyof Tokens>(key: K, value: Tokens[K] | undefined) => {
    if (value !== undefined) out[key] = value;
  };
  set('primary', pick(v.colorPrimary, d));
  set('onPrimary', pick(v.colorTextOnPrimary, d));
  set('surface', pick(v.colorBackground, d));
  set('text', pick(v.colorText, d));
  set('muted', pick(v.colorTextSecondary, d));
  set('border', pick(v.colorBorder, d));
  set('field', pick(v.colorInputBackground, d));
  set('fieldText', pick(v.colorInputText, d) ?? (v.colorText ? out.text : undefined));
  set('fieldBorder', pick(v.colorInputBorder, d) ?? (v.colorBorder ? out.border : undefined));
  set('danger', pick(v.colorDanger, d));
  set('fontFamily', v.fontFamily);
  set('fontSize', v.fontSize);
  set('radius', v.borderRadius);
  return out;
}
