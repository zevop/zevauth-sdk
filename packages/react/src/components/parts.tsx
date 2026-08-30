import type { ReactNode } from 'react';
import type { Branding } from '@zevauth/js';
import { useZevTheme } from './Brandable.js';

/** The ZEV mark. The same paths every Zev product uses. */
export function ZevMark({ size = 11 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 495.23 347"
      fill="currentColor"
      aria-hidden="true"
      style={{ height: size, width: 'auto', display: 'block' }}
    >
      <path d="m311.65,285.54c0-11.55,2.02-22.66,5.73-33.09,2.39-6.72,5.5-13.16,9.23-19.24-12.05,2.08-24.42,4.48-37.06,7.18-33.32,7.13-68.5,16.4-104.56,27.8-40.19,12.7-77.99,26.94-112.23,41.95,27.08-6.67,59.31-10.53,93.91-10.5,50.91.04,96.7,8.48,128.44,21.9,17.08,7.22,30.1,15.88,37.65,25.46-7.77-10.18-13.66-21.6-17.22-33.9-2.55-8.8-3.91-18.03-3.9-27.56Z" />
      <path d="m495.23,194.44v14.04c-.8-.22-1.6-.42-2.42-.62-16.09-3.96-36.23-5.91-59.55-5.88-8.69.01-17.81.31-27.34.87-18.38,1.09-38.24,3.2-59.25,6.32-24.48,3.64-50.52,8.64-77.62,15.02-27.13,6.37-55.31,14.1-84.04,23.18-69.87,22.07-132.52,48.8-181.8,76.16-1.08.6-2.15,1.2-3.21,1.79.83-.63,1.68-1.27,2.53-1.9,49.87-37.17,134.63-82.12,234.39-121.86,6.52-2.61,13.02-5.14,19.47-7.61,42.57-16.33,83.49-30,120.89-40.64l-1.54-1.16-29.66-22.39-8.8-6.64L174.16,0l275.12,127.47,12.54,5.8c-7.34,1.32-14.98,2.82-22.89,4.53,33.82,11.79,56.32,32.75,56.3,56.64Z" />
    </svg>
  );
}

/**
 * Whose form this is.
 *
 * The name renders unless the developer turned it off, which they only
 * do when their logo is already a wordmark. With no logo it renders
 * regardless: it is then the whole identity.
 */
export function Identity({ branding }: { branding: Branding | null }) {
  if (!branding) return null;

  /*
   * Turned off from the console by a developer whose own page already
   * shows their logo above where they mount this. Two logos, one under
   * the other, is the most common thing people report about embedding
   * these components, and it is not something a prop should decide:
   * the person changing the branding is in the console, not the code.
   *
   * Hosted pages ignore this and always render — see the note in
   * hosted.controller.ts.
   *
   * Tested against `false` rather than for truthiness on purpose. An
   * API that predates this field sends nothing, and treating absent as
   * "hide" would delete the logo of every app that upgraded this
   * package before the backend shipped it.
   */
  if (branding.showIdentity === false) return null;

  const showName = !branding.logoUrl || branding.showAppName;

  return (
    <div className="zv-identity">
      {branding.logoUrl ? (
        <img
          className="zv-logo"
          src={branding.logoUrl}
          /* Decorative while the name is printed below it, or a screen
             reader announces the name twice. It carries the name only
             when nothing else does. */
          alt={showName ? '' : branding.appName}
        />
      ) : null}
      {showName ? <span className="zv-appname">{branding.appName}</span> : null}
    </div>
  );
}

export function TestModeBadge() {
  return (
    <div className="zv-testmode">
      <span className="zv-dot" />
      Test mode
    </div>
  );
}

/**
 * Our attribution, and a way back to us.
 *
 * Whether it appears at all is the server's decision — `showPoweredBy`
 * is plan-gated and resolved before it reaches the client, so nothing
 * here can turn it off. The parameters are how the landing page knows
 * where somebody came from; a `Referer` cannot be relied on and carries
 * the developer's URL, which is theirs and not ours to forward.
 */
