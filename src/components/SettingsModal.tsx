import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Kept in sync with the signup form in LoginPage.tsx. Accepts upper- and
// lowercase letters plus digits/underscores, 3-32 chars. We normalize
// (trim + lowercase) before sending so the displayed value may be
// `Alice_42` while the stored value is `alice_42`. The `citext` column
// in `profiles` makes the collision check case-insensitive on the
// server side too. Extracting to a shared util is a follow-up — for now
// the comment is the contract.
const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;

function normalizeUsername(s: string): string {
  return s.trim().toLowerCase();
}

interface Props {
  userId: string;
  userEmail: string | null;
  currentUsername: string | null;
  // Case-preserving form of the username (what the header actually shows).
  // Falls back to currentUsername in the UI if null — older accounts that
  // predate the display_username column won't have one until the schema
  // backfill runs.
  currentDisplayUsername: string | null;
  // True for anonymous guest sessions. Replaces the Username /
  // Password / Delete sections with an "Upgrade account" form so
  // the user can attach an email + password without first having
  // to know what a Supabase anonymous user is.
  isAnonymous: boolean;
  onClose: () => void;
  onUsernameUpdated: (newDisplayUsername: string) => void;
  onAccountDeleted: () => void;
  // Fired after the upgrade RPC succeeds — App.tsx flips the local
  // user out of anonymous mode so the header / settings refresh.
  onAccountUpgraded: (newEmail: string) => void;
}

type Provider = 'email' | 'google' | 'github' | 'unknown';

async function detectProvider(): Promise<Provider> {
  // Pull from the active user object so we don't trigger a network round-trip.
  // `getUser()` validates the JWT locally; cheaper than fetching fresh.
  const { data } = await supabase.auth.getUser();
  const provider = (data.user?.app_metadata?.provider ?? 'email') as string;
  if (provider === 'google' || provider === 'github' || provider === 'email') {
    return provider;
  }
  return 'unknown';
}

