import { Loader2, Lock, LockOpen, ShieldAlert } from 'lucide-react';
import type { CryptState } from './types';

export interface CryptBadgeProps {
  /** The current encryption state, or `null` while it is being fetched. */
  state: CryptState | null;
}

/**
 * Renders the connected database's encryption state as an icon-led pill.
 *
 * Driven by `MON$DATABASE.MON$CRYPT_STATE`; the underlying values come
 * from the host's `db_crypt_state` (desktop) or `/api/crypt-state` (web).
 */
export function CryptBadge({ state }: CryptBadgeProps) {
  if (state === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking
      </span>
    );
  }

  const { label, tone, Icon } = describe(state);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}
      title={`Encryption state: ${label}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function describe(state: CryptState): {
  label: string;
  tone: string;
  Icon: typeof Lock;
} {
  switch (state) {
    case 'encrypted':
      return {
        label: 'Encrypted',
        tone: 'bg-success-subtle text-success ring-1 ring-success/20',
        Icon: Lock,
      };
    case 'unencrypted':
      return {
        label: 'Unencrypted',
        tone: 'bg-danger-subtle text-danger ring-1 ring-danger/20',
        Icon: LockOpen,
      };
    case 'encrypt_in_progress':
      return {
        label: 'Encrypting',
        tone: 'bg-warning-subtle text-warning ring-1 ring-warning/20',
        Icon: ShieldAlert,
      };
    case 'decrypt_in_progress':
      return {
        label: 'Decrypting',
        tone: 'bg-warning-subtle text-warning ring-1 ring-warning/20',
        Icon: ShieldAlert,
      };
  }
}
