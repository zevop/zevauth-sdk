import { useCallback, useRef, useState } from 'react';
import { useZevAuthContext } from '../internal/context.js';
import { useOrganizationList } from '../hooks/useOrganization.js';
import { useDismiss } from '../internal/useDismiss.js';
import { Brandable } from './Brandable.js';
import { Spinner } from './parts.js';

export interface OrganizationSwitcherProps {
  /** Offer a way back to personal scope. Defaults to true. */
  allowPersonal?: boolean;
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
  className,
}: OrganizationSwitcherProps) {
  const { client, state } = useZevAuthContext('<OrganizationSwitcher>');
  const { organizations, setActive } = useOrganizationList();
  const [isOpen, setIsOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

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
  if (organizations.length === 0) return null;

  const active = state.organization;
  const label = active?.name ?? 'Personal account';

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
    <Brandable branding={client.branding} className={className}>
      <div className="zv-menu-wrap" ref={wrapRef}>
        <button
          type="button"
          className="zv-trigger"
          onClick={() => setIsOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <span className="zv-truncate">{label}</span>
        </button>

        {isOpen ? (
          <div className="zv-menu" role="menu">
            <div className="zv-menu-label">Switch to</div>

            {allowPersonal ? (
              <button
                type="button"
                className="zv-menu-item"
                role="menuitem"
                aria-current={active === null}
                disabled={switchingTo !== null}
                onClick={() => void choose(null)}
              >
                {switchingTo === '__personal__' ? <Spinner /> : null}
                <span className="zv-truncate">Personal account</span>
              </button>
            ) : null}

            {organizations.map((organization) => (
              <button
                key={organization.id}
                type="button"
                className="zv-menu-item"
                role="menuitem"
                aria-current={active?.id === organization.id}
                disabled={switchingTo !== null}
                onClick={() => void choose(organization.id)}
              >
                {switchingTo === organization.id ? <Spinner /> : null}
                <span className="zv-truncate">{organization.name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Brandable>
  );
}
