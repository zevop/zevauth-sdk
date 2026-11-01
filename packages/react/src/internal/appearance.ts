import { createContext, useContext, type CSSProperties } from 'react';
import type { Appearance as BrandingAppearance } from '@zevauth/js';
import { themes, type ThemeName } from './themes.js';

/**
 * A colour for both schemes, or one for each.
 *
 * A single value paints light and dark alike, which is right for an
 * accent and usually wrong for a surface: a white card inside a dark
 * page is the very mismatch `colorScheme: 'system'` exists to avoid. So
 * any colour can also be given as a pair.
 */
export type ThemedColor = string | { light: string; dark: string };

/**
 * The design tokens every component paints with.
 *
 * Each one is a CSS custom property on the component's root, so a value
 * here repaints every element that uses it, including hover, focus and
 * disabled states that an inline style could never reach. Reach for
 * these first; `elements` is for the one thing a token cannot say.
 */
export interface AppearanceVariables {
  /** Primary buttons, focus rings, the progress bar, the split panel. */
  colorPrimary?: ThemedColor;
  /** Text on `colorPrimary`. Worked out for legibility when left out. */
  colorTextOnPrimary?: ThemedColor;
  /** The card and menu surface. */
  colorBackground?: ThemedColor;
  /** Headings, labels and field text. */
  colorText?: ThemedColor;
  /** Subtitles, hints, the divider and secondary links. */
  colorTextSecondary?: ThemedColor;
  /** Field, card and divider lines. */
  colorBorder?: ThemedColor;
  colorInputBackground?: ThemedColor;
  colorInputText?: ThemedColor;
  /** Text field outlines. Focus and error states still repaint them. */
  colorInputBorder?: ThemedColor;
  /** Errors: the alert, an invalid field, a field message. */
  colorDanger?: ThemedColor;
  /** Any CSS `font-family`, e.g. `'inherit'` to take your page's font. */
  fontFamily?: string;
  /**
   * The size field and button text is set at. Every other size is
   * scaled from it, so headings and hints stay in proportion.
   */
  fontSize?: string;
  /** Any CSS length. Controls, cards (at 1.5×) and menus follow it. */
  borderRadius?: string;
  /** The card's `box-shadow`. None by default. */
  cardShadow?: string;
  /** The card's width. Still capped at the width of its container. */
  cardWidth?: string;
}

/**
 * Every part a developer can address.
 *
 * Named for what the part is, never for how it is built, so a key keeps
 * meaning the same thing when the markup under it changes. Each maps to
 * a stable `zv-` class (see `ELEMENT_CLASS`) for anybody styling from a
 * stylesheet instead.
 */
export type AppearanceElementKey =
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
  | 'hint'
  | 'fieldError'
  | 'button'
  | 'buttonPrimary'
  | 'buttonSecondary'
  | 'buttonLink'
  | 'zevIdButton'
  | 'moreToggle'
  | 'divider'
  | 'sectionDivider'
  | 'alert'
  | 'notice'
  | 'footer'
  | 'poweredBy'
  | 'testModeBadge'
  | 'spinner'
  | 'splitLayout'
  | 'formPane'
  | 'aside'
  | 'asideHeading'
  | 'asideText'
  | 'menuTrigger'
  | 'menu'
  | 'menuHeader'
  | 'menuItem'
  | 'menuLabel'
  | 'avatar'
  | 'memberList'
  | 'memberRow'
  | 'imageField'
  | 'imagePreview'
  | 'progress'
  | 'buttonDanger'
  | 'navigation'
  | 'navigationItem'
  | 'panel'
  | 'sectionTitle'
  | 'badge'
  | 'sessionList'
  | 'sessionRow'
  | 'list'
  | 'listItem'
  | 'modal'
  | 'modalBackdrop'
  | 'userAvatar';

/**
 * A class name (your stylesheet, Tailwind) or a style object.
 *
 * A style object is applied inline, so it beats every rule in our
 * stylesheet without `!important`, but cannot say `:hover` or a media
 * query. A class name can, and has to win on specificity; see
 * `cssLayerName` for doing that without `!important`.
 */
export type AppearanceElementValue = string | CSSProperties;

export type AppearanceElements = Partial<Record<AppearanceElementKey, AppearanceElementValue>>;

/**
 * How a component looks, set in code.
 *
 * Three layers, from broadest to narrowest:
 *
 *   the console fields   the same names as the console, so a value can
 *                        move from settings page to repository as is
 *   `variables`          design tokens, repainting every element at once
 *   `elements`           one part at a time
 *
 * Given on the provider it applies to every component; given on one
 * component it is merged over the provider's for that component only.
 */
