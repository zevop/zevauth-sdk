import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ZevAuthError } from '@zevauth/js';
import type { OrganizationMember } from '@zevauth/js';
import { useComponentAppearance } from '../internal/context.js';
import type { Appearance } from '../internal/appearance.js';
import { Brandable } from './Brandable.js';
import { Alert, Spinner } from './parts.js';
import { ImageField } from './ImageField.js';

export interface OrganizationProfileProps {
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
export function OrganizationProfile({ appearance, className }: OrganizationProfileProps) {
  const {
    client,
    state,
    branding,
    appearance: appearanceLayers,
    el,
  } = useComponentAppearance('<OrganizationProfile>', appearance);

  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [busyMember, setBusyMember] = useState<string | null>(null);

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
      <Brandable branding={branding} appearance={appearanceLayers} el={el} className={className}>
        <div {...el('card')} data-size="wide">
          <div {...el('notice')}>
            This session is not acting as an organization. Switch to one to
            manage its members.
          </div>
        </div>
      </Brandable>
    );
  }

  const run = (action: () => Promise<void>) => {
    setError(null);
    return action()
      .then(refresh)
      .catch((err) =>
        setError(
          err instanceof ZevAuthError ? err.message : 'That did not work.',
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

  return (
    <Brandable branding={branding} appearance={appearanceLayers} el={el} className={className}>
      <div {...el('card')} data-size="wide">
        <h1 {...el('title', { textAlign: 'left' })}>
          {organization.name}
        </h1>

        {error ? <Alert>{error}</Alert> : null}

        {canManageOrg ? (
          <div {...el('fields')}>
            <ImageField
              label="Organization image"
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
        ) : null}

        {canManage ? (
          <form {...el('fields')} onSubmit={onAdd}>
            <div {...el('field')}>
              <label {...el('label')} htmlFor="zv-invite">
                Add a member
              </label>
              <input
                id="zv-invite"
                {...el('input')}
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={isAdding}
                placeholder="colleague@example.com"
              />
              <span {...el('hint')}>
                They need an account here already.
              </span>
            </div>
            <button
              type="submit"
              {...el(['button', 'buttonPrimary'])}
              data-variant="primary"
              disabled={isAdding || !inviteEmail}
            >
              {isAdding ? <Spinner /> : null}
              Add
            </button>
          </form>
        ) : null}

        <div {...el('fields')}>
          <span {...el('menuLabel', { padding: 0 })}>
            Members
          </span>

          {isLoading ? (
            <span {...el('hint')}>Loading…</span>
          ) : members.length === 0 ? (
            <span {...el('hint')}>Nobody yet.</span>
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
                      {isSelf ? ' (you)' : ''}
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
                      {isSelf ? 'Leave' : 'Remove'}
                    </button>
                  ) : null}
                </div>
              );
            })}
            </div>
          )}
        </div>
      </div>
    </Brandable>
  );
}
