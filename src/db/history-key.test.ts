/**
 * The history bucket.
 *
 * This decides whether a statement is recorded at all. The recording
 * path was `if let Some(pid) = profile_id`, so a session opened without
 * a saved profile wrote nothing, forever, and said nothing about it —
 * the history view showed an empty list indistinguishable from a
 * profile that happened to have run nothing.
 */

import { describe, expect, it } from 'vitest';
import { historyKeyOf } from './history-key.js';
import type { ConnectionForm } from './types.js';

const FORM: ConnectionForm = {
  host: 'localhost',
  port: 3050,
  database: '/var/lib/firebird/data/test.fdb',
  user: 'SYSDBA',
  password: 'masterkey',
  pureRust: true,
  encryptionKey: '',
  encryptionRequired: false,
  fbclientPath: '',
  charset: 'UTF8',
  embedded: false,
} as ConnectionForm;

describe('historyKeyOf', () => {
  it('keeps a saved profile on its own id', () => {
    // Existing history must not move, and it should follow the profile
    // even if its connection details are edited later.
    expect(historyKeyOf('prof-123', FORM)).toBe('prof-123');
  });

  it('still buckets a connection with no profile', () => {
    // The bug. `null` used to mean "record nothing".
    const key = historyKeyOf(null, FORM);

    expect(key).not.toBe('');
    expect(key).toContain('/var/lib/firebird/data/test.fdb');
  });

  it('gives the same bucket on reconnect', () => {
    // History is worthless if today's session cannot see yesterday's.
    expect(historyKeyOf(null, FORM)).toBe(historyKeyOf(null, { ...FORM }));
  });

  it('separates different databases on one server', () => {
    const other = historyKeyOf(null, { ...FORM, database: '/data/other.fdb' });

    expect(other).not.toBe(historyKeyOf(null, FORM));
  });

  it('separates the same path on different servers', () => {
    const remote = historyKeyOf(null, { ...FORM, host: 'db.internal' });

    expect(remote).not.toBe(historyKeyOf(null, FORM));
  });

  it('separates ports', () => {
    expect(historyKeyOf(null, { ...FORM, port: 3051 })).not.toBe(historyKeyOf(null, FORM));
  });

  it('treats an embedded attachment as its own connection', () => {
    // Embedded has no host or port, and attaching to a file directly is
    // genuinely a different connection from reaching it through a
    // server that happens to serve the same path.
    const embedded = historyKeyOf(null, { ...FORM, embedded: true });

    expect(embedded).toContain('embedded');
    expect(embedded).not.toBe(historyKeyOf(null, FORM));
  });

  it('ignores host case and surrounding space', () => {
    // Typing `LocalHost` must not strand yesterday's history.
    expect(historyKeyOf(null, { ...FORM, host: '  LocalHost ' })).toBe(historyKeyOf(null, FORM));
  });

  it('does not split one person’s history by login account', () => {
    // Single-user edition. Reconnecting as a different Firebird account
    // against the same database is the same person's work.
    expect(historyKeyOf(null, { ...FORM, user: 'ALICE' })).toBe(historyKeyOf(null, FORM));
  });

  it('cannot collide with a profile id', () => {
    // Derived keys live in their own namespace.
    expect(historyKeyOf(null, FORM).startsWith('db:')).toBe(true);
  });

  it('treats an empty profile id as no profile', () => {
    // `''` reaches here from cleared form state and is not an id.
    expect(historyKeyOf('', FORM)).toBe(historyKeyOf(null, FORM));
  });
});
