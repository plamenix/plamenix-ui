import { CryptBadge } from './CryptBadge';
import { SqlEditor } from './SqlEditor';
import type { CryptState } from './types';

export interface QueryPanelProps {
  /** Active session identifier (UUID string). */
  sessionId: string;
  /** Current SQL text. Controlled component. */
  sql: string;
  /** Disables controls while a request is in flight. */
  busy: boolean;
  /** Encryption state of the attached database, or `null` while it is
   *  being fetched. Pass `undefined` to suppress the badge entirely. */
  cryptState?: CryptState | null;
  onSqlChange: (value: string) => void;
  onExecute: () => void;
  onClose: () => void;
}

/**
 * SQL editor and execute/disconnect buttons. Used inside the main shell
 * once a session is open. The CodeMirror 6 editor lives in
 * {@link SqlEditor}; this panel only owns the surrounding chrome.
 */
export function QueryPanel({
  sessionId,
  sql,
  busy,
  cryptState,
  onSqlChange,
  onExecute,
  onClose,
}: QueryPanelProps) {
  return (
    <section className="flex flex-col gap-3 rounded border border-edge bg-panel p-4">
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span className="flex items-center gap-2">
          <span>
            session: <code className="font-mono text-fg">{sessionId}</code>
          </span>
          {cryptState !== undefined && <CryptBadge state={cryptState} />}
        </span>
        <button
          className="rounded border border-edge px-3 py-1 text-fg-muted hover:bg-elevated"
          onClick={onClose}
          disabled={busy}
        >
          Disconnect
        </button>
      </div>
      <SqlEditor value={sql} onChange={onSqlChange} busy={busy} />
      <button
        className="self-start rounded bg-accent px-4 py-2 font-medium text-fg-inverted hover:bg-accent-hover disabled:opacity-50"
        disabled={busy}
        onClick={onExecute}
      >
        {busy ? 'Executing…' : 'Execute'}
      </button>
    </section>
  );
}