export function SettingsModal({
  userId,
  userEmail,
  currentUsername,
  currentDisplayUsername,
  isAnonymous,
  onClose,
  onUsernameUpdated,
  onAccountDeleted,
  onAccountUpgraded,
}: Props) {
  // ----- shared modal chrome (matches TaskModal) -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal settings-modal">
        <header className="modal-header">
          <h2 id="settings-modal-title">Settings</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="settings-modal-body">
          {isAnonymous ? (
            <UpgradeAccountSection
              onAccountUpgraded={onAccountUpgraded}
              onAccountDeleted={onAccountDeleted}
            />
          ) : (
            <>
              <UsernameSection
                userId={userId}
                currentUsername={currentUsername}
                currentDisplayUsername={currentDisplayUsername}
                onUsernameUpdated={onUsernameUpdated}
              />
              <PasswordSection userEmail={userEmail} />
              <DeleteAccountSection
                userEmail={userEmail}
                onAccountDeleted={onAccountDeleted}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section A — Username
// ---------------------------------------------------------------------------

interface UsernameSectionProps {
  userId: string;
  currentUsername: string | null;
  currentDisplayUsername: string | null;
  onUsernameUpdated: (newDisplayUsername: string) => void;
}

function UsernameSection({
  userId,
  currentUsername,
  currentDisplayUsername,
  onUsernameUpdated,
}: UsernameSectionProps) {
  // Pre-fill with the case-preserved form. Fall back to the canonical
  // (lowercased) username so older accounts without display_username
  // still show something readable in the input.
  const initial = currentDisplayUsername ?? currentUsername ?? '';
  const [username, setUsername] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // If the parent learns the username changed elsewhere, keep the input
  // in sync — e.g. App.tsx updates after a successful save.
  useEffect(() => {
    setUsername(currentDisplayUsername ?? currentUsername ?? '');
  }, [currentUsername, currentDisplayUsername]);

  const trimmed = username.trim();
  const normalized = normalizeUsername(username);
  const isValid = USERNAME_RE.test(trimmed);
  // "Unchanged" compares both display and canonical forms so a no-op
  // edit (case-only or otherwise) doesn't trigger a round-trip.
  const isUnchanged =
    trimmed === (currentDisplayUsername ?? '') &&
    normalized === (currentUsername ?? '');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValid) {
      setError('Use 3-32 characters: letters, numbers, and underscores');
      return;
    }
    if (isUnchanged) return;
    setBusy(true);
    // Save the case-preserved form into `display_username` and the
    // lowercased form into `username`. The unique constraint on
    // `username` enforces the case-insensitive collision check; a
    // 23505 here means someone else already owns this name (in any
    // case).
    const { error } = await supabase
      .from('profiles')
      .update({ username: normalized, display_username: trimmed })
      .eq('user_id', userId);
    setBusy(false);
    if (error) {
      if (error.code === '23505') {
        setError('That username is taken');
      } else {
        setError(error.message);
      }
      return;
    }
    onUsernameUpdated(trimmed);
    setSavedAt(Date.now());
  }

  return (
    <section className="settings-section">
      <h3>Username</h3>
      <p className="settings-help">
        Shown in the dashboard header. 3–32 characters: letters, numbers, and underscores. The
        username itself is case-insensitive — sign-in matches any case — but the form you type here
        is what the header displays.
      </p>
      <form onSubmit={handleSave} className="settings-username-form">
        <div className="field">
          <label htmlFor="settings-username">Username</label>
          <input
            id="settings-username"
            className="input"
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setSavedAt(null);
            }}
            placeholder="e.g. Alice_42"
            autoComplete="username"
            disabled={busy}
          />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {savedAt && !error && <p className="settings-saved" role="status">Username saved.</p>}
        <div className="settings-section-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !isValid || isUnchanged}
          >
            {busy ? 'Saving…' : 'Save username'}
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section B — Change password
// ---------------------------------------------------------------------------

interface PasswordSectionProps {
  userEmail: string | null;
}

function PasswordSection({ userEmail }: PasswordSectionProps) {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [resetSentAt, setResetSentAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    detectProvider().then((p) => {
      if (!cancelled) setProvider(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // OAuth-only users (Google/GitHub without a password set) can't use the
  // form. Surface a "send reset email" path instead — once they set a
  // password via the link, they can sign in with it AND via OAuth.
  if (provider && provider !== 'email') {
    return (
      <section className="settings-section">
        <h3>Password</h3>
        <p className="settings-help">
          You signed up with {provider === 'google' ? 'Google' : 'GitHub'}, so no password is set on
          your account. Send yourself a reset email to add one.
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        {resetSentAt && (
          <p className="settings-saved" role="status">
            Reset email sent. Check your inbox.
          </p>
        )}
        <div className="settings-section-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || !userEmail}
            onClick={async () => {
              if (!userEmail) return;
              setError(null);
              setBusy(true);
              const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
                redirectTo: window.location.origin,
              });
              setBusy(false);
              if (error) setError(error.message);
              else setResetSentAt(Date.now());
            }}
          >
            {busy ? 'Sending…' : 'Send password reset email'}
          </button>
        </div>
      </section>
    );
  }

  const newPwValid = newPw.length >= PASSWORD_MIN;
  const matches = newPw.length > 0 && newPw === confirmPw;

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!userEmail) {
      setError('No email on file — cannot verify current password.');
      return;
    }
    if (!currentPw) {
      setError('Enter your current password.');
      return;
    }
    if (!newPwValid) {
      setError(`New password must be at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (!matches) {
      setError('New password and confirmation do not match.');
      return;
    }
    setBusy(true);
    // Verify the current password first. Supabase has no "verify password"
    // method, so we re-authenticate as the proof. This re-issues a fresh
    // session — the subsequent updateUser() then lands on a verified caller.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPw,
    });
    if (signInErr) {
      setBusy(false);
      setError('Current password is incorrect.');
      return;
    }
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
    setBusy(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setSavedAt(Date.now());
  }

  return (
    <section className="settings-section">
      <h3>Password</h3>
      <p className="settings-help">At least {PASSWORD_MIN} characters. Changes take effect immediately.</p>
      <form onSubmit={handleChange} className="settings-password-form">
        <div className="field">
          <label htmlFor="settings-current-pw">Current password</label>
          <input
            id="settings-current-pw"
            className="input"
            type="password"
            value={currentPw}
            onChange={(e) => {
              setCurrentPw(e.target.value);
              setSavedAt(null);
            }}
            autoComplete="current-password"
            disabled={busy}
          />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="settings-new-pw">New password</label>
            <input
              id="settings-new-pw"
              className="input"
              type="password"
              value={newPw}
              onChange={(e) => {
                setNewPw(e.target.value);
                setSavedAt(null);
              }}
              autoComplete="new-password"
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="settings-confirm-pw">Confirm new password</label>
            <input
              id="settings-confirm-pw"
              className="input"
              type="password"
              value={confirmPw}
              onChange={(e) => {
                setConfirmPw(e.target.value);
                setSavedAt(null);
              }}
              autoComplete="new-password"
              disabled={busy}
            />
          </div>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {savedAt && !error && <p className="settings-saved" role="status">Password updated.</p>}
        <div className="settings-section-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !currentPw || !newPwValid || !matches}
          >
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section C — Delete account
// ---------------------------------------------------------------------------

interface DeleteAccountSectionProps {
  userEmail: string | null;
  onAccountDeleted: () => void;
}

function DeleteAccountSection({ userEmail, onAccountDeleted }: DeleteAccountSectionProps) {
  const [understood, setUnderstood] = useState(false);
  const [emailConfirm, setEmailConfirm] = useState('');
  const [deletePhrase, setDeletePhrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Anonymous accounts don't have an email on file, so the email-
  // confirmation step is meaningless for them — they confirm via
  // "DELETE" + the checkbox only. For real accounts both checks
  // are required (defense against the user accidentally typing
  // DELETE without thinking).
  const isAnonymous = !userEmail;
  const emailMatches = isAnonymous || emailConfirm.trim() === userEmail;
  const phraseMatches = deletePhrase.trim() === 'DELETE';
  const ready = understood && emailMatches && phraseMatches;

  async function handleDelete() {
    if (!ready) return;
    setError(null);
    setBusy(true);
    const { error } = await supabase.rpc('delete_own_account');
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    onAccountDeleted();
  }

  return (
    <section className="settings-section settings-danger">
      <h3>Delete account</h3>
      <p className="settings-help">
        Permanently removes your account, username, subjects, and tasks. This cannot be undone.
      </p>
      <ul className="settings-delete-checklist">
        <li>
          <label className="settings-delete-check">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              disabled={busy}
            />
            <span>I understand this permanently deletes my account and all data.</span>
          </label>
        </li>
        <li>
          {!isAnonymous && (
            <div className="field">
              <label htmlFor="settings-delete-email">Type your email to confirm</label>
              <input
                id="settings-delete-email"
                className="input"
                type="email"
                value={emailConfirm}
                onChange={(e) => setEmailConfirm(e.target.value)}
                placeholder={userEmail ?? ''}
                autoComplete="off"
                disabled={busy}
              />
            </div>
          )}
        </li>
        <li>
          <div className="field">
            <label htmlFor="settings-delete-phrase">Type the word DELETE</label>
            <input
              id="settings-delete-phrase"
              className="input"
              type="text"
              value={deletePhrase}
              onChange={(e) => setDeletePhrase(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              disabled={busy}
            />
          </div>
        </li>
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="settings-section-actions">
        <button
          type="button"
          className="btn-danger"
          onClick={handleDelete}
          disabled={!ready || busy}
        >
          {busy ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section (anonymous) — Upgrade account
// ---------------------------------------------------------------------------
// Shown in place of the regular Username / Password / Delete sections when
// the user is browsing as a guest. The upgrade flow calls
// supabase.auth.updateUser() with the new email + password — this attaches
// credentials to the existing anonymous session, so all tasks / subjects
// created during the guest session survive the upgrade.

interface UpgradeAccountSectionProps {
  onAccountUpgraded: (newEmail: string) => void;
  onAccountDeleted: () => void;
}

function UpgradeAccountSection({
  onAccountUpgraded,
  onAccountDeleted,
}: UpgradeAccountSectionProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Username goes through the same regex as signup (kept in sync via
  // a copy in the comment — see LoginPage.tsx). case-insensitive
  // collision is enforced server-side by the citext column.
  const normalizedUsername = username.trim().toLowerCase();
  const usernameValid = USERNAME_RE.test(username.trim());
  const emailValid = EMAIL_RE.test(email.trim());
  const passwordValid = password.length >= PASSWORD_MIN;
  const ready = usernameValid && emailValid && passwordValid;

  async function handleUpgrade(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ready) return;
    setBusy(true);
    // 1) Probe for username collision BEFORE the auth update. We use
    //    `maybeSingle` + a manual error-mapping instead of an RPC
    //    because the citext unique constraint is a 23505 SQLSTATE
    //    we can rely on — the client just needs to translate that
    //    into the user-facing message. Doing the probe before
    //    auth.updateUser means a taken username doesn't strand the
    //    user with credentials they can't use to claim a name.
    const { data: taken } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('username', normalizedUsername)
      .maybeSingle();
    if (taken) {
      setBusy(false);
      setError('That username is taken.');
      return;
    }
    // 2) Attach credentials to the existing anonymous session.
    //    updateUser is for "I already own this session, add
    //    credentials" — no confirmation email is sent.
    const { data, error: updErr } = await supabase.auth.updateUser({
      email: email.trim(),
      password,
    });
    if (updErr) {
      setBusy(false);
      setError(updErr.message);
      return;
    }
    const newEmail = data.user?.email ?? email.trim();
    // 3) Create the profile row. We do this directly rather than
    //    going through the handle_new_user trigger (which only fires
    //    on auth.users INSERT — updateUser doesn't fire it) so the
    //    race window between the uniqueness probe above and the
    //    insert is small but non-zero: a second concurrent signup
    //    could claim the username between probe and insert. The
    //    citext UNIQUE constraint catches that — we treat 23505 as
    //    "taken" and roll back the auth update by signing the user
    //    out so they can retry with a different name.
    const { error: profErr } = await supabase
      .from('profiles')
      .insert({
        user_id: data.user?.id,
        username: normalizedUsername,
        display_username: username.trim(),
      });
    if (profErr) {
      // 23505 = unique_violation in Postgres. Surface as the same
      // user-facing message regardless of whether the probe missed
      // or the constraint caught a race. The probe at the top of
      // this function ran BEFORE auth.updateUser attached an email
      // and password to this session, so a 23505 here means the
      // session is now stranded: credentials are attached, but the
      // username row was claimed by another signup before we could
      // insert. The user would otherwise be unable to recover —
      // signing in with the new email+password works, but the
      // username lookup that resolves to a user_id won't find them,
      // and the next "Continue as guest" would create a *second*
      // anonymous account. Sign out so they land on the login screen
      // and can pick a different name.
      setBusy(false);
      if (profErr.code === '23505') {
        try {
          await supabase.auth.signOut({ scope: 'global' });
        } catch {
          // Sign-out itself failed (network down). The local session
          // is still attached with the unclaimed credentials; call
          // onAccountDeleted so the parent flips the UI back to
          // LoginPage even if the server round-trip didn't land.
        }
        setError('That username was just taken. Please sign up again with a different name.');
        onAccountDeleted();
      } else {
        setError(profErr.message);
      }
      return;
    }
    setBusy(false);
    onAccountUpgraded(newEmail);
    setSavedAt(Date.now());
  }

  return (
    <>
      <section className="settings-section">
        <h3>Upgrade account</h3>
        <p className="settings-help">
          You're signed in as a guest. Choose a username and attach an email and password so you can sign back in from any device —
          your existing tasks and subjects are kept.
        </p>
        <form onSubmit={handleUpgrade} className="settings-upgrade-form">
          <div className="field">
            <label htmlFor="settings-upgrade-username">Username</label>
            <input
              id="settings-upgrade-username"
              className="input"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setSavedAt(null);
              }}
              placeholder="e.g. alice"
              autoComplete="username"
              pattern="[A-Za-z0-9_]{3,32}"
              title="3–32 letters, digits, or underscore"
              required
              disabled={busy}
              aria-invalid={username.length > 0 && !usernameValid}
            />
            {username.length > 0 && !usernameValid && (
              <p className="field-hint" role="alert">
                3–32 letters, digits, or underscore.
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="settings-upgrade-email">Email</label>
            <input
              id="settings-upgrade-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSavedAt(null);
              }}
              placeholder="you@example.com"
              autoComplete="email"
              required
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="settings-upgrade-password">Password</label>
            <input
              id="settings-upgrade-password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setSavedAt(null);
              }}
              placeholder={`At least ${PASSWORD_MIN} characters`}
              autoComplete="new-password"
              required
              disabled={busy}
            />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          {savedAt && !error && (
            <p className="settings-saved" role="status">Account upgraded. You can sign back in any time.</p>
          )}
          <div className="settings-section-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={!ready || busy}
              aria-busy={busy || undefined}
            >
              {busy ? 'Upgrading…' : 'Upgrade account'}
            </button>
          </div>
        </form>
      </section>

      <DeleteAccountSection
        userEmail={null}
        onAccountDeleted={onAccountDeleted}
      />
    </>
  );
}
