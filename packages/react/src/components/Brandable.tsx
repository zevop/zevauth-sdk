import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Branding } from '@zevauth/js';
import { ensureStyles } from '../internal/styles.js';

const RADIUS: Record<string, string> = {
  none: '0px',
  small: '4px',
  medium: '8px',
  large: '14px',
  pill: '999px',
};

const FONT: Record<string, string> = {
  system:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'SF Mono', SFMono-Regular, Menlo, Consolas, monospace",
};

/**
 * Whether to paint the dark palette.
 *
 * The developer's `colorScheme` wins when they chose one. `system` — the
 * default — follows the viewer's own preference, because a sign-in box
 * that is blazing white inside somebody's dark application looks like it
 * came from a different site, which is precisely the instinct we do not
 * want to dull.
 */
function useIsDark(scheme: Branding['colorScheme'] | undefined): boolean {
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);

  useEffect(() => {
    if (scheme !== 'system') return;
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemPrefersDark(query.matches);

    // Followed live: somebody switching their OS theme mid-session
    // should not have to reload to stop being dazzled.
    const onChange = (event: MediaQueryListEvent) =>
      setSystemPrefersDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [scheme]);

  if (scheme === 'dark') return true;
  if (scheme === 'light') return false;
  return systemPrefersDark;
}

/**
 * The wrapper that turns branding into CSS variables.
 *
 * Every component renders inside one. It is what lets a single static
 * stylesheet paint any tenant's colour without generating CSS per
 * environment.
 */
export function Brandable({
  branding,
  className,
  children,
}: {
  branding: Branding | null;
  className?: string;
  children: ReactNode;
}) {
  ensureStyles();

  const isDark = useIsDark(branding?.colorScheme);

  /*
   * The accent is picked for the surface being painted, and never
   * re-derived here. The server already ran the contrast rule; a second
   * implementation in the client is a second answer waiting to disagree
   * with the console's preview.
   */
  const accent = branding
    ? isDark
      ? branding.accentOnDark
      : branding.accentOnLight
    : undefined;

  const style: CSSProperties & Record<string, string | undefined> = {
    '--zv-radius': RADIUS[branding?.borderRadius ?? 'medium'],
    '--zv-font': FONT[branding?.fontFamily ?? 'system'],
    ...(accent ? { '--zv-accent': accent } : {}),
    ...(accent ? { '--zv-on-accent': readableOn(accent) } : {}),
  };

  return (
    <div
      className={className ? `zv-root ${className}` : 'zv-root'}
      data-theme={isDark ? 'dark' : 'light'}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * Near-white or near-black, whichever is legible on the accent.
 *
 * WCAG relative luminance, the same rule the server uses to pick the
 * accent itself. A developer with a pale yellow brand would otherwise
 * get white text on pale yellow, on the only button in the form.
 */
export function readableOn(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return '#ffffff';

  const value = parseInt(match[1], 16);
  const channel = (raw: number) => {
    const v = raw / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  const luminance =
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255);

  // 0.45 rather than 0.5: the eye forgives light-on-dark more readily
  // than dark-on-light, so the switch happens slightly later.
  return luminance > 0.45 ? '#171717' : '#ffffff';
}
