import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Field } from './Field';
import type { ConnectionForm } from './types';

export interface ConnectionPanelProps {
  /** Current form values. Controlled component. */
  form: ConnectionForm;
  /** Disables inputs while a connect call is in flight. */
  busy: boolean;
  /** Field-level edit handler. */
  onChange: <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => void;
  /** Triggered when the Connect button is pressed. */
  onSubmit: () => void;
  /** Optional helper text rendered under the password field. Used by
   *  the desktop edition to flag "leave empty — keyring entry will be
   *  used" when the selected profile has a stored credential. */
  passwordHint?: string;
}

/**
 * Connection form used by both editions. Holds no transport logic; the
 * parent component calls into `Transport.invoke('db_connect', …)` (or
 * the web edition's equivalent) inside `onSubmit`.
 */
export function ConnectionPanel({
  form,
  busy,
  onChange,
  onSubmit,
  passwordHint,
}: ConnectionPanelProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showEncKey, setShowEncKey] = useState(false);
  return (
    <section className="grid grid-cols-2 gap-3 rounded border border-edge bg-panel p-4">
      <Field label="Host">
        <input
          className="input"
          value={form.host}
          onChange={(e) => onChange('host', e.target.value)}
        />
      </Field>
      <Field label="Port">
        <input
          className="input"
          type="number"
          value={form.port}
          onChange={(e) => onChange('port', Number(e.target.value))}
        />
      </Field>
      <Field label="Database" className="col-span-2">
        <input
          className="input"
          value={form.database}
          onChange={(e) => onChange('database', e.target.value)}
        />
      </Field>
      <Field label="User">
        <input
          className="input"
          value={form.user}
          onChange={(e) => onChange('user', e.target.value)}
        />
      </Field>
      <Field label="Password">
        <div className="relative">
          <input
            className="input pr-9"
            type={showPassword ? 'text' : 'password'}
            value={form.password}
            onChange={(e) => onChange('password', e.target.value)}
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
      </Field>
      <Field label="Encryption key (optional)" className="col-span-2">
        <div className="relative">
          <input
            className="input pr-9"
            type={showEncKey ? 'text' : 'password'}
            value={form.encryptionKey}
            onChange={(e) => onChange('encryptionKey', e.target.value)}
            placeholder="Leave empty for unencrypted databases"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowEncKey((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle transition-colors hover:text-fg-muted"
            aria-label={showEncKey ? 'Hide encryption key' : 'Show encryption key'}
          >
            {showEncKey ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </Field>
      <label className="col-span-2 flex items-center gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          checked={form.encryptionRequired}
          onChange={(e) => onChange('encryptionRequired', e.target.checked)}
        />
        Require encryption (refuse to connect if database is not encrypted)
      </label>
      <label className="col-span-2 flex items-center gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          checked={form.pureRust}
          onChange={(e) => onChange('pureRust', e.target.checked)}
        />
        Pure-Rust mode (no fbclient required)
      </label>
      <Field label="fbclient library (optional)" className="col-span-2">
        <input
          className="input disabled:opacity-50"
          value={form.fbclientPath}
          onChange={(e) => onChange('fbclientPath', e.target.value)}
          placeholder="/opt/firebird/lib/libfbclient.dylib"
          disabled={form.pureRust}
          spellCheck={false}
        />
      </Field>
      <button
        className="col-span-2 rounded bg-accent px-4 py-2 font-medium text-fg-inverted hover:bg-accent-hover disabled:opacity-50"
        disabled={busy}
        onClick={onSubmit}
      >
        {busy ? 'Connecting…' : 'Connect'}
      </button>
    </section>
  );
}
