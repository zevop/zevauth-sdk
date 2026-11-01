import { useState } from 'react';
import type { OrganizationMembership } from '@zevauth/js';
import { useComponentAppearance } from '../internal/context.js';
import type { Appearance } from '../internal/appearance.js';
import { format, type Localization } from '../internal/localization.js';
import { displayNameOf, initials } from '../internal/people.js';
import { useOrganizationList } from '../hooks/useOrganization.js';
import { Brandable } from './Brandable.js';
import { CreateOrganization } from './CreateOrganization.js';
import { Heading, Identity, PoweredBy, Spinner } from './parts.js';

export interface OrganizationListProps {
  /** Offer the personal account as one of the choices. Defaults to true. */
  allowPersonal?: boolean;
  /**
   * Offer to create an organization from the list.
   *
   * Off unless you set it. `'inline'` swaps the list for a create form
   * in place; a string is a URL to send them to instead.
   */
  createOrganization?: 'inline' | (string & {});
  /**
   * Where to go once a choice is made. Omit it to stay and use
   * `onSelect`, or to let your router react to the session changing.
   */
  afterSelectOrganizationUrl?: string;
  /** Called after the session has switched. `null` is the personal account. */
  onSelect?: (organization: OrganizationMembership | null) => void;
  /** How this one component looks, merged over the provider's `appearance`. */
  appearance?: Appearance;
  /** The words on this component, merged over the provider's `localization`. */
  localization?: Localization;
  className?: string;
}

/**
 * "Choose an account": a full screen for picking which organization, or
 * the personal account, to continue as.
 *
 * For the moment after sign-in in a product where nearly everything
 * happens inside an organization, so the choice is the screen rather
 * than a menu somebody has to find. `<OrganizationSwitcher>` is the
 * same choice as a compact control for a header.
 */
export function OrganizationList({
  allowPersonal = true,
  createOrganization,
  afterSelectOrganizationUrl,
  onSelect,
  appearance,
  localization,
  className,
}: OrganizationListProps) {
  const {
    client,
    state,
    branding,
    appearance: appearanceLayers,
    el,
    strings,
  } = useComponentAppearance('<OrganizationList>', appearance, localization);
  const t = strings.organizationList;
  const { organizations, setActive } = useOrganizationList();
  const [choosing, setChoosing] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  if (!state.isLoaded || !state.user) return null;

  const after = (organization: OrganizationMembership | null) => {
    onSelect?.(organization);
    if (afterSelectOrganizationUrl && typeof window !== 'undefined') {
      window.location.assign(afterSelectOrganizationUrl);
    }
  };

  if (isCreating) {
    return (
      <CreateOrganization
        appearance={appearance}
        localization={localization}
        className={className}
        onCancel={() => setIsCreating(false)}
        onCreated={(organization) => after(organization)}
      />
    );
  }

  async function choose(organization: OrganizationMembership | null) {
    setChoosing(organization?.id ?? '__personal__');
    try {
      await setActive(organization?.id ?? null);
      after(organization);
    } finally {
      setChoosing(null);
    }
  }

  const user = state.user;
  const personalName = displayNameOf(user, t.personalAccount);

  return (
    <Brandable branding={branding} appearance={appearanceLayers} el={el} strings={strings} className={className}>
      <div {...el('card')} data-chrome={branding?.cardStyle ?? 'card'}>
        <Identity branding={branding} />
        <Heading
          title={t.title}
          subtitle={branding ? format(t.subtitle, { appName: branding.appName }) : null}
          fallbackTitle={t.title}
        />

        <div {...el('list')}>
          {allowPersonal ? (
            <button
              type="button"
              {...el('listItem')}
              disabled={choosing !== null}
              onClick={() => void choose(null)}
            >
              <span {...el('avatar')} aria-hidden="true">
                {user.imageUrl ? <img src={user.imageUrl} alt="" /> : initials(personalName)}
              </span>
              <span className="zv-truncate">{t.personalAccount}</span>
              {choosing === '__personal__' ? <Spinner /> : null}
            </button>
          ) : null}

          {organizations.map((organization) => (
            <button
              key={organization.id}
              type="button"
              {...el('listItem')}
              disabled={choosing !== null}
              onClick={() => void choose(organization)}
            >
              <span {...el('avatar')} data-shape="square" aria-hidden="true">
                {organization.imageUrl ? (
                  <img src={organization.imageUrl} alt="" />
                ) : (
                  initials(organization.name)
                )}
              </span>
              <span className="zv-truncate">{organization.name}</span>
              {choosing === organization.id ? <Spinner /> : null}
            </button>
          ))}

          {createOrganization ? (
            <button
              type="button"
              {...el('listItem')}
              data-kind="create"
              disabled={choosing !== null}
              onClick={() => {
                if (createOrganization === 'inline') setIsCreating(true);
                else if (typeof window !== 'undefined') window.location.assign(createOrganization);
              }}
            >
              <span className="zv-list-plus" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              {t.createOrganization}
            </button>
          ) : null}
        </div>

        {branding?.showPoweredBy !== false ? <PoweredBy environmentId={client.environmentId} /> : null}
      </div>
    </Brandable>
  );
}
