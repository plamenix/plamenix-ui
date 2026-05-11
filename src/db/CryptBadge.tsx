import type { CryptState } from './types';

export interface CryptBadgeProps {
  /** The current encryption state, or `null` while it is being fetched. */
  state: CryptState | null;
}

/**
 * Renders the connected database's encryption state as a coloured pill.
 *
 * Driven by `MON$DATABASE.MON$CRYPT_STATE`; the underlying values come
 * from the host's `db_crypt_state` (desktop) or `/api/crypt-state` (web).
 */
export function CryptBadge({ state }: CryptBadgeProps) {
  if (state === null) {
    return (
      <span className="rounded bg-elevated px-2 py-0.5 text-[10px] text-fg-muted">
        checking…
      </span>
    );
  }

  const { label, tone } = describe(state);
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${tone}`}>{label}</span>
  );
}

function describe(state: CryptState): { label: string; tone: string } {
  switch (state) {
    case 'encrypted':
      return { label: 'Encrypted', tone: 'bg-success-subtle text-success' };
    case 'unencrypted':
      return { label: 'Unencrypted', tone: 'bg-danger-subtle text-danger' };
    case 'encrypt_in_progress':
      return { label: 'Encrypting…', tone: 'bg-warning-subtle text-warning' };
    case 'decrypt_in_progress':
      return { label: 'Decrypting…', tone: 'bg-warning-subtle text-warning' };
  }
}
