import { useEffect, useState, type FormEvent } from "react";
import { ZevAuthError } from "@zevauth/js";
import { useZevAuthContext } from "../internal/context.js";
import { Brandable } from "./Brandable.js";
import { Alert, Spinner } from "./parts.js";

export interface UserProfileProps {
  /**
   * Which part to render.
   *
   * `all` (default) shows both. `profile` and `security` render one
   * each, so they can live on separate pages or separate tabs of your
   * own settings screen. A settings area with its own navigation should
   * not be forced to show both under one heading.
   */
  section?: "all" | "profile" | "security";
  /**
   * Whether the password fields start open.
   *
   * Closed by default. Most visits to a profile page are to change a
   * name, and two empty password boxes on arrival invite a password
   * manager to fill them and a person to wonder whether something is
   * wrong with their account.
   */
  defaultPasswordOpen?: boolean;
  className?: string;
}

/**
 * Self-service: name, avatar and password.
 *
 * ── What is not here, and why it is not an oversight ──────────────
 * There is no email field. Moving an account to a new address has to be
 * proved before it takes effect, or anybody who finds an unlocked laptop
 * can move somebody's account somewhere they control. That is a flow
 * with its own verification, not a text input, and pretending otherwise
 * in the UI would invite exactly the endpoint we refused to build.
 */
export function UserProfile({
  section = "all",
  defaultPasswordOpen = false,
  className,
}: UserProfileProps) {
  const { client, state } = useZevAuthContext("<UserProfile>");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savedProfile, setSavedProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
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
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
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
          err instanceof ZevAuthError ? err.message : "Could not save.",
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
            ? err.message
            : "Could not change your password.",
        ),
      )
      .finally(() => {
        setIsSavingPassword(false);
        /*
         * Cleared on every outcome. The page stays open afterwards, and
         * a password sitting in a field is a password readable by
         * anyone who walks past the screen.
         */
        setCurrentPassword("");
        setNewPassword("");
      });
  };

  return (
    <Brandable branding={client.branding} className={className}>
      <div className="zv-card" data-size="wide">
        {section !== "security" ? (
          <h1 className="zv-title" style={{ textAlign: "left" }}>
            Your profile
          </h1>
        ) : null}

        {section !== "security" ? (
          <form className="zv-fields" onSubmit={onSaveProfile}>
            {profileError ? <Alert>{profileError}</Alert> : null}

            <div className="zv-field">
              <label className="zv-label" htmlFor="zv-profile-first">
                First name
              </label>
              <input
                id="zv-profile-first"
                className="zv-input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isSavingProfile}
                autoComplete="given-name"
              />
            </div>

            <div className="zv-field">
              <label className="zv-label" htmlFor="zv-profile-last">
                Last name
              </label>
              <input
                id="zv-profile-last"
                className="zv-input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isSavingProfile}
                autoComplete="family-name"
              />
            </div>

            <div className="zv-field">
              <label className="zv-label">Email</label>
              {/*
              Shown, not editable. Changing it needs proof, so it lives
              in its own flow rather than pretending to be a field.
            */}
              <input
                className="zv-input"
                value={user.email ?? ""}
                disabled
                readOnly
              />
              <span className="zv-hint">
                Contact support to change the address on your account.
              </span>
            </div>

            <button
              type="submit"
              className="zv-button"
              data-variant="primary"
              disabled={isSavingProfile}
            >
              {isSavingProfile ? <Spinner /> : null}
              {savedProfile && !isSavingProfile ? "Saved" : "Save"}
            </button>
          </form>
        ) : null}

        {section === "all" ? <hr className="zv-section-divider" /> : null}

        {section !== "profile" ? (
          <form className="zv-fields" onSubmit={onChangePassword}>
            {/*
            A disclosure, not a heading.

            The password fields are closed until somebody asks for them:
            most visits here are to change a name, and two empty password
            boxes on arrival invite a password manager to fill them and a
            person to wonder what is wrong.
          */}
            <button
              type="button"
              className="zv-more"
              style={{ justifyContent: "space-between", padding: "4px 0" }}
              aria-expanded={isPasswordOpen}
              onClick={() => setIsPasswordOpen((open) => !open)}
            >
              <span className="zv-label" style={{ fontSize: 13.5 }}>
                Change password
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
              data-open={isPasswordOpen ? "true" : "false"}
              inert={!isPasswordOpen}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                {passwordError ? <Alert>{passwordError}</Alert> : null}
                {revoked !== null ? (
                  <div className="zv-notice">
                    Password changed.
                    {revoked > 0
                      ? ` We signed out ${revoked} other ${revoked === 1 ? "session" : "sessions"}.`
                      : ""}
                  </div>
                ) : null}

                <div className="zv-field">
                  <label className="zv-label" htmlFor="zv-current-password">
                    Current password
                  </label>
                  <input
                    id="zv-current-password"
                    className="zv-input"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={isSavingPassword}
                    autoComplete="current-password"
                  />
                </div>

                <div className="zv-field">
                  <label className="zv-label" htmlFor="zv-new-password">
                    New password
                  </label>
                  <input
                    id="zv-new-password"
                    className="zv-input"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isSavingPassword}
                    autoComplete="new-password"
                  />
                  <span className="zv-hint">
                    8 characters or more. Your other devices will be signed out.
                  </span>
                </div>

                <button
                  type="submit"
                  className="zv-button"
                  data-variant="secondary"
                  disabled={
                    isSavingPassword ||
                    !currentPassword ||
                    newPassword.length < 8
                  }
                >
                  {isSavingPassword ? <Spinner /> : null}
                  Change password
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </div>
    </Brandable>
  );
}