export interface Appearance extends BrandingAppearance {
  /**
   * A ready-made look to start from: `'soft'`, `'minimal'`, `'sharp'`,
   * `'contrast'`, or `'default'`. Or an `Appearance` of your own,
   * shared as a theme. Everything else in this object is laid over it,
   * so you can take a theme and change one value.
   */
  theme?: ThemeName | Appearance;
  variables?: AppearanceVariables;
  elements?: AppearanceElements;
  /**
   * Put our stylesheet in a CSS cascade layer of this name.
   *
   * Unlayered CSS beats layered CSS whatever its specificity, so with
   * our rules in a layer that comes before yours, a plain utility class
   * in `elements` wins without `!important`. Declare the order once in
   * your own CSS, e.g. for Tailwind v4:
   *
   *   @layer theme, base, zevauth, components, utilities;
   *
   * Read once, when the stylesheet is first added to the page, so set
   * it on `<ZevAuthProvider>` rather than on one component.
   */
  cssLayerName?: string;
}

/** The base class each key adds to, where it has one of its own. */
export const ELEMENT_CLASS: Record<AppearanceElementKey, string | null> = {
  root: 'zv-root',
  card: 'zv-card',
  identity: 'zv-identity',
  logo: 'zv-logo',
  appName: 'zv-appname',
  title: 'zv-title',
  subtitle: 'zv-subtitle',
  fields: 'zv-fields',
  field: 'zv-field',
  label: 'zv-label',
  input: 'zv-input',
  hint: 'zv-hint',
  fieldError: 'zv-fielderror',
  button: 'zv-button',
  // Variants are the base button plus a data attribute, not classes of
  // their own: these keys only ever add to `button`.
  buttonPrimary: null,
  buttonSecondary: null,
  buttonLink: null,
  zevIdButton: null,
  moreToggle: 'zv-more',
  divider: 'zv-divider',
  sectionDivider: 'zv-section-divider',
  alert: 'zv-alert',
  notice: 'zv-notice',
  footer: 'zv-footer',
  poweredBy: 'zv-poweredby',
  testModeBadge: 'zv-testmode',
  spinner: 'zv-spinner',
  splitLayout: 'zv-split',
  formPane: 'zv-formpane',
  aside: 'zv-aside',
  asideHeading: 'zv-aside-heading',
  asideText: 'zv-aside-text',
  menuTrigger: 'zv-trigger',
  menu: 'zv-menu',
  menuHeader: 'zv-menu-header',
  menuItem: 'zv-menu-item',
  menuLabel: 'zv-menu-label',
  avatar: 'zv-avatar',
  memberList: 'zv-member-list',
  memberRow: 'zv-member',
  imageField: 'zv-image-field',
  imagePreview: 'zv-image-preview',
  progress: 'zv-progress',
  buttonDanger: null,
  navigation: 'zv-nav',
  navigationItem: 'zv-nav-item',
  panel: 'zv-panel',
  sectionTitle: 'zv-section-title',
  badge: 'zv-badge',
  sessionList: 'zv-session-list',
  sessionRow: 'zv-session',
  list: 'zv-list',
  listItem: 'zv-list-item',
  modal: 'zv-modal',
  modalBackdrop: 'zv-modal-backdrop',
  // Adds to `avatar`, so it can be told apart from the menu's avatar.
  userAvatar: null,
};

interface ResolvedElement {
  className?: string;
  style?: CSSProperties;
}

type ResolvedElements = Partial<Record<AppearanceElementKey, ResolvedElement>>;

function resolve(value: AppearanceElementValue | undefined): ResolvedElement | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? { className: value } : { style: value };
}

/**
 * The provider's appearance with a component's merged over it.
 *
 * Deep for `variables` and `elements`, where a component that changes
 * one token or one part should not wipe out the provider's others.
 * Elements merge further still: classes from both apply, and style
 * objects merge property by property with the component winning. The
 * result is internal (it can hold a class AND a style for one key), so
 * it is kept apart from the public shape.
 */
export interface MergedAppearance {
  branding: BrandingAppearance;
  variables: AppearanceVariables;
  elements: ResolvedElements;
  cssLayerName?: string;
}

