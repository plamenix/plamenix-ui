import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pluginContributionsToAuthProviders,
  type AuthProviderContributionPayload,
  type AuthProviderFormContext,
  type SecretBundle,
} from './auth-provider-contract.js';
import { registry, registerContributions } from '../plugin-react/registry.js';
import type { ConnectionForm } from '../db/types.js';

const NULL_FORM = () => null;

function descriptors() {
  return pluginContributionsToAuthProviders(
    registry.getContributions<AuthProviderContributionPayload>('auth_providers'),
  );
}

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

describe('pluginContributionsToAuthProviders (I5.7)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => registry.__reset());

  it('descriptor id namespaces by pluginId + contribution id', () => {
    registerContributions('com.example.ns', {
      auth_providers: [
        {
          id: 'foo',
          payload: {
            label: 'Foo',
            FormComponent: NULL_FORM,
            buildCredentials: () => ({ kind: 'password', user: '', password: '' }),
          } satisfies AuthProviderContributionPayload,
        },
      ],
    });
    const [d] = descriptors();
    expect(d?.id).toBe('com.example.ns:foo');
    expect(d?.pluginId).toBe('com.example.ns');
    expect(d?.label).toBe('Foo');
  });

  it('respects registry priority order (lower wins; appears leftmost)', () => {
    registerContributions('com.example.late', {
      auth_providers: [
        {
          id: 'late',
          priority: 300,
          payload: {
            label: 'Late',
            FormComponent: NULL_FORM,
            buildCredentials: () => ({ kind: 'password', user: '', password: '' }),
          },
        },
      ],
    });
    registerContributions('com.example.early', {
      auth_providers: [
        {
          id: 'early',
          priority: 50,
          payload: {
            label: 'Early',
            FormComponent: NULL_FORM,
            buildCredentials: () => ({ kind: 'password', user: '', password: '' }),
          },
        },
      ],
    });
    expect(descriptors().map((d) => d.label)).toEqual(['Early', 'Late']);
  });

  it('descriptor carries FormComponent + buildCredentials + icon through', () => {
    const icon = (() => null) as unknown as React.ComponentType<{ className?: string }>;
    const Body = () => null;
    const build = vi.fn(
      (): SecretBundle => ({ kind: 'kerberos', principal: 'user@REALM' }),
    );
    registerContributions('com.example.kerb', {
      auth_providers: [
        {
          id: 'kerberos',
          payload: {
            label: 'Kerberos',
            icon,
            FormComponent: Body,
            buildCredentials: build,
          },
        },
      ],
    });
    const [d] = descriptors();
    expect(d?.icon).toBe(icon);
    expect(d?.FormComponent).toBe(Body);
    const ctx: AuthProviderFormContext = { form: makeForm(), onChange: () => {}, busy: false };
    expect(d?.buildCredentials(ctx)).toEqual({ kind: 'kerberos', principal: 'user@REALM' });
    expect(build).toHaveBeenCalledWith(ctx);
  });

  it('returns empty array when no contributions registered', () => {
    expect(descriptors()).toEqual([]);
  });
});
