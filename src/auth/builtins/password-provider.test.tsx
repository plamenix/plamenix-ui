// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  buildPasswordCredentials,
  registerBuiltinPasswordAuthProvider,
  unregisterBuiltinPasswordAuthProvider,
} from './password-provider.js';
import {
  pluginContributionsToAuthProviders,
  type AuthProviderContributionPayload,
  type AuthProviderFormContext,
} from '../auth-provider-contract.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry } from '../../plugin-react/registry.js';
import type { ConnectionForm } from '../../db/types.js';

function makeForm(overrides: Partial<ConnectionForm> = {}): ConnectionForm {
  return {
    host: 'localhost',
    port: 3050,
    database: '/tmp/test.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    pureRust: false,
    encryptionKey: '',
    encryptionRequired: false,
    fbclientPath: '',
    charset: 'UTF8',
    ...overrides,
  };
}

function descriptors() {
  return pluginContributionsToAuthProviders(
    registry.getContributions<AuthProviderContributionPayload>('auth_providers'),
  );
}

describe('buildPasswordCredentials (I5.7)', () => {
  it('packs the live form into a password SecretBundle', () => {
    const ctx: AuthProviderFormContext = {
      form: makeForm({ user: 'ALICE', password: 's3cret' }),
      onChange: () => {},
      busy: false,
    };
    expect(buildPasswordCredentials(ctx)).toEqual({
      kind: 'password',
      user: 'ALICE',
      password: 's3cret',
    });
  });

  it('includes encryptionKey only when non-empty', () => {
    const withKey: AuthProviderFormContext = {
      form: makeForm({ encryptionKey: 'k1' }),
      onChange: () => {},
      busy: false,
    };
    expect(buildPasswordCredentials(withKey)).toEqual({
      kind: 'password',
      user: 'SYSDBA',
      password: 'masterkey',
      encryptionKey: 'k1',
    });
    const noKey: AuthProviderFormContext = {
      form: makeForm({ encryptionKey: '' }),
      onChange: () => {},
      busy: false,
    };
    expect('encryptionKey' in buildPasswordCredentials(noKey)).toBe(false);
  });
});

describe('builtin password auth provider (I5.7)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => {
    cleanup();
    unregisterBuiltinPasswordAuthProvider();
    registry.__reset();
  });

  it('registers under the built-in namespace at priority 200', () => {
    registerBuiltinPasswordAuthProvider();
    const contributions = registry.getContributions('auth_providers');
    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.pluginId).toBe('@plamenix-builtin/auth-provider-password');
    expect(isBuiltinPlugin(contributions[0]?.pluginId ?? '')).toBe(true);
    expect(contributions[0]?.contribution.id).toBe('password');
    expect(contributions[0]?.contribution.priority).toBe(200);
  });

  it('descriptor label is "Password" with an icon', () => {
    registerBuiltinPasswordAuthProvider();
    const [d] = descriptors();
    expect(d?.label).toBe('Password');
    expect(d?.icon).toBeDefined();
  });

  it('FormComponent renders Username + Password inputs bound to ctx.form', () => {
    registerBuiltinPasswordAuthProvider();
    const [d] = descriptors();
    const ctx: AuthProviderFormContext = {
      form: makeForm({ user: 'ALICE', password: 'pw' }),
      onChange: () => {},
      busy: false,
    };
    const Comp = d!.FormComponent;
    render(<Comp ctx={ctx} />);
    expect((screen.getByDisplayValue('ALICE') as HTMLInputElement).type).toBe('text');
    expect((screen.getByDisplayValue('pw') as HTMLInputElement).type).toBe('password');
  });

  it('onChange fires when user types into username field', () => {
    registerBuiltinPasswordAuthProvider();
    const [d] = descriptors();
    const onChange = vi.fn();
    const ctx: AuthProviderFormContext = {
      form: makeForm({ user: 'A' }),
      onChange,
      busy: false,
    };
    const Comp = d!.FormComponent;
    render(<Comp ctx={ctx} />);
    const input = screen.getByDisplayValue('A') as HTMLInputElement;
    // Simulate input change via the React change event jsdom understands.
    const native = input.ownerDocument.defaultView!.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(native, 'value')!.set!;
    setter.call(input, 'AB');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('user', 'AB');
  });

  it('passwordHint renders under the password field when supplied', () => {
    registerBuiltinPasswordAuthProvider();
    const [d] = descriptors();
    const ctx: AuthProviderFormContext = {
      form: makeForm(),
      onChange: () => {},
      busy: false,
      passwordHint: 'Use the SYSDBA default for local databases.',
    };
    const Comp = d!.FormComponent;
    render(<Comp ctx={ctx} />);
    expect(
      screen.getByText('Use the SYSDBA default for local databases.'),
    ).toBeDefined();
  });

  it('disables both inputs when ctx.busy is true', () => {
    registerBuiltinPasswordAuthProvider();
    const [d] = descriptors();
    const ctx: AuthProviderFormContext = {
      form: makeForm({ user: 'A', password: 'p' }),
      onChange: () => {},
      busy: true,
    };
    const Comp = d!.FormComponent;
    render(<Comp ctx={ctx} />);
    expect((screen.getByDisplayValue('A') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByDisplayValue('p') as HTMLInputElement).disabled).toBe(true);
  });

  it('teardown unregisters cleanly + re-register works', () => {
    const teardown = registerBuiltinPasswordAuthProvider();
    teardown();
    expect(registry.getContributions('auth_providers')).toHaveLength(0);
    expect(() => registerBuiltinPasswordAuthProvider()).not.toThrow();
    expect(registry.getContributions('auth_providers')).toHaveLength(1);
  });
});
