import { useCallback, useRef, useState } from 'react';
import { useComponentAppearance } from '../internal/context.js';
import type { Appearance } from '../internal/appearance.js';
import type { Localization } from '../internal/localization.js';
import { useOrganizationList } from '../hooks/useOrganization.js';
import { useDismiss } from '../internal/useDismiss.js';
import { Brandable } from './Brandable.js';
import { Spinner } from './parts.js';
import { Dialog } from './Dialog.js';
import { CreateOrganization } from './CreateOrganization.js';

export interface OrganizationSwitcherProps {
  /** Offer a way back to personal scope. Defaults to true. */
  allowPersonal?: boolean;
  /**
   * Add a "Create organization" item to the menu.
   *
   * `'none'` (default) leaves the menu as it is. `'inline'` opens the
   * create form in a dialog over the page; a string is a URL to go to
   * instead. With either, the switcher also shows for somebody who
   * belongs to no organization yet, since creating one is now
   * something it can do for them.
   */
  createOrganizationMode?: 'none' | 'inline' | (string & {});
  /** Where to go after creating one from the dialog. */
  afterCreateOrganizationUrl?: string;
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
 * Which organization this session is acting as.
 *
 * ── Why switching is awaited, and the menu stays open meanwhile ───
 * A switch rotates the session's tokens, because the organization is a
 * claim inside them. That is a round trip, and closing the menu on click
 * would leave somebody looking at a header that still says the old
 * organization with nothing to explain the pause. So the item shows a
 * spinner, and the menu closes when the switch has actually happened.
 */
export function OrganizationSwitcher({
  allowPersonal = true,
  createOrganizationMode = 'none',
  afterCreateOrganizationUrl,
  appearance,
  localization,
  className,
}: OrganizationSwitcherProps) {
  const {
    state,
    branding,
    appearance: appearanceLayers,
    el,
    strings,
  } = useComponentAppearance('<OrganizationSwitcher>', appearance, localization);
  const t = strings.organizationSwitcher;
  const { organizations, setActive, refetch } = useOrganizationList();
  const [isOpen, setIsOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const canCreate = createOrganizationMode !== 'none';
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(wrapRef, isOpen, close);

  if (!state.isLoaded || !state.user) return null;

  /*
   * Hidden entirely for somebody who belongs to nothing.
   *
   * A switcher with one item and no alternatives is a control that
   * cannot do anything, and most apps using organizations still have
   * users who are in none.
   */
  if (organizations.length === 0 && !canCreate) return null;

  const active = state.organization;
  const label = active?.name ?? t.personalAccount;

  async function choose(organizationId: string | null) {
    setSwitchingTo(organizationId ?? '__personal__');
    try {
      await setActive(organizationId);
      close();
    } finally {
      setSwitchingTo(null);
    }
  }

  return (
    <Brandable branding={branding} appearance={appearanceLayers} el={el} strings={strings} className={className}>
      <div className="zv-menu-wrap" ref={wrapRef}>
        <button
          type="button"
          ref={triggerRef}
          {...el('menuTrigger')}
          onClick={() => setIsOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <span className="zv-truncate">{label}</span>
        </button>

        {isOpen ? (
          <div {...el('menu')} role="menu">
            <div {...el('menuLabel')}>{t.switchTo}</div>

            {allowPersonal ? (
              <button
                type="button"
                {...el('menuItem')}
                role="menuitem"
                aria-current={active === null}
                disabled={switchingTo !== null}
                onClick={() => void choose(null)}
              >
                {switchingTo === '__personal__' ? <Spinner /> : null}
                <span className="zv-truncate">{t.personalAccount}</span>
              </button>
            ) : null}

            {organizations.map((organization) => (
              <button
                key={organization.id}
                type="button"
                {...el('menuItem')}
                role="menuitem"
                aria-current={active?.id === organization.id}
                disabled={switchingTo !== null}
                onClick={() => void choose(organization.id)}
              >
                {switchingTo === organization.id ? <Spinner /> : null}
                <span className="zv-truncate">{organization.name}</span>
              </button>
            ))}

            {canCreate ? (
              <button
                type="button"
                {...el('menuItem')}
                role="menuitem"
                disabled={switchingTo !== null}
                onClick={() => {
                  close();
                  if (createOrganizationMode === 'inline') setIsCreating(true);
                  else if (typeof window !== 'undefined') window.location.assign(createOrganizationMode);
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span className="zv-truncate">{t.createOrganization}</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {isCreating ? (
        <Dialog
          label={t.createOrganization}
          closeLabel={strings.userButton.closeDialog}
          onClose={() => setIsCreating(false)}
          returnFocusRef={triggerRef}
          branding={branding}
          appearance={appearanceLayers}
          el={el}
          strings={strings}
        >
          <CreateOrganization
            appearance={appearance}
            localization={localization}
            afterCreateOrganizationUrl={afterCreateOrganizationUrl}
            onCreated={() => {
              setIsCreating(false);
              refetch();
            }}
          />
        </Dialog>
      ) : null}
    </Brandable>
  );
}
