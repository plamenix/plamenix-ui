/**
 * Stacked toast viewport. Renders pinned bottom-right; each toast
 * surfaces the mutation headline, SQL preview, a Copy button, an
 * "Open in Editor" button, and a dismiss X. The host wires
 * `onOpenInEditor` so the button can hand the SQL to a fresh tab
 * without coupling the toast to the tabs-store.
 */

import { useState } from 'react';
import { Check, Clipboard, FileTerminal, X } from 'lucide-react';
import { SqlHighlight } from '../db/SqlHighlight';
import { useToastStore, type Toast } from './toast-store';
import { copyText } from '../clipboard.js';

export interface ToastViewportProps {
  /** Called when the user clicks "Open in Editor" on a toast. The
   *  host typically spawns a new tab and pastes the SQL. */
  onOpenInEditor: (sql: string) => void;
}

export function ToastViewport({ onOpenInEditor }: ToastViewportProps) {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(28rem,95vw)] flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastCard
          key={t.id}
          toast={t}
          onDismiss={() => dismiss(t.id)}
          onOpenInEditor={onOpenInEditor}
        />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
  onOpenInEditor,
}: {
  toast: Toast;
  onDismiss: () => void;
  onOpenInEditor: (sql: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  // A notice has no statement behind it, so it gets neither the SQL
  // body nor the footer — "Open in Editor" on a copied column name
  // would open an editor holding an identifier and nothing else.
  if (toast.kind === 'notice') {
    return (
      <div className="pointer-events-auto overflow-hidden rounded-lg border border-edge bg-panel shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2 px-3 py-2">
          {toast.tone === 'success' ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-success" />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0 text-danger" />
          )}
          <span className="flex-1 truncate text-[11px] text-fg">{toast.title}</span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss toast"
            className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  const fullSql =
    toast.kind === 'mutation'
      ? toast.sql
      : toast.statements.map((s) => s.sql.replace(/;?\s*$/, ';')).join('\n\n');

  const handleCopy = () => {
    void copyText(fullSql);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="pointer-events-auto overflow-hidden rounded-lg border border-edge bg-panel shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
      <header className="flex items-center gap-2 border-b border-edge bg-canvas px-3 py-1.5">
        <FileTerminal className="h-3.5 w-3.5 text-accent" />
        <span className="flex-1 truncate text-[11px] font-medium uppercase tracking-wide text-fg">
          {toast.title}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss toast"
          className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
        >
          <X className="h-3 w-3" />
        </button>
      </header>
      <div className="max-h-32 overflow-y-auto px-1 py-1 text-[10px] text-fg-muted">
        <SqlHighlight value={fullSql} />
      </div>
      <footer className="flex items-center justify-end gap-1 border-t border-edge bg-canvas px-2 py-1">
        <button
          type="button"
          onClick={handleCopy}
          title={copied ? 'Copied!' : 'Copy SQL'}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Clipboard className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy SQL'}
        </button>
        <button
          type="button"
          onClick={() => {
            onOpenInEditor(fullSql);
            onDismiss();
          }}
          title="Open this SQL in a new editor tab"
          className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover"
        >
          <FileTerminal className="h-3 w-3" />
          Open in Editor
        </button>
      </footer>
    </div>
  );
}
