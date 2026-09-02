/**
 * Built-in password auth provider (I5.7) — extracts the legacy
 * inline Username + Password block from `ConnectionScreen` into a
 * `auth_providers` contribution registered under
 * `@plamenix-builtin/auth-provider-password`.
 *
 * Visual + behaviour parity with the pre-I5.7 layout: same grid
 * (Username + Password side-by-side), same eye-toggle for password
 * visibility, same INPUT_CLASS / LABEL_CLASS skins, same
 * `passwordHint` text rendered under the password field when the
 * host supplies one.
 *
 * The component reads + writes through `ctx.form` + `ctx.onChange` so
 * the existing `ConnectionForm` state continues to flow through the
 * host's connect / test / save-profile callbacks unchanged.
 * `buildCredentials` packs the live form values into the
 * `'password'` SecretBundle variant.
 */

import { useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import type {
  AuthProviderContributionPayload,
  AuthProviderFormContext,
  SecretBundle,
} from '../auth-provider-contract.js';

const BUILTIN_NAME = 'auth-provider-password';

/** Tailwind chains pulled from ConnectionScreen's pre-I5.7 inline
 *  styles so the password provider's form pixel-matches the surface
 *  it replaces. */
const INPUT_CLASS =
  'w-full rounded-lg border border-edge bg-inset px-3 py-2 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';
const LABEL_CLASS =
  'mb-1 block text-[11px] font-medium uppercase tracking-wide text-fg-muted';

function PasswordFormComponent({ ctx }: { ctx: AuthProviderFormContext }) {
  const { form, onChange, busy, passwordHint } = ctx;
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="flex gap-3">
      <div className="flex-1">
        <label className={LABEL_CLASS}>Username</label>
        <input
          type="text"
          value={form.user}
          onChange={(e) => onChange('user', e.target.value)}
          className={INPUT_CLASS}
          required
          disabled={busy}
        />
      </div>
      <div className="flex-1">
        <label className={LABEL_CLASS}>Password</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={form.password}
            onChange={(e) => onChange('password', e.target.value)}
            className={`${INPUT_CLASS} pr-9`}
            disabled={busy}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle transition-colors hover:text-fg-muted"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        {passwordHint && (
          <p className="mt-1 text-[10px] text-fg-subtle">{passwordHint}</p>
        )}
      </div>
    </div>
  );
}

/** Packs the live ConnectionForm into a `'password'` SecretBundle.
 *  Encryption key only included when the user supplied a non-empty
 *  value — empty strings drop out so the bundle stays narrow. */
export function buildPasswordCredentials(ctx: AuthProviderFormContext): SecretBundle {
  const bundle: SecretBundle = {
    kind: 'password',
    user: ctx.form.user,
    password: ctx.form.password,
  };
  if (ctx.form.encryptionKey && ctx.form.encryptionKey.length > 0) {
    bundle.encryptionKey = ctx.form.encryptionKey;
  }
  return bundle;
}

const payload: AuthProviderContributionPayload = {
  label: 'Password',
  icon: KeyRound,
  FormComponent: PasswordFormComponent,
  buildCredentials: buildPasswordCredentials,
};

/**
 * Registers the built-in password auth provider. Returns a teardown
 * closure for `useEffect` pairing.
 *
 * Priority 200 → third-party auth providers at the default priority
 * 100 sort ahead of the built-in in the tab strip (community
 * providers surface left of the shell default — Kerberos / IAM /
 * cert tabs appear first when installed). When the password
 * provider is the only contribution registered, the tab strip stays
 * hidden and the form renders without any tab chrome (visual zero-
 * diff vs. the pre-I5.7 inline layout).
 */
export function registerBuiltinPasswordAuthProvider(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    auth_providers: [
      {
        id: 'password',
        priority: 200,
        payload,
      },
    ],
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

export function unregisterBuiltinPasswordAuthProvider(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