export function mergeAppearanceLayers(
  ...layers: Array<Appearance | undefined>
): MergedAppearance {
  const merged: MergedAppearance = { branding: {}, variables: {}, elements: {} };

  /*
   * Each layer's theme goes directly beneath that layer, so a
   * component that picks a theme gets it under its own overrides and
   * over everything the provider set (theme and values alike), which is
   * what "this one screen looks different" means. Provider values the
   * theme does not mention are kept. One level only: a theme that names a theme is
   * not followed, which keeps a typo from looping.
   */
  const expanded: Array<Appearance | undefined> = [];
  for (const layer of layers) {
    if (!layer) continue;
    const theme = typeof layer.theme === 'string' ? themes[layer.theme] : layer.theme;
    if (theme) expanded.push({ ...theme, theme: undefined });
    expanded.push(layer);
  }

  for (const layer of expanded) {
    if (!layer) continue;
    const { theme: _theme, variables, elements, cssLayerName, ...branding } = layer;
    Object.assign(merged.branding, branding);
    if (variables) Object.assign(merged.variables, variables);
    if (cssLayerName) merged.cssLayerName ??= cssLayerName;

    if (elements) {
      for (const key of Object.keys(elements) as AppearanceElementKey[]) {
        const next = resolve(elements[key]);
        if (!next) continue;
        const prev = merged.elements[key] ?? {};
        merged.elements[key] = {
          className: [prev.className, next.className].filter(Boolean).join(' ') || undefined,
          style: prev.style || next.style ? { ...prev.style, ...next.style } : undefined,
        };
      }
    }
  }

  return merged;
}

export interface ElementProps {
  className: string;
  style?: CSSProperties;
}

/**
 * Builds the `className` and `style` for one part.
 *
 * Every themed element in the components goes through this, which is
 * what makes `elements` reach all of them rather than the ones somebody
 * remembered. Later keys are narrower (`button`, then `buttonPrimary`),
 * so their styles win. `own` is the component's own inline style, and
 * loses to the developer's: an override that our layout quietly beat
 * would be no override at all.
 */
export type ElementResolver = (
  keys: AppearanceElementKey | AppearanceElementKey[],
  own?: CSSProperties,
) => ElementProps;

export function createElementResolver(elements: ResolvedElements): ElementResolver {
  return (keys, own) => {
    const list = Array.isArray(keys) ? keys : [keys];
    const classes: string[] = [];
    let style: CSSProperties | undefined = own ? { ...own } : undefined;

    for (const key of list) {
      const base = ELEMENT_CLASS[key];
      if (base) classes.push(base);
    }
    for (const key of list) {
      const custom = elements[key];
      if (!custom) continue;
      if (custom.className) classes.push(custom.className);
      if (custom.style) style = { ...style, ...custom.style };
    }

    return style ? { className: classes.join(' '), style } : { className: classes.join(' ') };
  };
}

const plainResolver = createElementResolver({});

/**
 * The resolver for parts rendered inside a component's root.
 *
 * Shared parts (the heading, the alert, the identity block) are rendered
 * by several components and cannot be handed a resolver by each, so
 * `Brandable` puts the component's one in context.
 */
export const ElementsContext = createContext<ElementResolver>(plainResolver);

export function useElements(): ElementResolver {
  return useContext(ElementsContext);
}

function pick(color: ThemedColor | undefined, isDark: boolean): string | undefined {
  if (color === undefined) return undefined;
  return typeof color === 'string' ? color : isDark ? color.dark : color.light;
}

/**
 * Variables as the custom properties the stylesheet reads.
 *
 * Applied inline on the root, which outranks the stylesheet's own dark
 * palette on the same element: a token a developer set is never quietly
 * replaced when the viewer's device turns dark. That is also why a
 * single colour applies to both schemes, and the pair form exists.
 */
export function variablesToCss(
  variables: AppearanceVariables,
  isDark: boolean,
): Record<string, string> {
  const css: Record<string, string> = {};
  const set = (name: string, value: string | undefined) => {
    if (value) css[name] = value;
  };

  set('--zv-accent', pick(variables.colorPrimary, isDark));
  set('--zv-on-accent', pick(variables.colorTextOnPrimary, isDark));
  set('--zv-surface', pick(variables.colorBackground, isDark));
  set('--zv-text', pick(variables.colorText, isDark));
  set('--zv-muted', pick(variables.colorTextSecondary, isDark));
  set('--zv-border', pick(variables.colorBorder, isDark));
  set('--zv-field', pick(variables.colorInputBackground, isDark));
  set('--zv-field-text', pick(variables.colorInputText, isDark));
  set('--zv-field-border', pick(variables.colorInputBorder, isDark));
  set('--zv-error', pick(variables.colorDanger, isDark));
  set('--zv-font', variables.fontFamily);
  set('--zv-font-size', variables.fontSize);
  set('--zv-radius', variables.borderRadius);
  set('--zv-card-shadow', variables.cardShadow);
  set('--zv-card-width', variables.cardWidth);

  return css;
}