export function PoweredBy({ environmentId }: { environmentId?: string | null }) {
  const url = new URL('https://www.zevauth.com');
  url.searchParams.set('utm_source', 'zevauth-sdk');
  url.searchParams.set('utm_medium', 'attribution');
  url.searchParams.set('utm_campaign', 'secured-by');
  url.searchParams.set('utm_content', 'components');
  if (environmentId) url.searchParams.set('ref', environmentId);

  return (
    <a
      className="zv-poweredby"
      href={url.toString()}
      target="_blank"
      rel="noopener noreferrer"
    >
      <ZevMark />
      <span>
        Secured by <strong style={{ fontWeight: 600 }}>ZevAuth</strong>
      </span>
    </a>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  /*
   * `role="alert"` so a failure is announced. A sign-in error that only
   * appears visually is invisible to somebody using a screen reader, who
   * is left wondering why the button did nothing.
   */
  return (
    <div className="zv-alert" role="alert">
      {children}
    </div>
  );
}

export function Divider({ label }: { label: string }) {
  return <div className="zv-divider">{label}</div>;
}

export function Spinner() {
  return <span className="zv-spinner" aria-hidden="true" />;
}

/**
 * The heading and subheading a surface prints.
 *
 * Both come from the console. The component supplies a fallback ONLY
 * for the title, and only when the field is absent entirely, which
 * means an API older than this feature:
 *
 *   undefined  the API never sent it   -> our built-in wording
 *   null       the developer hid it    -> print nothing
 *   a string   the developer wrote it  -> print that
 *
 * Collapsing those two into one falsy check is the whole bug this
 * shape exists to avoid.
 */
export function Heading({
  title,
  subtitle,
  fallbackTitle,
}: {
  title: string | null | undefined;
  subtitle: string | null | undefined;
  fallbackTitle: string;
}) {
  const heading = title === undefined ? fallbackTitle : title;
  return (
    <>
      {heading ? <h1 className="zv-title">{heading}</h1> : null}
      {subtitle ? <p className="zv-subtitle">{subtitle}</p> : null}
    </>
  );
}

/** Where the form sits. `split-left` puts the FORM on the left. */
export type SignInLayout = 'centered' | 'split-left' | 'split-right';

/**
 * The page around the card.
 *
 * ── Why this is not the developer's job ──────────────────────────
 * A split sign-in screen is what most products in this category ship,
 * and building one around our card means reimplementing the card to
 * match: the same surface colour, the same radius, the same dark-mode
 * rule, kept in step by hand. Putting the layout inside the component
 * means the two halves cannot drift.
 *
 * ── What goes in the other half ──────────────────────────────────
 * Either a picture with a heading and a line of copy, set in the
 * console by somebody who is not going to open an editor, or arbitrary
 * JSX passed as `aside`. The prop wins: code is the more specific
 * instruction, and a developer who wrote a panel did not write it to be
 * overridden from a settings page.
 *
 * The aside is hidden below 900px rather than stacked. Stacking pushes
 * the form below the fold on a phone, which is the one place the form
 * has to be the first thing.
 */
export function Shell({
  layout,
  align = 'center',
  aside,
  children,
}: {
  layout: SignInLayout;
  align?: 'center' | 'top';
  aside: ReactNode;
  children: ReactNode;
}) {
  if (layout === 'centered') return <>{children}</>;

  return (
    <div className="zv-split" data-form={layout === 'split-left' ? 'left' : 'right'}>
      <div className="zv-aside">{aside}</div>
      <div className="zv-formpane" data-align={align}>
        {children}
      </div>
    </div>
  );
}

/**
 * The console-configured aside: a picture, a heading, a line of text.
 *
 * Returns null when nothing is set, so an empty panel still paints the
 * accent rather than rendering an empty box with a stray gradient.
 */
export function BrandedAside({ branding }: { branding: Branding | null }) {
  /*
   * Hooks before the early return: React requires the same number of
   * them on every render, and `branding` is null on the first one.
   */
  const isDark = useZevTheme();

  if (!branding) return null;
  const { asideStyle, asideHeading, asideText } = branding;

  /*
   * The dark variants, where a developer set them.
   *
   * A panel is half the screen. A colour picked to sit behind white
   * text on a light page is usually wrong on a dark one, and a
   * photograph shot for one is often unreadable on the other. The API
   * already falls back to the light value when no dark one is set, so
   * anybody who does not care never meets this.
   */
  const asideColor = isDark
    ? branding.asideColorDark ?? branding.asideColor
    : branding.asideColor;
  const asideImageUrl = isDark
    ? branding.asideImageUrlDark ?? branding.asideImageUrl
    : branding.asideImageUrl;

  const usesImage = asideStyle === 'image' && Boolean(asideImageUrl);

  /*
   * The colour is applied here rather than in the stylesheet because it
   * is per-tenant. `solid` is the flat colour; `gradient` sweeps it into
   * a darker corner, which is what makes a quote readable on it without
   * needing a scrim.
   *
   * `color-mix` rather than shipping a colour-maths helper: the browser
   * already knows how to darken a colour, in whatever space the value
   * was written in, including ones a hex parser would not accept.
   */
  const background = usesImage
    ? undefined
    : asideStyle === 'solid'
      ? asideColor ?? undefined
      : asideColor
        ? `linear-gradient(140deg, ${asideColor}, color-mix(in oklab, ${asideColor} 62%, black))`
        : undefined;

  return (
    <div className="zv-aside-fill" style={background ? { background } : undefined}>
      {usesImage && asideImageUrl ? (
        <img className="zv-aside-image" src={asideImageUrl} alt="" />
      ) : null}
      {asideHeading || asideText ? (
        <div className="zv-aside-body" data-scrim={usesImage ? 'true' : 'false'}>
          {asideHeading ? <p className="zv-aside-heading">{asideHeading}</p> : null}
          {asideText ? <p className="zv-aside-text">{asideText}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
