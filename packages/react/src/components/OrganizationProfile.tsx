import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ZevAuthError } from '@zevauth/js';
import type { OrganizationMember } from '@zevauth/js';
import { useComponentAppearance } from '../internal/context.js';
import type { Appearance } from '../internal/appearance.js';
import { errorMessage, format, type Localization } from '../internal/localization.js';
import { Brandable } from './Brandable.js';
import { Alert, Spinner } from './parts.js';
import { ImageField } from './ImageField.js';

export interface OrganizationProfileProps {
  /**
   * `'stacked'` (default) is one column, as it has always been.
   * `'sidebar'` puts General and Members in a navigation column beside
   * the content, for a settings page with room for it.
   */
  variant?: 'stacked' | 'sidebar';
  /** Offer a way to leave the organization. Off by default. */
  showLeave?: boolean;
  /**
   * Offer to delete the organization, to people allowed to (`org:delete`,
   * owners by default). Off by default. The name has to be typed to
   * confirm.
   */
  showDelete?: boolean;
  /** Where to go after leaving or deleting. Otherwise the app reacts to the session. */
  afterLeaveOrganizationUrl?: string;
  /** The words on this component, merged over the provider's `localization`. */
  localization?: Localization;
  /**
   * How this one component looks, merged over the provider's
   * `appearance`. See `Appearance` for the console fields, `variables`
   * and `elements`.
   */
  appearance?: Appearance;
  className?: string;
}

/**
 * Who is in the organization, and the controls to change that.
 *
 * ── Why the destructive controls are rendered but may still fail ──
 * What is shown is decided from the token's claims, which are a snapshot.
 * The server re-reads the live membership before allowing anything, so a
 * button can be visible to somebody who was demoted moments ago — and
 * pressing it produces a refusal, not a removal.
 *
 * That is the correct arrangement. Hiding the button is a courtesy;
 * refusing the request is the security. Getting the courtesy slightly
 * wrong for a few minutes costs an error message. Trusting it instead of
 * the server would cost a removal nobody was allowed to make.
 */
