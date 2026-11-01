import { useEffect, useState, type FormEvent } from 'react';
import { ZevAuthError } from '@zevauth/js';
import { useComponentAppearance } from '../internal/context.js';
import type { Appearance } from '../internal/appearance.js';
import { errorMessage, format, type Localization } from '../internal/localization.js';
import { ActiveDevices } from './ActiveDevices.js';
import { Brandable } from './Brandable.js';
import { Alert, Spinner } from './parts.js';
import { ImageField } from './ImageField.js';

export interface UserProfileProps {
  /**
   * Which part to render.
   *
   * `all` (default) shows both. `profile` and `security` render one
   * each, so they can live on separate pages or separate tabs of your
   * own settings screen. A settings area with its own navigation should
   * not be forced to show both under one heading.
   */
  section?: 'all' | 'profile' | 'security';
  /**
   * Whether the password fields start open.
   *
   * Closed by default. Most visits to a profile page are to change a
   * name, and two empty password boxes on arrival invite a password
   * manager to fill them and a person to wonder whether something is
   * wrong with their account.
   */
  defaultPasswordOpen?: boolean;
  /**
   * `'stacked'` (default) is one column, as it has always been.
   * `'sidebar'` puts Profile and Security in a navigation column beside
   * the content, for a settings page or a dialog with room for it.
   * `section` still limits what is offered.
   */
  variant?: 'stacked' | 'sidebar';
  /**
   * List the devices this person is signed in on, under Security, with
   * a way to sign each one out. Off by default.
   */
  showSessions?: boolean;
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
 * Self-service: name, email and password.
 *
 * ── Why the email field is a flow, not an input ───────────────────
 * Typing a new address does not change anything. A link goes to that
 * address and the account keeps its current one until the link is
 * opened, because anybody who finds an unlocked laptop could otherwise
 * move an account somewhere they control, and every recovery path would
 * follow them there.
 *
 * So the field submits a REQUEST, the UI says a confirmation is on its
 * way, and a pending change can be cancelled. The current address stays
 * on screen throughout, because it is still the address on the account.
 */
export function UserProfile({
  section = 'all',
  defaultPasswordOpen = false,
  variant = 'stacked',
  showSessions = false,
  appearance,
  localization,
  className,
}: UserProfileProps) {
  const {
    client,
    state,
    branding,
    appearance: appearanceLayers,
    el,
    strings,
  } = useComponentAppearance('<UserProfile>', appearance, localization);
  const t = strings.userProfile;
  const [activeSection, setActiveSection] = useState<'profile' | 'security'>(
    section === 'security' ? 'security' : 'profile',
  );

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savedProfile, setSavedProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isEmailOpen, setIsEmailOpen] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState<number | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(defaultPasswordOpen);

  const user = state.user;

  useEffect(() => {
    /*
     * Seeded from the user, and re-seeded when it changes.
     *
     * Not held as `defaultValue`: the profile arrives after the first
     * render, and an uncontrolled field would keep the empty string it
     * mounted with.
     */
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
  }, [user?.firstName, user?.lastName]);

  if (!state.isLoaded || !user) return null;

  const onSaveProfile = (event: FormEvent) => {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileError(null);
    setSavedProfile(false);

    void client.me
      .update({ firstName, lastName })
      .then(() => setSavedProfile(true))
      .catch((err) =>
        setProfileError(
          err instanceof ZevAuthError ? errorMessage(strings, err, t.saveFailed) : t.saveFailed,
        ),
      )
      .finally(() => setIsSavingProfile(false));
  };

  const onChangePassword = (event: FormEvent) => {
    event.preventDefault();
    setIsSavingPassword(true);
    setPasswordError(null);
    setRevoked(null);

    void client.me
      .changePassword({ currentPassword, newPassword })
      .then((result) => setRevoked(result.otherSessionsRevoked))
      .catch((err) =>
        setPasswordError(
          err instanceof ZevAuthError
            ? errorMessage(strings, err, t.passwordChangeFailed)
            : t.passwordChangeFailed,
        ),
      )
      .finally(() => {
        setIsSavingPassword(false);
        /*
         * Cleared on every outcome. The page stays open afterwards, and
         * a password sitting in a field is a password readable by
         * anyone who walks past the screen.
         */
        setCurrentPassword('');
        setNewPassword('');
      });
  };

