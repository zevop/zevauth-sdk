import { useCallback, useRef, useState } from 'react';
import { useComponentAppearance } from '../internal/context.js';
import { useElements, type Appearance } from '../internal/appearance.js';
import { format, type Localization } from '../internal/localization.js';
import { useDismiss } from '../internal/useDismiss.js';
import { Brandable } from './Brandable.js';
import { Dialog } from './Dialog.js';
import { UserProfile, type UserProfileProps } from './UserProfile.js';

export interface UserButtonProps {
  /** Where to send somebody after signing out. */
  afterSignOutUrl?: string;
  /**
   * Add "Manage account" to the menu.
   *
   * `'none'` (default) leaves the menu as it is. `'modal'` opens
   * `<UserProfile>` in a dialog over the page. `'navigation'` goes to
   * `userProfileUrl`, for an app with its own settings page.
   */
  userProfileMode?: 'none' | 'modal' | 'navigation';
  /** Where "Manage account" goes with `userProfileMode="navigation"`. */
  userProfileUrl?: string;
  /**
   * Passed to the `<UserProfile>` in the dialog. It opens in the sidebar
   * layout unless you say otherwise.
   */
  userProfileProps?: Omit<UserProfileProps, 'appearance' | 'localization' | 'className'>;
  /**
   * How this one component looks, merged over the provider's
   * `appearance`. See `Appearance` for the console fields, `variables`
   * and `elements`.
   */
  appearance?: Appearance;
  /** The words on this component, merged over the provider's `localization`. */
  localization?: Localization;
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
export function UserButton({
  afterSignOutUrl,
  userProfileMode = 'none',
  userProfileUrl,
  userProfileProps,
  appearance,
  localization,
  className,
}: UserButtonProps) {
  const {
    client,
    state,
    branding,
    appearance: appearanceLayers,
    el,
    strings,
  } = useComponentAppearance('<UserButton>', appearance, localization);
  const t = strings.userButton;
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
    <Brandable branding={branding} appearance={appearanceLayers} el={el} strings={strings} className={className}>
      <div className="zv-menu-wrap" ref={wrapRef}>
        <button
          type="button"
          ref={triggerRef}
          {...el('menuTrigger')}
          onClick={() => setIsOpen((open) => !open)}
          /* Both, so a screen reader announces a menu that opens and
             says whether it is open, rather than an unlabelled button. */
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={format(t.menuLabel, { name: displayName })}
        >
          <Avatar imageUrl={user.imageUrl} name={displayName} />
        </button>

        {isOpen ? (
          <div {...el('menu')} role="menu">
            <div {...el('menuHeader')}>
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
                <div {...el('menuLabel')}>{t.organization}</div>
                <button
                  type="button"
                  {...el('menuItem')}
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

            {userProfileMode !== 'none' ? (
              <button
                type="button"
                {...el('menuItem')}
                role="menuitem"
                onClick={() => {
                  close();
                  if (userProfileMode === 'modal') setIsProfileOpen(true);
                  else if (userProfileUrl && typeof window !== 'undefined') {
                    window.location.assign(userProfileUrl);
                  }
                }}
              >
                {t.manageAccount}
              </button>
            ) : null}

            <button
              type="button"
              {...el('menuItem')}
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
              {t.signOut}
            </button>
          </div>
        ) : null}
      </div>

      {isProfileOpen ? (
        <Dialog
          label={t.manageAccount}
          closeLabel={t.closeDialog}
          onClose={() => setIsProfileOpen(false)}
          returnFocusRef={triggerRef}
          branding={branding}
          appearance={appearanceLayers}
          el={el}
          strings={strings}
        >
          <UserProfile
            variant="sidebar"
            {...userProfileProps}
            appearance={appearance}
            localization={localization}
          />
        </Dialog>
      ) : null}
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
  const el = useElements();
  return (
    <span {...el('avatar')} aria-hidden="true">
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
