import type { ConnectionForm, Profile } from './types.js';

/**
 * Turning a saved profile into a connection form, and back.
 *
 * Both shells had these inline and byte-identical. The field list is
 * the sort of thing that grows a member and gets updated in one copy.
 */

/**
 * Fills a connection form from a saved profile.
 *
 * Secrets are deliberately blank rather than carried over. A profile
 * stores its password in the OS keyring or the server's store, not in
 * the profile record, so there is nothing to copy — and pre-filling the
 * field with the previous connection's password would submit one
 * database's credentials to another.
 */
export function profileToForm(profile: Profile): ConnectionForm {
  return {
    host: profile.host,
    port: profile.port,
    database: profile.database,
    user: profile.user,
    password: '',
    pureRust: profile.pureRust,
    encryptionKey: '',
    encryptionRequired: profile.encryptionRequired,
    fbclientPath: profile.fbclientPath ?? '',
    charset: profile.charset ?? 'UTF8',
    embedded: profile.embedded ?? false,
  };
}

/**
 * Overlays a profile's connection details onto an existing form,
 * keeping whatever the user has already typed into the secret fields.
 *
 * This is the quick-connect merge: the user may have typed a password
 * before picking a profile from the list, and discarding it would make
 * the fast path slower than the slow one.
 */
export function profileOntoForm(base: ConnectionForm, profile: Profile): ConnectionForm {
  return {
    ...base,
    host: profile.host,
    port: profile.port,
    database: profile.database,
    user: profile.user,
    pureRust: profile.pureRust,
    encryptionRequired: profile.encryptionRequired,
    fbclientPath: profile.fbclientPath ?? '',
    charset: profile.charset ?? 'UTF8',
    embedded: profile.embedded ?? false,
  };
}
