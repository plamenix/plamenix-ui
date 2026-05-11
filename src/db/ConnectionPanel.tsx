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
}

/**
 * Connection form used by both editions. Holds no transport logic; the
 * parent component calls into `Transport.invoke('db_connect', …)` (or
 * the web edition's equivalent) inside `onSubmit`.
 */
export function ConnectionPanel({ form, busy, onChange, onSubmit }: ConnectionPanelProps) {
  return (
    <section className="grid grid-cols-2 gap-3 rounded border border-zinc-800 p-4">
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
        <input
          className="input"
          type="password"
          value={form.password}
          onChange={(e) => onChange('password', e.target.value)}
        />
      </Field>
      <label className="col-span-2 flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={form.pureRust}
          onChange={(e) => onChange('pureRust', e.target.checked)}
        />
        Pure-Rust mode (no fbclient required)
      </label>
      <button
        className="col-span-2 rounded bg-amber-600 px-4 py-2 font-medium text-zinc-950 disabled:opacity-50"
        disabled={busy}
        onClick={onSubmit}
      >
        {busy ? 'Connecting…' : 'Connect'}
      </button>
    </section>
  );
}
