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
    <section className="flex flex-col gap-3 rounded border border-zinc-800 p-4">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span className="flex items-center gap-2">
          <span>
            session: <code className="font-mono text-zinc-200">{sessionId}</code>
          </span>
          {cryptState !== undefined && <CryptBadge state={cryptState} />}
        </span>
        <button
          className="rounded border border-zinc-700 px-3 py-1 text-zinc-300 hover:bg-zinc-800"
          onClick={onClose}
          disabled={busy}
        >
          Disconnect
        </button>
      </div>
      <SqlEditor value={sql} onChange={onSqlChange} busy={busy} />
      <button
        className="self-start rounded bg-amber-600 px-4 py-2 font-medium text-zinc-950 disabled:opacity-50"
        disabled={busy}
        onClick={onExecute}
      >
        {busy ? 'Executing…' : 'Execute'}
      </button>
    </section>
  );
}
