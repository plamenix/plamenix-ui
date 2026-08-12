/**
 * Turning a saved profile into a connection form.
 *
 * The two merges differ in one respect that matters: picking a profile
 * from the connect screen clears the secret fields, while quick-connect
 * keeps them. Both were inline in each shell, so the distinction lived
 * nowhere and was four copies deep.
 */

import { describe, expect, it } from 'vitest';
import { profileOntoForm, profileToForm } from './profile-form.js';
import type { ConnectionForm, Profile } from './types.js';

const PROFILE = {
  id: 'p1',
  name: 'Production',
  host: 'db.example.com',
  port: 3051,
  database: '/data/prod.fdb',
  user: 'APP',
  pureRust: true,
  encryptionRequired: true,
  fbclientPath: '/opt/fb/libfbclient.so',
  charset: 'WIN1250',
  embedded: false,
  color: 'amber',
} as unknown as Profile;

const CURRENT: ConnectionForm = {
  host: 'localhost',
  port: 3050,
  database: '/data/old.fdb',
  user: 'SYSDBA',
  password: 'typed-already',
  pureRust: false,
  encryptionKey: 'key-typed-already',
  encryptionRequired: false,
  fbclientPath: '/old/path',
  charset: 'UTF8',
  embedded: true,
} as ConnectionForm;

describe('profileToForm', () => {
  it('takes every connection field from the profile', () => {
    expect(profileToForm(PROFILE)).toMatchObject({
      host: 'db.example.com',
      port: 3051,
      database: '/data/prod.fdb',
      user: 'APP',
      pureRust: true,
      encryptionRequired: true,
      fbclientPath: '/opt/fb/libfbclient.so',
      charset: 'WIN1250',
      embedded: false,
    });
  });

  it('leaves the secrets blank', () => {
    // A profile keeps its password in the keyring or the server's
    // store, never in the record. Carrying over whatever was in the
    // form would submit one database's credentials to another.
    const form = profileToForm(PROFILE);
    expect(form.password).toBe('');
    expect(form.encryptionKey).toBe('');
  });

  it('defaults the optional fields rather than leaving them undefined', () => {
    // `charset: undefined` reaches the driver as a missing charset and
    // the connection silently falls back; `''` is what the form's
    // "auto" state actually is.
    const bare = { ...PROFILE, fbclientPath: null, charset: null, embedded: null } as unknown as Profile;
    const form = profileToForm(bare);
    expect(form.fbclientPath).toBe('');
    expect(form.charset).toBe('UTF8');
    expect(form.embedded).toBe(false);
  });
});

describe('profileOntoForm', () => {
  it('overlays the profile’s connection details', () => {
    expect(profileOntoForm(CURRENT, PROFILE)).toMatchObject({
      host: 'db.example.com',
      port: 3051,
      database: '/data/prod.fdb',
      user: 'APP',
      pureRust: true,
      encryptionRequired: true,
    });
  });

  it('keeps secrets the user already typed', () => {
    // Quick-connect exists to be fast. Discarding a password the user
    // just typed would make it slower than the connect screen.
    const form = profileOntoForm(CURRENT, PROFILE);
    expect(form.password).toBe('typed-already');
    expect(form.encryptionKey).toBe('key-typed-already');
  });

  it('does not leave the previous profile’s driver settings behind', () => {
    // The subtle one. Overlaying only host/port/database/user would
    // connect to the new database with the old profile's charset,
    // client library and embedded flag — a combination the user never
    // configured and cannot see.
    const form = profileOntoForm(CURRENT, PROFILE);
    expect(form.fbclientPath).toBe('/opt/fb/libfbclient.so');
    expect(form.charset).toBe('WIN1250');
    expect(form.embedded).toBe(false);
  });
});
