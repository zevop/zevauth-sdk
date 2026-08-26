import { useCallback, useRef, useState } from 'react';
import { useZevAuthContext } from '../internal/context.js';
import { useDismiss } from '../internal/useDismiss.js';
import { Brandable } from './Brandable.js';

export interface UserButtonProps {
  /** Where to send somebody after signing out. */
  afterSignOutUrl?: string;
  className?: string;
}

/**
 * The signed-in person, and the way out.
 *
 * Renders nothing at all when nobody is signed in, rather than a
 * placeholder: this usually sits in a header beside a sign-in button,
 * and two controls competing for the same slot is worse than one
 * appearing when it applies.
 */
export function UserButton({ afterSignOutUrl, className }: UserButtonProps) {
  const { client, state } = useZevAuthContext('<UserButton>');
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(wrapRef, isOpen, close);

  if (!state.isLoaded || !state.user) return null;

  const user = state.user;
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.username ||
    user.email ||
    'Account';

  return (
    <Brandable branding={client.branding} className={className}>
      <div className="zv-menu-wrap" ref={wrapRef}>
        <button
          type="button"
          className="zv-trigger"
          onClick={() => setIsOpen((open) => !open)}
          /* Both, so a screen reader announces a menu that opens and
             says whether it is open, rather than an unlabelled button. */
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={`Account menu for ${displayName}`}
        >
          <Avatar imageUrl={user.imageUrl} name={displayName} />
        </button>

        {isOpen ? (
          <div className="zv-menu" role="menu">
            <div className="zv-menu-header">
              <Avatar imageUrl={user.imageUrl} name={displayName} />
              <div>
                <div className="zv-menu-name zv-truncate">{displayName}</div>
                {user.email && user.email !== displayName ? (
                  <div className="zv-menu-sub zv-truncate">{user.email}</div>
                ) : null}
              </div>
            </div>

            {state.organization ? (
              <>
                <div className="zv-menu-label">Organization</div>
                <button
                  type="button"
                  className="zv-menu-item"
                  role="menuitem"
                  /* Informational, not an action. Switching lives in
                     <OrganizationSwitcher>; a second place to do it
                     would be two things to keep in step. */
                  disabled
                >
                  <span className="zv-truncate">{state.organization.name}</span>
                </button>
              </>
            ) : null}

            <button
              type="button"
              className="zv-menu-item"
              role="menuitem"
              onClick={() => {
                close();
                void client.signOut().then(() => {
                  if (afterSignOutUrl && typeof window !== 'undefined') {
                    window.location.assign(afterSignOutUrl);
                  }
                });
              }}
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </Brandable>
  );
}

/** A picture, or the initials that stand in for one. */
function Avatar({
  imageUrl,
  name,
}: {
  imageUrl: string | null;
  name: string;
}) {
  return (
    <span className="zv-avatar" aria-hidden="true">
      {imageUrl ? <img src={imageUrl} alt="" /> : initials(name)}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
