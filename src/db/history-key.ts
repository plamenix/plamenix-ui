import type { ConnectionForm } from './types.js';

/**
 * Which bucket a session's query history is filed under.
 *
 * History used to be keyed by saved-profile id alone, and the recording
 * path was written as `if let Some(pid) = profile_id`. So a session
 * opened by typing connection details straight into the form — no
 * profile saved — recorded nothing at all, forever, and said nothing
 * about it. Opening the history view showed an empty list that looked
 * exactly like a profile which happened to have run nothing yet.
 *
 * The recent-queries bucket had already solved this: it prefers the
 * profile name and "falls back to host/db so anonymous connections
 * still bucket cleanly". History now does the same thing.
 */

/**
 * A stable history bucket for a session.
 *
 * A saved profile keeps using its own id, so existing history is
 * untouched and follows the profile even if its connection details are
 * edited later. Everything else is filed under where the database
 * actually is, which is the only identity an unsaved connection has —
 * and it is stable, so reconnecting to the same database tomorrow shows
 * the same history.
 *
 * The `db:` prefix keeps derived keys out of the profile-id namespace;
 * a profile id can never collide with one.
 *
 * Deliberately excludes the user name. This edition is single-user, and
 * keying on the account would split one person's history across their
 * own SYSDBA and non-SYSDBA sessions against the same database — which
 * is precisely the continuity the user is asking for.
 *
 * @param profileId The saved profile driving this session, or `null`.
 * @param form The connection the session was opened with.
 * @returns The bucket key to record under and to read back.
 */
export function historyKeyOf(profileId: string | null | undefined, form: ConnectionForm): string {
  if (profileId) return profileId;
  // An embedded attachment has no host or port; the file is the whole
  // identity. Including the marker keeps an embedded session and a
  // server session against the same path in separate buckets, because
  // they genuinely are different connections.
  const where = form.embedded
    ? 'embedded'
    : `${form.host.trim().toLowerCase()}:${String(form.port)}`;
  return `db:${where}:${form.database.trim()}`;
}
