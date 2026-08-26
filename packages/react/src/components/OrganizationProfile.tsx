import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ZevAuthError } from '@zevauth/js';
import type { OrganizationMember } from '@zevauth/js';
import { useZevAuthContext } from '../internal/context.js';
import { Brandable } from './Brandable.js';
import { Alert, Spinner } from './parts.js';

export interface OrganizationProfileProps {
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
export function OrganizationProfile({ className }: OrganizationProfileProps) {
  const { client, state } = useZevAuthContext('<OrganizationProfile>');

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
      <Brandable branding={client.branding} className={className}>
        <div className="zv-card" data-size="wide">
          <div className="zv-notice">
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
    <Brandable branding={client.branding} className={className}>
      <div className="zv-card" data-size="wide">
        <h1 className="zv-title" style={{ textAlign: 'left' }}>
          {organization.name}
        </h1>

        {error ? <Alert>{error}</Alert> : null}

        {canManage ? (
          <form className="zv-fields" onSubmit={onAdd}>
            <div className="zv-field">
              <label className="zv-label" htmlFor="zv-invite">
                Add a member
              </label>
              <input
                id="zv-invite"
                className="zv-input"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={isAdding}
                placeholder="colleague@example.com"
              />
              <span className="zv-hint">
                They need an account here already.
              </span>
            </div>
            <button
              type="submit"
              className="zv-button"
              data-variant="primary"
              disabled={isAdding || !inviteEmail}
            >
              {isAdding ? <Spinner /> : null}
              Add
            </button>
          </form>
        ) : null}

        <div className="zv-fields">
          <span className="zv-menu-label" style={{ padding: 0 }}>
            Members
          </span>

          {isLoading ? (
            <span className="zv-hint">Loading…</span>
          ) : members.length === 0 ? (
            <span className="zv-hint">Nobody yet.</span>
          ) : (
            members.map((member) => {
              const isSelf = member.userId === state.user?.id;
              const name =
                [member.firstName, member.lastName].filter(Boolean).join(' ') ||
                member.email ||
                member.userId;

              return (
                <div
                  key={member.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '7px 0',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="zv-truncate" style={{ fontSize: 13 }}>
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
                      className="zv-button"
                      data-variant="secondary"
                      style={{ width: 'auto' }}
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
            })
          )}
        </div>
      </div>
    </Brandable>
  );
}
