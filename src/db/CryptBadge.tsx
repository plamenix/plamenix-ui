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
      <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
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
      return { label: 'Encrypted', tone: 'bg-emerald-700/40 text-emerald-200' };
    case 'unencrypted':
      return { label: 'Unencrypted', tone: 'bg-red-800/40 text-red-200' };
    case 'encrypt_in_progress':
      return { label: 'Encrypting…', tone: 'bg-amber-700/40 text-amber-200' };
    case 'decrypt_in_progress':
      return { label: 'Decrypting…', tone: 'bg-amber-700/40 text-amber-200' };
  }
}
