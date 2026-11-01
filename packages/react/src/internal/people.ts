import type { ZevAuthUser } from '@zevauth/js';

/**
 * What to call somebody on screen.
 *
 * Their name if they gave one, then a username, then the address. Never
 * the id: a string of characters is not something a person recognises
 * as themselves.
 */
export function displayNameOf(user: ZevAuthUser, fallback = 'Account'): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.username ||
    user.email ||
    fallback
  );
}

/** Up to two letters, for when there is no picture. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * "Chrome on macOS", from a user agent, or null when it cannot tell.
 *
 * Deliberately small: a device list only needs to be recognisable, and
 * a full parser is a lot of bytes on an auth screen to tell Chromium
 * forks apart. Order matters, since Edge and Opera also say Chrome, and
 * Chrome also says Safari.
 */
export function describeUserAgent(
  userAgent: string | null,
): { browser: string; os: string } | null {
  if (!userAgent) return null;
  const ua = userAgent;

  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : null;

  const os =
    /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux'
    : null;

  if (!browser || !os) return null;
  return { browser, os };
}

/** "5 minutes ago", in the reader's language when the runtime has it. */
export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'minute');
}
