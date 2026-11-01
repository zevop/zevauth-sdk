import { useState, type FormEvent } from 'react';
import { ZevAuthError, type OrganizationMembership } from '@zevauth/js';
import { useComponentAppearance } from '../internal/context.js';
import type { Appearance } from '../internal/appearance.js';
import { errorMessage, type Localization, type Strings } from '../internal/localization.js';
import { Brandable } from './Brandable.js';
import { Alert, Heading, Spinner } from './parts.js';
import { ImageField } from './ImageField.js';

export interface CreateOrganizationProps {
  /** Where to go once it exists. Omit it to stay and use `onCreated`. */
  afterCreateOrganizationUrl?: string;
  /** Called with the new organization, which is already the active one. */
  onCreated?: (organization: OrganizationMembership) => void;
  /**
   * Ask for a slug as well as a name.
   *
   * Follows the console's slug setting when left out. Set it to force
   * the field on or off; an API too old to report the setting means
   * off, since a field the server then refuses is worse than no field.
   */
  showSlug?: boolean;
  /**
   * Offer a logo upload once the organization exists. On by default;
   * the step can always be skipped.
   */
  showLogoStep?: boolean;
  /** Called when the person presses Cancel. No Cancel button without it. */
  onCancel?: () => void;
  /** How this one component looks, merged over the provider's `appearance`. */
  appearance?: Appearance;
  /** The words on this component, merged over the provider's `localization`. */
  localization?: Localization;
  className?: string;
}

/** Codes the create endpoint refuses with, in words a person can act on. */
export function createOrganizationErrors(strings: Strings): Record<string, string> {
  const t = strings.createOrganization;
  return {
    organization_creation_disabled: t.creationDisabled,
    organizations_disabled: t.organizationsDisabled,
    organization_limit_reached: t.limitReached,
    organization_slug_taken: t.slugTaken,
    organization_slugs_disabled: t.slugsDisabled,
    organization_name_required: t.nameRequired,
  };
}

/**
 * A form that creates an organization and switches the session into it.
 *
 * ── Why the logo is a second step ─────────────────────────────────
 * An organization's picture is uploaded against the organization, so
 * there is nothing to attach it to until the create succeeds. Asking
 * for it in the same form would mean holding a file in memory, then
 * failing the upload after a successful create and leaving somebody
 * unsure whether anything happened. A separate, skippable step after
 * the create is honest about the order.
 */
export function CreateOrganization({
  afterCreateOrganizationUrl,
  onCreated,
  showSlug: showSlugProp,
  showLogoStep = true,
  onCancel,
  appearance,
  localization,
  className,
}: CreateOrganizationProps) {
  const {
    client,
    state,
    branding,
    appearance: appearanceLayers,
    el,
    strings,
  } = useComponentAppearance('<CreateOrganization>', appearance, localization);
  const t = strings.createOrganization;
  const policy = client.organizationSettings;
  const showSlug = showSlugProp ?? policy?.slugsEnabled ?? false;

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [created, setCreated] = useState<OrganizationMembership | null>(null);

  if (!state.isLoaded || !state.user) return null;

  const finish = (organization: OrganizationMembership) => {
    onCreated?.(organization);
    if (afterCreateOrganizationUrl && typeof window !== 'undefined') {
      window.location.assign(afterCreateOrganizationUrl);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    void client.organizations
      .create({ name: name.trim(), slug: showSlug && slug.trim() ? slug.trim() : undefined })
      .then((organization) => {
        if (showLogoStep) setCreated(organization);
        else finish(organization);
      })
      .catch((err) =>
        setError(
          err instanceof ZevAuthError
            ? errorMessage(strings, err, strings.common.genericError, createOrganizationErrors(strings))
            : strings.common.genericError,
        ),
      )
      .finally(() => setIsBusy(false));
  };

  return (
    <Brandable branding={branding} appearance={appearanceLayers} el={el} strings={strings} className={className}>
      <div {...el('card')} data-chrome={branding?.cardStyle ?? 'card'}>
        {created ? (
          <>
            <Heading title={t.logoTitle} subtitle={t.logoSubtitle} fallbackTitle={t.logoTitle} />
            <div {...el('fields')}>
              <ImageField
                label={t.logo}
                shape="square"
                value={created.imageUrl ?? null}
                upload={(file, onProgress) => client.organizations.uploadImage({ file, onProgress })}
                onSave={(imageUrl) =>
                  client.organizations
                    .update({ imageUrl })
                    .then((updated) => setCreated({ ...created, imageUrl: updated.imageUrl }))
                }
              />
            </div>
            <button
              type="button"
              {...el(['button', 'buttonPrimary'])}
              data-variant="primary"
              onClick={() => finish(created)}
            >
              {created.imageUrl ? t.done : t.skip}
            </button>
          </>
        ) : (
          <>
            <Heading title={t.title} subtitle={null} fallbackTitle={t.title} />
            {error ? <Alert>{error}</Alert> : null}
            {/*
              Said before anyone types, when the environment reports it.
              An API that does not report the policy gets the form, and
              the server's own refusal, as before.
            */}
            {policy && !policy.creationAllowed ? (
              <div {...el('notice')}>{t.notAllowed}</div>
            ) : (
            <form {...el('fields')} onSubmit={onSubmit}>
              <div {...el('field')}>
                <label {...el('label')} htmlFor="zv-org-name">
                  {t.name}
                </label>
                <input
                  id="zv-org-name"
                  {...el('input')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.namePlaceholder}
                  disabled={isBusy}
                  autoComplete="organization"
                  required
                  autoFocus
                />
              </div>

              {showSlug ? (
                <div {...el('field')}>
                  <label {...el('label')} htmlFor="zv-org-slug">
                    {t.slug}
                  </label>
                  <input
                    id="zv-org-slug"
                    {...el('input')}
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase())}
                    disabled={isBusy}
                    pattern="[a-z0-9-]*"
                    autoComplete="off"
                  />
                  <span {...el('hint')}>{t.slugHint}</span>
                </div>
              ) : null}

              <button
                type="submit"
                {...el(['button', 'buttonPrimary'])}
                data-variant="primary"
                disabled={isBusy || !name.trim()}
              >
                {isBusy ? <Spinner /> : null}
                {t.submit}
              </button>
              {onCancel ? (
                <button
                  type="button"
                  {...el(['button', 'buttonLink'])}
                  data-variant="ghost"
                  onClick={onCancel}
                  disabled={isBusy}
                >
                  {strings.common.cancel}
                </button>
              ) : null}
            </form>
            )}
          </>
        )}
      </div>
    </Brandable>
  );
}