  const profileForm = (
    <form {...el('fields')} onSubmit={onSaveProfile}>
      {profileError ? <Alert>{profileError}</Alert> : null}

      {/*
        First, because it is the field people came to change and
        the only one they can see the result of. It saves on its
        own rather than waiting for the form's button: an upload
        has already happened by the time the picture appears, and
        a Save that seemed to be needed afterwards would be a
        second, confusing commitment to something already done.
      */}
      <ImageField
        label={t.photo}
        value={user.imageUrl ?? null}
        isDisabled={isSavingProfile}
        upload={(file, onProgress) =>
          client.me.uploadAvatar({ file, onProgress })
        }
        onSave={(imageUrl) => client.me.update({ imageUrl })}
      />

      <div {...el('field')}>
        <label {...el('label')} htmlFor="zv-profile-first">
          {t.firstName}
        </label>
        <input
          id="zv-profile-first"
          {...el('input')}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          disabled={isSavingProfile}
          autoComplete="given-name"
        />
      </div>

      <div {...el('field')}>
        <label {...el('label')} htmlFor="zv-profile-last">
          {t.lastName}
        </label>
        <input
          id="zv-profile-last"
          {...el('input')}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          disabled={isSavingProfile}
          autoComplete="family-name"
        />
      </div>

      <div {...el('field')}>
        <label {...el('label')}>{t.email}</label>
        {/*
          The address on the account, which is the current one
          until a change is proved. Not editable in place: the new
          address is asked for separately, below.
        */}
        <input
          {...el('input')}
          value={user.email ?? ''}
          disabled
          readOnly
        />

        {pendingEmail ? (
          <div {...el('notice')}>
            {format(t.pendingEmail, { email: pendingEmail })}{' '}
            <button
              type="button"
              {...el(['button', 'buttonLink'], { width: 'auto', display: 'inline-flex' })}
              data-variant="ghost"
              onClick={() => {
                void client.me.cancelEmailChange().then(() => {
                  setPendingEmail(null);
                  setNewEmail('');
                });
              }}
            >
              {t.cancel}
            </button>
          </div>
        ) : (
          <button
            type="button"
            {...el('moreToggle', { justifyContent: 'flex-start', padding: '2px 0' })}
            aria-expanded={isEmailOpen}
            onClick={() => setIsEmailOpen((open) => !open)}
          >
            {t.changeEmail}
          </button>
        )}
      </div>

      {/*
        Typing a new address changes nothing. A link goes there and
        the account keeps its current address until that link is
        opened, or anybody with a borrowed session could move an
        account somewhere they control and every recovery path
        would follow them.
      */}
      <div
        className="zv-reveal"
        data-open={isEmailOpen && !pendingEmail ? 'true' : 'false'}
        inert={!isEmailOpen || Boolean(pendingEmail)}
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {emailError ? <Alert>{emailError}</Alert> : null}

          <div {...el('field')}>
            <label {...el('label')} htmlFor="zv-new-email">
              {t.newEmail}
            </label>
            <input
              id="zv-new-email"
              {...el('input')}
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              disabled={isSavingEmail}
              autoComplete="email"
            />
            <span {...el('hint')}>
              {t.newEmailHint}
            </span>
          </div>

          <div {...el('field')}>
            <label {...el('label')} htmlFor="zv-email-password">
              {t.currentPassword}
            </label>
            <input
              id="zv-email-password"
              {...el('input')}
              type="password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              disabled={isSavingEmail}
              autoComplete="current-password"
            />
          </div>

          <button
            type="button"
            {...el(['button', 'buttonSecondary'])}
            data-variant="secondary"
            disabled={isSavingEmail || !newEmail}
            onClick={() => {
              setIsSavingEmail(true);
              setEmailError(null);
              void client.me
                .requestEmailChange({
                  newEmail,
                  currentPassword: emailPassword || undefined,
                })
                .then((result) => {
                  setPendingEmail(result.pendingEmail);
                  setIsEmailOpen(false);
                })
                .catch((err) =>
                  setEmailError(
                    err instanceof ZevAuthError
                      ? errorMessage(strings, err, t.emailChangeFailed)
                      : t.emailChangeFailed,
                  ),
                )
                .finally(() => {
                  setIsSavingEmail(false);
                  // Never left in the field, for the same reason
                  // the password fields are cleared below.
                  setEmailPassword('');
                });
            }}
          >
            {isSavingEmail ? <Spinner /> : null}
            {t.sendConfirmation}
          </button>
        </div>
      </div>

      <button
        type="submit"
        {...el(['button', 'buttonPrimary'])}
        data-variant="primary"
        disabled={isSavingProfile}
      >
        {isSavingProfile ? <Spinner /> : null}
        {savedProfile && !isSavingProfile ? t.saved : t.save}
      </button>
    </form>
  );

