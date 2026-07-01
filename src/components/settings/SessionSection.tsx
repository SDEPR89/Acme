// ---------------------------------------------------------------------------
// SessionSection — sits at the top of the modal to show current identity.
// ---------------------------------------------------------------------------

interface Props {
  userEmail: string | null;
  currentUsername: string | null;
  // Case-preserving form of the username (what the header shows).
  currentDisplayUsername: string | null;
  isAnonymous: boolean;
}

export function SessionSection({
  userEmail,
  currentUsername,
  currentDisplayUsername,
  isAnonymous,
}: Props) {
  // For real accounts, show the email (the unique identifier). For
  // anonymous users show "Guest" — there's no other identity to
  // surface and the upgrade CTA below explains how to convert
  // this session.
  const identity = isAnonymous
    ? 'Guest'
    : userEmail ?? currentDisplayUsername ?? currentUsername ?? '';

  return (
    <section className="settings-section">
      <h3>Session</h3>
      <p className="settings-help">
        {isAnonymous
          ? 'You’re signed in as a guest. Your tasks save to this browser only. Upgrade below to sync across devices.'
          : `Signed in as ${identity}.`}
      </p>
    </section>
  );
}
