export interface QueryPanelProps {
  /** Active session identifier (UUID string). */
  sessionId: string;
  /** Current SQL text. Controlled component. */
  sql: string;
  /** Disables controls while a request is in flight. */
  busy: boolean;
  onSqlChange: (value: string) => void;
  onExecute: () => void;
  onClose: () => void;
}

/**
 * SQL editor and execute/disconnect buttons. Used inside the main shell
 * once a session is open. The CodeMirror upgrade will replace the bare
 * `<textarea>` once it lands.
 */
export function QueryPanel({
  sessionId,
  sql,
  busy,
  onSqlChange,
  onExecute,
  onClose,
}: QueryPanelProps) {
  return (
    <section className="flex flex-col gap-3 rounded border border-zinc-800 p-4">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>
          session: <code className="font-mono text-zinc-200">{sessionId}</code>
        </span>
        <button
          className="rounded border border-zinc-700 px-3 py-1 text-zinc-300 hover:bg-zinc-800"
          onClick={onClose}
          disabled={busy}
        >
          Disconnect
        </button>
      </div>
      <textarea
        className="input min-h-[120px] font-mono text-sm"
        value={sql}
        onChange={(e) => onSqlChange(e.target.value)}
      />
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
