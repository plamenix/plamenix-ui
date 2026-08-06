/**
 * Full-page SQL editor.
 *
 * The compact editor that lives on top of every session view is great
 * for ad-hoc queries, but it competes for vertical space with the
 * welcome dashboard, focused-object panels, and result tables. The
 * Editor page promotes the SqlEditor to the dominant element so the
 * user can pour real queries in — with the active result set pinned
 * underneath at full width.
 */

import { ArrowLeft, Loader2, Play } from 'lucide-react';
import type { Schema } from './types';
import { SqlEditor } from './SqlEditor';
import { MultiResultView } from './MultiResultView';
import type { StatementOutcome, ColumnValue } from './types';

export interface SqlEditorPageProps {
  /** Current buffer content. Shares the active tab's `sql` so navigating
   *  back to the compact editor preserves what the user wrote. */
  sql: string;
  onSqlChange: (next: string) => void;
  /** Schema for autocomplete + identifier-tooltip wiring. `null` while
   *  disconnected. */
  schema: Schema | null;
  /** True while a batch is in flight. Disables the run button. */
  busy: boolean;
  /** Run handler. Receives the current buffer. */
  onExecute: (sql: string) => void;
  /** Editor bookmark slots. Same shape as in the compact editor. */
  bookmarks: Record<string, number>;
  onBookmarksChange: (next: Record<string, number>) => void;
  /** Most recent batch outcomes. `null` until something has been run. */
  results: StatementOutcome[] | null;
  schemaForResults: Schema | null;
  tabId: string;
  sessionId: string | null;
  columnWidths: Record<string, number>;
  onColumnWidthsChange: (next: Record<string, number>) => void;
  onCommitCellEdit: (sql: string) => Promise<void>;
  onApplyFilter: (sql: string) => Promise<void>;
  onFetchBlob: (blobId: string) => Promise<string>;
  onCountAllRows: (args: { table: string; predicate: string | null }) => Promise<number>;
  onFetchScopedRows: (args: {
    table: string;
    predicate: string | null;
  }) => Promise<{ cells: ColumnValue[] }[]>;
  /** Dismisses the page and returns the user to the prior view. */
  onClose: () => void;
}

export function SqlEditorPage({
  sql,
  onSqlChange,
  schema,
  busy,
  onExecute,
  bookmarks,
  onBookmarksChange,
  results,
  schemaForResults,
  tabId,
  sessionId,
  columnWidths,
  onColumnWidthsChange,
  onCommitCellEdit,
  onApplyFilter,
  onFetchBlob,
  onCountAllRows,
  onFetchScopedRows,
  onClose,
}: SqlEditorPageProps) {
  return (
    <main className="flex flex-1 flex-col gap-3 overflow-hidden px-6 pb-6 pt-2">
      <header className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to session
        </button>
        <h1 className="font-mono text-[12px] uppercase tracking-wide text-fg-subtle">
          SQL Editor
        </h1>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onExecute(sql)}
          disabled={busy || sql.trim().length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1 text-xs font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Run (⌘↵)
            </>
          )}
        </button>
      </header>

      <section className="flex min-h-[40vh] flex-1 flex-col overflow-hidden rounded-lg border border-edge bg-panel">
        <div className="flex flex-1 flex-col overflow-hidden [&_.cm-editor]:flex-1 [&_.cm-editor]:h-full [&_.cm-scroller]:h-full">
          <SqlEditor
            value={sql}
            onChange={onSqlChange}
            busy={busy}
            onSubmit={() => onExecute(sql)}
            schema={schema}
            bookmarks={bookmarks}
            onBookmarksChange={onBookmarksChange}
          />
        </div>
      </section>

      {results && results.length > 0 && (
        <section className="flex h-[40vh] shrink-0 flex-col overflow-hidden rounded-lg border border-edge bg-panel">
          <MultiResultView
            tabId={tabId}
            sessionId={sessionId}
            outcomes={results}
            schema={schemaForResults}
            onCommitCellEdit={onCommitCellEdit}
            onApplyFilter={onApplyFilter}
            columnWidths={columnWidths}
            onColumnWidthsChange={onColumnWidthsChange}
            onFetchBlob={onFetchBlob}
            onCountAllRows={onCountAllRows}
            onFetchScopedRows={onFetchScopedRows}
          />
        </section>
      )}
    </main>
  );
}
