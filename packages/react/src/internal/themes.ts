import type { Appearance } from './appearance.js';

/**
 * Ready-made looks, chosen with `appearance.theme`.
 *
 * ── What a theme is ───────────────────────────────────────────────
 * Nothing new: a theme is an `Appearance`, the same variables and
 * elements a developer could write, laid under theirs. That is what
 * lets them start from one and change a single value, and why a theme
 * can never do something their own code could not.
 *
 * ── What a theme leaves alone ─────────────────────────────────────
 * The brand. None of these sets `colorPrimary`, so the console accent
 * still paints the buttons: a theme is a shape and a texture, and the
 * product it sits in decides the colour. Every colour a theme does set
 * comes in a light and dark pair, or refers to a token that already
 * has both, so no theme breaks the other scheme.
 */
export const themes = {
  /** What the components look like with no theme: a quiet bordered card. */
  default: {},

  /**
   * A raised card with a soft shadow, a little more rounding, and the
   * attribution in a tinted band along the bottom edge.
   */
  soft: {
    variables: {
      borderRadius: '10px',
      colorBorder: { light: '#e9e9ec', dark: '#2a2a30' },
      cardShadow: '0 1px 2px rgba(0, 0, 0, .04), 0 8px 24px -6px rgba(0, 0, 0, .10)',
    },
    elements: {
      /*
       * Pulled out to the card's edge by its own padding variables, so
       * the band meets the border exactly and still behaves on a flat
       * card, where the padding is zero.
       */
      poweredBy: {
        margin: '6px calc(var(--zv-card-px) * -1) calc(var(--zv-card-py) * -1)',
        padding: '14px',
        background: 'color-mix(in srgb, var(--zv-border) 30%, var(--zv-surface))',
        borderTop: '1px solid var(--zv-border)',
        borderBottomLeftRadius: 'calc(var(--zv-radius) * 1.5 - 1px)',
        borderBottomRightRadius: 'calc(var(--zv-radius) * 1.5 - 1px)',
      },
    },
  },

  /**
   * Left-aligned and borderless: filled fields, no card outline, the
   * heading set like a page title. For products whose own UI is
   * typographic rather than boxed.
   */
  minimal: {
    variables: {
      borderRadius: '6px',
      colorInputBorder: 'transparent',
      colorInputBackground: {
        light: 'color-mix(in srgb, #e4e4e7 55%, #ffffff)',
        dark: 'color-mix(in srgb, #333338 60%, #18181b)',
      },
    },
    elements: {
      card: { borderColor: 'transparent', boxShadow: 'none' },
      identity: { alignItems: 'flex-start' },
      title: { textAlign: 'left', fontSize: 'calc(var(--zv-font-size) * 1.4)' },
      subtitle: { textAlign: 'left' },
      footer: { justifyContent: 'flex-start' },
    },
  },

  /** Square corners and firm outlines in the text colour. */
  sharp: {
    variables: { borderRadius: '0px', colorInputBorder: 'var(--zv-text)' },
    elements: {
      card: { borderWidth: 2, borderColor: 'var(--zv-text)' },
      buttonPrimary: { fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' },
      buttonSecondary: { borderColor: 'var(--zv-text)' },
    },
  },

  /**
   * Stronger text, borders and labels, and slightly larger type, for
   * products that need to read well for everyone, in sunlight or at a
   * distance. Built to clear WCAG AA on secondary text, not just body
   * text.
   */
  contrast: {
    variables: {
      fontSize: '14.5px',
      colorTextSecondary: { light: '#3f3f46', dark: '#d4d4d8' },
      colorBorder: { light: '#71717a', dark: '#a1a1aa' },
    },
    elements: {
      label: { fontWeight: 600 },
      buttonLink: { color: 'var(--zv-text)', textUnderlineOffset: '3px' },
    },
  },
} satisfies Record<string, Appearance>;

export type ThemeName = keyof typeof themes;