  const passwordForm = (
    <form {...el('fields')} onSubmit={onChangePassword}>
      {/*
      A disclosure, not a heading.

      The password fields are closed until somebody asks for them:
      most visits here are to change a name, and two empty password
      boxes on arrival invite a password manager to fill them and a
      person to wonder what is wrong.
    */}
      <button
        type="button"
        {...el('moreToggle', { justifyContent: 'space-between', padding: '4px 0' })}
        aria-expanded={isPasswordOpen}
        onClick={() => setIsPasswordOpen((open) => !open)}
      >
        <span {...el('label', { fontSize: 'var(--zv-font-size)' })}>
          {t.changePassword}
        </span>
        <svg
          className="zv-chevron"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div
        className="zv-reveal"
        data-open={isPasswordOpen ? 'true' : 'false'}
        inert={!isPasswordOpen}
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {passwordError ? <Alert>{passwordError}</Alert> : null}
          {revoked !== null ? (
            <div {...el('notice')}>
              {t.passwordChanged}
              {revoked > 0
                ? format(revoked === 1 ? t.otherSessionSignedOut : t.otherSessionsSignedOut, { count: revoked })
                : ''}
            </div>
          ) : null}

          <div {...el('field')}>
            <label {...el('label')} htmlFor="zv-current-password">
              {t.currentPassword}
            </label>
            <input
              id="zv-current-password"
              {...el('input')}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={isSavingPassword}
              autoComplete="current-password"
            />
          </div>

          <div {...el('field')}>
            <label {...el('label')} htmlFor="zv-new-password">
              {t.newPassword}
            </label>
            <input
              id="zv-new-password"
              {...el('input')}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isSavingPassword}
              autoComplete="new-password"
            />
            <span {...el('hint')}>
              {t.newPasswordHint}
            </span>
          </div>

          <button
            type="submit"
            {...el(['button', 'buttonSecondary'])}
            data-variant="secondary"
            disabled={
              isSavingPassword ||
              !currentPassword ||
              newPassword.length < 8
            }
          >
            {isSavingPassword ? <Spinner /> : null}
            {t.changePassword}
          </button>
        </div>
      </div>
    </form>
  );

  const devices = showSessions ? <ActiveDevices client={client} /> : null;

  if (variant === 'sidebar') {
    const sections = (['profile', 'security'] as const).filter(
      (key) => section === 'all' || section === key,
    );
    const current = sections.includes(activeSection) ? activeSection : sections[0];

    return (
      <Brandable branding={branding} appearance={appearanceLayers} el={el} strings={strings} className={className}>
        <div {...el('card')} data-layout="sidebar">
          <nav {...el('navigation')} aria-label={t.navTitle}>
            <div className="zv-nav-heading">
              <h1 {...el('title', { textAlign: 'left' })}>{t.navTitle}</h1>
              <p {...el('subtitle', { textAlign: 'left' })}>{t.navSubtitle}</p>
            </div>
            {sections.map((key) => (
              <button
                key={key}
                type="button"
                {...el('navigationItem')}
                aria-current={current === key ? 'page' : undefined}
                onClick={() => setActiveSection(key)}
              >
                {key === 'profile' ? t.profileSection : t.securitySection}
              </button>
            ))}
          </nav>
          <div {...el('panel')}>
            <h2 {...el('sectionTitle')}>
              {current === 'profile' ? t.profileSection : t.securitySection}
            </h2>
            {current === 'profile' ? (
              profileForm
            ) : (
              <>
                {passwordForm}
                {devices ? <hr {...el('sectionDivider')} /> : null}
                {devices}
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
        {section !== 'security' ? (
          <h1 {...el('title', { textAlign: 'left' })}>
            {t.title}
          </h1>
        ) : null}

        {section !== 'security' ? profileForm : null}

        {section === 'all' ? <hr {...el('sectionDivider')} /> : null}

        {section !== 'profile' ? passwordForm : null}

        {section !== 'profile' && devices ? <hr {...el('sectionDivider')} /> : null}
        {section !== 'profile' ? devices : null}
      </div>
    </Brandable>
  );
}