export function OrganizationProfile({
  variant = 'stacked',
  showLeave = false,
  showDelete = false,
  afterLeaveOrganizationUrl,
  appearance,
  localization,
  className,
}: OrganizationProfileProps) {
  const {
    client,
    state,
    branding,
    appearance: appearanceLayers,
    el,
    strings,
  } = useComponentAppearance('<OrganizationProfile>', appearance, localization);
  const t = strings.organizationProfile;

  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [section, setSection] = useState<'general' | 'members'>('general');
  const [confirming, setConfirming] = useState<'leave' | 'delete' | null>(null);
  const [typedName, setTypedName] = useState('');
  const [isLeaving, setIsLeaving] = useState(false);

  const organization = state.organization;
  const canManage = (organization?.permissions ?? []).includes(
    'org:members:manage',
  );
  /*
   * A different permission from managing members, and the server agrees.
   * Some organizations want people who can invite colleagues without
   * being able to change the name and picture that appear on every
   * screen in the product.
   */
  const canManageOrg = (organization?.permissions ?? []).includes('org:manage');

  /*
   * Held locally as well as on `state.organization`.
   *
   * The active organization comes from the token, which is refreshed at
   * most every fifteen minutes. Without this, a picture would upload
   * successfully, save successfully, and then not appear until the token
   * caught up — which reads as the save having silently failed.
   */
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(
    () => setImageUrl(organization?.imageUrl ?? null),
    [organization?.imageUrl],
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setMembers(await client.organizations.members());
    } catch {
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!organization) {
      setMembers([]);
      setIsLoading(false);
      return;
    }
    void refresh();
  }, [organization?.id, refresh, organization]);

  if (!state.isLoaded || !state.user) return null;

  if (!organization) {
    return (
      <Brandable branding={branding} appearance={appearanceLayers} el={el} strings={strings} className={className}>
        <div {...el('card')} data-size="wide">
          <div {...el('notice')}>
            {t.notActing}
          </div>
        </div>
      </Brandable>
    );
  }

  const known = {
    organization_last_owner: t.lastOwner,
    organization_delete_disabled: t.deleteDisabled,
    organization_permission_required: t.permissionRequired,
  };

  const run = (action: () => Promise<void>) => {
    setError(null);
    return action()
      .then(refresh)
      .catch((err) =>
        setError(
          err instanceof ZevAuthError ? errorMessage(strings, err, t.genericError, known) : t.genericError,
        ),
      );
  };

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    setIsAdding(true);
    void run(() => client.organizations.addMember({ email: inviteEmail }))
      .then(() => setInviteEmail(''))
      .finally(() => setIsAdding(false));
  };

  /*
   * Leaving and deleting end with the session out of this organization,
   * so there is nothing to refresh afterwards: the component re-renders
   * as "not acting as an organization", or the app navigates.
   */
  const exit = (action: () => Promise<void>) => {
    setError(null);
    setIsLeaving(true);
    void action()
      .then(() => {
        setConfirming(null);
        setTypedName('');
        if (afterLeaveOrganizationUrl && typeof window !== 'undefined') {
          window.location.assign(afterLeaveOrganizationUrl);
        }
      })
      .catch((err) =>
        setError(
          err instanceof ZevAuthError ? errorMessage(strings, err, t.genericError, known) : t.genericError,
        ),
      )
      .finally(() => setIsLeaving(false));
  };

  const canDelete = (organization.permissions ?? []).includes('org:delete');

  const imageBlock = canManageOrg ? (
    <div {...el('fields')}>
      <ImageField
        label={t.image}
        shape="square"
        value={imageUrl}
        upload={(file, onProgress) =>
          client.organizations.uploadImage({ file, onProgress })
        }
        onSave={(url) =>
          client.organizations
            .update({ imageUrl: url })
            .then((updated) => setImageUrl(updated.imageUrl))
        }
      />
    </div>
  ) : null;

  const addMemberForm = canManage ? (
    <form {...el('fields')} onSubmit={onAdd}>
      <div {...el('field')}>
        <label {...el('label')} htmlFor="zv-invite">
          {t.addMember}
        </label>
        <input
          id="zv-invite"
          {...el('input')}
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          disabled={isAdding}
          placeholder={t.addMemberPlaceholder}
        />
        <span {...el('hint')}>
          {t.addMemberHint}
        </span>
      </div>
      <button
        type="submit"
        {...el(['button', 'buttonPrimary'])}
        data-variant="primary"
        disabled={isAdding || !inviteEmail}
      >
        {isAdding ? <Spinner /> : null}
        {t.add}
      </button>
    </form>
  ) : null;

  const membersBlock = (
    <div {...el('fields')}>
      <span {...el('menuLabel', { padding: 0 })}>
        {t.members}
      </span>

      {isLoading ? (
        <span {...el('hint')}>{t.loading}</span>
      ) : members.length === 0 ? (
        <span {...el('hint')}>{t.empty}</span>
      ) : (
        <div {...el('memberList')}>
        {members.map((member) => {
          const isSelf = member.userId === state.user?.id;
          const name =
            [member.firstName, member.lastName].filter(Boolean).join(' ') ||
            member.email ||
            member.userId;

          return (
            <div key={member.userId} {...el('memberRow')}>
              <div style={{ minWidth: 0 }}>
                <div className="zv-member-name zv-truncate">
                  {name}
                  {isSelf ? t.you : ''}
                </div>
                <div className="zv-menu-sub">{member.role}</div>
              </div>

              {/*
                Anybody may remove themselves; removing anyone else
                needs the permission. An organization you cannot
                leave is a trap, so the control is offered even to a
                member with no rights over anyone else.
              */}
              {canManage || isSelf ? (
                <button
                  type="button"
                  {...el(['button', 'buttonSecondary'])}
                  data-variant="secondary"
                  disabled={busyMember !== null}
                  onClick={() => {
                    setBusyMember(member.userId);
                    void run(() =>
                      client.organizations.removeMember({
                        userId: member.userId,
                      }),
                    ).finally(() => setBusyMember(null));
                  }}
                >
                  {busyMember === member.userId ? <Spinner /> : null}
                  {isSelf ? t.leave : t.remove}
                </button>
              ) : null}
            </div>
          );
        })}
        </div>
      )}
    </div>
  );

  /*
   * Each destructive action opens its own confirmation in place rather
   * than a dialog: the consequence is printed beside the button that
   * caused it, and deleting asks for the name, so a mis-click on the
   * wrong organization in a list of several cannot complete.
   */
  const exitBlock =
    showLeave || (showDelete && canDelete) ? (
      <div className="zv-section">
        {showLeave ? (
          <div {...el('fields')}>
            <div className="zv-section-row">
              <span {...el('sectionTitle')}>{t.leaveTitle}</span>
              {confirming !== 'leave' ? (
                <button
                  type="button"
                  {...el(['button', 'buttonDanger'], { width: 'auto' })}
                  data-variant="danger"
                  onClick={() => setConfirming('leave')}
                >
                  {t.leaveAction}
                </button>
              ) : null}
            </div>
            {confirming === 'leave' ? (
              <div {...el('notice')}>
                {format(t.leaveBody, { name: organization.name })}
                <div className="zv-section-row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    {...el(['button', 'buttonLink'], { width: 'auto' })}
                    data-variant="ghost"
                    onClick={() => setConfirming(null)}
                  >
                    {strings.common.cancel}
                  </button>
                  <button
                    type="button"
                    {...el(['button', 'buttonDanger'], { width: 'auto' })}
                    data-variant="danger"
                    disabled={isLeaving}
                    onClick={() => exit(() => client.organizations.leave())}
                  >
                    {isLeaving ? <Spinner /> : null}
                    {t.leaveConfirm}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {showDelete && canDelete ? (
          <div {...el('fields')}>
            <div className="zv-section-row">
              <span {...el('sectionTitle')}>{t.deleteTitle}</span>
              {confirming !== 'delete' ? (
                <button
                  type="button"
                  {...el(['button', 'buttonDanger'], { width: 'auto' })}
                  data-variant="danger"
                  onClick={() => setConfirming('delete')}
                >
                  {t.deleteAction}
                </button>
              ) : null}
            </div>
            {confirming === 'delete' ? (
              <form
                {...el('fields')}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (typedName !== organization.name) return;
                  exit(() => client.organizations.delete());
                }}
              >
                <span {...el('hint')}>{format(t.deleteBody, { name: organization.name })}</span>
                <div {...el('field')}>
                  <label {...el('label')} htmlFor="zv-delete-org">
                    {format(t.deleteConfirmLabel, { name: organization.name })}
                  </label>
                  <input
                    id="zv-delete-org"
                    {...el('input')}
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    autoComplete="off"
                    disabled={isLeaving}
                  />
                </div>
                <div className="zv-section-row" style={{ justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    {...el(['button', 'buttonLink'], { width: 'auto' })}
                    data-variant="ghost"
                    onClick={() => {
                      setConfirming(null);
                      setTypedName('');
                    }}
                  >
                    {strings.common.cancel}
                  </button>
                  <button
                    type="submit"
                    {...el(['button', 'buttonDanger'], { width: 'auto' })}
                    data-variant="danger"
                    disabled={isLeaving || typedName !== organization.name}
                  >
                    {isLeaving ? <Spinner /> : null}
                    {t.deleteConfirm}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    ) : null;

  if (variant === 'sidebar') {
    return (
      <Brandable branding={branding} appearance={appearanceLayers} el={el} strings={strings} className={className}>
        <div {...el('card')} data-layout="sidebar">
          <nav {...el('navigation')} aria-label={organization.name}>
            <div className="zv-nav-heading">
              <h1 {...el('title', { textAlign: 'left' })}>{organization.name}</h1>
              <p {...el('subtitle', { textAlign: 'left' })}>{t.navSubtitle}</p>
            </div>
            {(['general', 'members'] as const).map((key) => (
              <button
                key={key}
                type="button"
                {...el('navigationItem')}
                aria-current={section === key ? 'page' : undefined}
                onClick={() => setSection(key)}
              >
                {key === 'general' ? t.generalSection : t.membersSection}
              </button>
            ))}
          </nav>
          <div {...el('panel')}>
            <h2 {...el('sectionTitle')}>
              {section === 'general' ? t.generalSection : t.membersSection}
            </h2>
            {error ? <Alert>{error}</Alert> : null}
            {section === 'general' ? (
              <>
                {imageBlock}
                {exitBlock}
              </>
            ) : (
              <>
                {addMemberForm}
                {membersBlock}
              </>
            )}
          </div>
        </div>
      </Brandable>
    );
  }

  return (
    <Brandable branding={branding} appearance={appearanceLayers} el={el} strings={strings} className={className}>
      <div {...el('card')} data-size="wide">
        <h1 {...el('title', { textAlign: 'left' })}>
          {organization.name}
        </h1>

        {error ? <Alert>{error}</Alert> : null}

        {imageBlock}
        {addMemberForm}
        {membersBlock}
        {exitBlock ? <hr {...el('sectionDivider')} /> : null}
        {exitBlock}
      </div>
    </Brandable>
  );
}
