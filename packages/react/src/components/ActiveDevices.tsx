import { useCallback, useEffect, useState } from 'react';
import { ZevAuthError, type UserSession, type ZevAuth } from '@zevauth/js';
import { useElements } from '../internal/appearance.js';
import { errorMessage, format, useStrings } from '../internal/localization.js';
import { describeUserAgent, relativeTime } from '../internal/people.js';
import { Alert, Spinner } from './parts.js';

/**
 * Where the signed-in person is signed in, with a way out of each.
 *
 * ── Why the current device cannot be signed out from here ─────────
 * Ending this session is signing out, which also has to clear this
 * client's tokens and tell the app. The server refuses it from this
 * endpoint for the same reason, so the row says "This device" instead
 * of offering a button that would fail.
 */
export function ActiveDevices({ client }: { client: ZevAuth }) {
  const el = useElements();
  const strings = useStrings();
  const t = strings.userProfile;

  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    client.me
      .sessions()
      .then(setSessions)
      .catch(() => {
        setSessions([]);
        setError(t.sessionsLoadFailed);
      });
  }, [client, t.sessionsLoadFailed]);

  useEffect(load, [load]);

  const revoke = (id: string | 'others') => {
    setBusy(id);
    setError(null);
    const action = id === 'others' ? client.me.revokeOtherSessions() : client.me.revokeSession(id);
    void action
      .then(load)
      .catch((err) =>
        setError(
          err instanceof ZevAuthError
            ? errorMessage(strings, err, t.sessionRevokeFailed)
            : t.sessionRevokeFailed,
        ),
      )
      .finally(() => setBusy(null));
  };

  const others = (sessions ?? []).filter((session) => !session.isCurrent);

  return (
    <div className="zv-section">
      <span {...el('sectionTitle')}>{t.sessionsTitle}</span>
      <span {...el('hint')}>{t.sessionsHint}</span>
      {error ? <Alert>{error}</Alert> : null}

      {sessions === null ? (
        <Spinner />
      ) : (
        <div {...el('sessionList')}>
          {sessions.map((session) => {
            const device = describeUserAgent(session.userAgent);
            return (
              <div key={session.id} {...el('sessionRow')}>
                <div style={{ minWidth: 0 }}>
                  <div className="zv-session-name zv-member-name">
                    <span className="zv-truncate">
                      {device ? format(t.deviceOn, device) : t.unknownDevice}
                    </span>
                    {session.isCurrent ? <span {...el('badge')}>{t.thisDevice}</span> : null}
                  </div>
                  <div className="zv-menu-sub">
                    {[
                      /*
                       * As much as the developer chose to show, decided
                       * by the API: nothing, a network marked as
                       * approximate, or the address.
                       */
                      session.ipAddress && session.ipDisplay === 'coarse'
                        ? format(t.approximateIp, { ip: session.ipAddress })
                        : session.ipAddress,
                      format(t.lastActive, { time: relativeTime(session.lastActiveAt) }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                {session.isCurrent ? null : (
                  <button
                    type="button"
                    {...el(['button', 'buttonSecondary'])}
                    data-variant="secondary"
                    disabled={busy !== null}
                    onClick={() => revoke(session.id)}
                  >
                    {busy === session.id ? <Spinner /> : null}
                    {t.signOutDevice}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sessions !== null && others.length === 0 ? <span {...el('hint')}>{t.sessionsEmpty}</span> : null}
      {others.length > 1 ? (
        <button
          type="button"
          {...el(['button', 'buttonDanger'])}
          data-variant="danger"
          disabled={busy !== null}
          onClick={() => revoke('others')}
        >
          {busy === 'others' ? <Spinner /> : null}
          {t.signOutOthers}
        </button>
      ) : null}
    </div>
  );
}
