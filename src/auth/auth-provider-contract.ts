/**
 * Auth-provider contribution contract (I5.7).
 *
 * The `ConnectionScreen` historically rendered an inline Username +
 * Password form pair as the only authentication mechanism. This
 * contract abstracts the auth-collection surface so third-party
 * plugins can add alternate auth flows (Kerberos / GSS principal,
 * certificate + passphrase, AWS RDS IAM with session tokens, Azure
 * AD interactive, etc.) as additional tabs above the form section.
 *
 * Built-in `@plamenix-builtin/auth-provider-password` extracts the
 * legacy Username + Password block as a contribution — when no
 * third-party providers are installed the tab strip stays hidden
 * (single tab → no chrome) and the screen looks identical to the
 * pre-I5.7 layout.
 *
 * **Scope note for M1**: this section ships the contract + the UI
 * tabs + the built-in extraction. Third-party providers can register
 * a tab + FormComponent + `buildCredentials` today, but the
 * back-end handshake for non-password bundles (Kerberos cache
 * acquisition, certificate loading, IAM token exchange) lands in a
 * later section — `db_connect` currently only consumes the
 * `'password'` SecretBundle variant. Plugin authors can ship the UI
 * tab now; their connect path activates once the host's connection
 * dispatcher widens to consume their bundle kind.
 */

import type { ComponentType } from 'react';
import type { ConnectionForm } from '../db/types.js';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/** Credentials bundle handed to the host's connect/test dispatcher.
 *  Discriminated by `kind` so the back-end can route each bundle to
 *  the matching authentication mechanism. New kinds extend the union
 *  as third-party providers land. */
export type SecretBundle =
  | {
      kind: 'password';
      /** Database-level username (RDB$USER_NAME). */
      user: string;
      /** Plain-text password — never persisted, handed off in the
       *  connect call and cleared immediately. */
      password: string;
      /** Optional at-rest-encryption key for Firebird 3+ DbCrypt-
       *  protected databases. Empty string === no key. */
      encryptionKey?: string;
    }
  | {
      kind: 'kerberos';
      /** Principal name (`user@REALM`). */
      principal: string;
      /** Optional Kerberos credential-cache path; default uses
       *  `KRB5CCNAME` from the environment. */
      cache?: string;
    }
  | {
      kind: 'certificate';
      /** Absolute path to the PEM-encoded client certificate. */
      pemPath: string;
      /** Passphrase if the key file is encrypted. */
      passphrase?: string;
    }
  | {
      kind: 'iam-aws';
      /** AWS region the RDS instance lives in. */
      region: string;
      /** Optional STS session token for short-lived role credentials. */
      sessionToken?: string;
    };

/** Context handed to every provider's FormComponent. The built-in
 *  password provider uses the shell-managed form state (so the
 *  existing `host` / `port` / `database` etc. fields and the
 *  password value continue to flow through the same `ConnectionForm`
 *  state the host already manages). Third-party providers may
 *  optionally manage their own state inside the FormComponent and
 *  ignore the host-supplied form slice. */
export interface AuthProviderFormContext {
  /** Live `ConnectionForm` — the same shape passed to
   *  `ConnectionScreen` props. Mutate via `onChange`. */
  form: ConnectionForm;
  /** Patch a single field. Mirrors the existing onChange signature
   *  used elsewhere in the connection panel. */
  onChange: <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => void;
  /** True while the host is connecting / testing — providers should
   *  disable submission affordances when busy. */
  busy: boolean;
  /** Optional helper text the host wants rendered under the password
   *  / credential input (e.g. encryption-key reminder). Only the
   *  password provider reads it today. */
  passwordHint?: string;
}

export interface AuthProviderContributionPayload {
  /** Display label for the tab button (`'Password'`, `'Kerberos'`,
   *  `'Certificate'`, `'AWS IAM'`). */
  label: string;
  /** Optional Lucide-style icon. */
  icon?: ComponentType<{ className?: string }>;
  /** Form widgets rendered in place of the legacy Username/Password
   *  block. Receives the shell-supplied form context. */
  FormComponent: ComponentType<{ ctx: AuthProviderFormContext }>;
  /** Produces a `SecretBundle` from the current form state. Called
   *  by the host at submit / test time. */
  buildCredentials: (ctx: AuthProviderFormContext) => SecretBundle;
}

/** Resolved provider descriptor ready for the tab strip + dispatch. */
export interface AuthProviderDescriptor {
  /** `<pluginId>:<contributionId>` so two plugins claiming the same
   *  local id never collide. Used as the React key for the tab + the
   *  persisted "active provider" id. */
  id: string;
  pluginId: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  FormComponent: ComponentType<{ ctx: AuthProviderFormContext }>;
  buildCredentials: (ctx: AuthProviderFormContext) => SecretBundle;
}

/** Maps registry contributions into descriptor list. Registry
 *  priority order preserved (lower number = leftmost tab). */
export function pluginContributionsToAuthProviders(
  contributions: ReadonlyArray<PluginContribution<AuthProviderContributionPayload>>,
): AuthProviderDescriptor[] {
  const out: AuthProviderDescriptor[] = [];
  for (const { pluginId, contribution } of contributions) {
    const p = contribution.payload;
    const desc: AuthProviderDescriptor = {
      id: `${pluginId}:${contribution.id}`,
      pluginId,
      label: p.label,
      FormComponent: p.FormComponent,
      buildCredentials: p.buildCredentials,
    };
    if (p.icon !== undefined) desc.icon = p.icon;
    out.push(desc);
  }
  return out;
}
