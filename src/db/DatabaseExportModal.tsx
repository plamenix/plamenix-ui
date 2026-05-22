/**
 * Modal that orchestrates a full-database export. Format picker
 * (seeded from the user's `defaultExportFormat`), CSV delimiter
 * carry-over (seeded from `csvDelimiter`), progress label per
 * table, and a Run button that drives `runDatabaseExport`.
 *
 * The host wires `onFetchTable` to its transport (Tauri or fetch).
 */

import { useEffect, useState } from 'react';
import { DatabaseBackup, Loader2, X } from 'lucide-react';
import { runDatabaseExport, targetTables, type TableExportPart } from './database-export';
import { useDisplayStore, type CsvDelimiter, type ExportFormat } from './display-store';
import {
  defaultExportFilename,
  triggerBlobDownload,
  type StreamedCsvDelimiter,
  type StreamedExportRunner,
} from './streamed-export';
import type { Schema, TableInfo } from './types';

export interface DatabaseExportModalProps {
  open: boolean;
  schema: Schema | null;
  onClose: () => void;
  /** Runs `SELECT * FROM "<table>"` (or equivalent) against the
   *  active session and returns the result rows. Used by the
   *  client-side fallback path. Rejects with a user-visible message
   *  on failure. */
  onFetchTable: (table: TableInfo) => Promise<TableExportPart>;
  /** Optional server-streamed runner. When supplied, CSV / JSON /
   *  SQL / XML formats execute server-side and stream the output
   *  back as chunks. XLSX always stays client-side because it's a
   *  binary format generated from typed cells. */
  onStreamedExport?: StreamedExportRunner;
  /** Session id passed through to the streamed runner. Required when
   *  `onStreamedExport` is provided. */
  sessionId?: string;
}

const DELIM_KEY: Record<CsvDelimiter, StreamedCsvDelimiter> = {
  ',': 'comma',
  ';': 'semicolon',
  '\t': 'tab',
};

const FORMAT_OPTIONS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'csv', label: 'CSV', hint: 'One file, per-table markers' },
  { id: 'json', label: 'JSON', hint: 'Object keyed by table name' },
  { id: 'xlsx', label: 'XLSX', hint: 'One sheet per table' },
  { id: 'sql', label: 'SQL', hint: 'CREATE TABLE + INSERTs per table' },
  { id: 'xml', label: 'XML', hint: 'Nested <database><table><row>' },
];

const DELIM_OPTIONS: { id: CsvDelimiter; label: string }[] = [
  { id: ',', label: ',' },
  { id: ';', label: ';' },
  { id: '\t', label: 'TAB' },
];

export function DatabaseExportModal({
  open,
  schema,
  onClose,
  onFetchTable,
  onStreamedExport,
  sessionId,
}: DatabaseExportModalProps) {
  const storeFormat = useDisplayStore((s) => s.defaultExportFormat);
  const storeDelim = useDisplayStore((s) => s.csvDelimiter);
  const storeIncludeDdl = useDisplayStore((s) => s.exportIncludeDdl);
  const setStoreIncludeDdl = useDisplayStore((s) => s.setExportIncludeDdl);
  const [format, setFormat] = useState<ExportFormat>(storeFormat);
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(storeDelim);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    step: number;
    total: number;
    table: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Re-seed pickers each time the modal opens so a previous run's
  // tweaks don't bleed into the next session.
  useEffect(() => {
    if (open) {
      setFormat(storeFormat);
      setDelimiter(storeDelim);
      setProgress(null);
      setError(null);
      setDone(false);
    }
  }, [open, storeFormat, storeDelim]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const tables = schema ? targetTables(schema) : [];

  const useServer =
    onStreamedExport !== undefined && sessionId !== undefined && format !== 'xlsx';

  const handleRun = async () => {
    if (!schema || busy) return;
    setBusy(true);
    setError(null);
    setDone(false);
    setProgress({ step: 0, total: tables.length, table: useServer ? '' : '' });
    try {
      if (useServer && onStreamedExport && sessionId) {
        setProgress({
          step: 0,
          total: tables.length,
          table: '(server-side streaming)',
        });
        const result = await onStreamedExport({
          sessionId,
          format,
          csvDelimiter: DELIM_KEY[delimiter],
          scope: { kind: 'tables', tables },
          includeDdl: storeIncludeDdl,
        });
        const filename = result.suggestedFilename || defaultExportFilename(format, 'plamenix-database');
        triggerBlobDownload(result.blob, filename);
      } else {
        await runDatabaseExport({
          schema,
          format,
          csvDelimiter: delimiter,
          fetchTable: onFetchTable,
          onProgress: (p) => setProgress(p),
          includeDdl: storeIncludeDdl,
        });
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Export database"
      onClick={busy ? undefined : onClose}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-[8vh] flex w-[min(40rem,95vw)] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      >
        <header className="flex items-center gap-2 border-b border-edge bg-canvas px-3 py-2.5">
          <DatabaseBackup className="h-4 w-4 text-fg-subtle" />
          <h2 className="text-[13px] font-semibold text-fg">Export database</h2>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex flex-col gap-3 p-4">
          <section>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
              Tables in scope
            </p>
            <p className="text-xs text-fg-muted">
              {tables.length === 0
                ? 'No base tables in this database.'
                : `${tables.length} base ${tables.length === 1 ? 'table' : 'tables'} — views and system relations are skipped.`}
            </p>
          </section>

          <section>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
              Format
            </p>
            <div className="grid grid-cols-5 gap-1">
              {FORMAT_OPTIONS.map((opt) => {
                const active = opt.id === format;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormat(opt.id)}
                    disabled={busy}
                    title={opt.hint}
                    aria-pressed={active}
                    className={`rounded px-2 py-1 text-[11px] font-mono font-medium transition-colors ${
                      active
                        ? 'bg-accent text-fg-inverted shadow-sm'
                        : 'bg-canvas text-fg-muted hover:bg-elevated hover:text-fg'
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-fg-subtle">
              {FORMAT_OPTIONS.find((o) => o.id === format)?.hint}
            </p>
          </section>

          {format === 'sql' && (
            <section>
              <label
                className={`inline-flex items-center gap-2 text-xs text-fg-muted ${
                  busy ? 'opacity-50' : 'cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  checked={storeIncludeDdl}
                  onChange={(e) => setStoreIncludeDdl(e.target.checked)}
                  disabled={busy}
                  className="h-3.5 w-3.5 cursor-pointer accent-accent"
                />
                Include <span className="font-mono text-fg">CREATE TABLE</span> for each table
              </label>
              <p className="mt-1 text-[10px] text-fg-subtle">
                When off, the SQL export emits only{' '}
                <span className="font-mono">INSERT</span> statements.
              </p>
            </section>
          )}

          {format === 'csv' && (
            <section>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
                CSV delimiter
              </p>
              <div className="flex items-center gap-1 rounded-md border border-edge bg-canvas p-0.5 w-fit">
                {DELIM_OPTIONS.map((opt) => {
                  const active = opt.id === delimiter;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDelimiter(opt.id)}
                      disabled={busy}
                      aria-pressed={active}
                      className={`min-w-[2.25rem] rounded px-2 py-0.5 text-[11px] font-mono font-medium transition-colors ${
                        active
                          ? 'bg-accent text-fg-inverted shadow-sm'
                          : 'text-fg-muted hover:bg-elevated hover:text-fg'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {progress && (
            <section className="rounded-md border border-edge bg-inset px-3 py-2 text-xs text-fg-muted">
              {progress.table ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-accent" />
                  Fetching <span className="font-mono text-fg">{progress.table}</span>{' '}
                  ({progress.step} of {progress.total})
                </span>
              ) : (
                <span>
                  {progress.total === 0
                    ? 'Nothing to export.'
                    : `Writing output (${progress.total} ${progress.total === 1 ? 'table' : 'tables'})…`}
                </span>
              )}
            </section>
          )}

          {error && (
            <section className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger">
              {error}
            </section>
          )}

          {done && !error && (
            <section className="rounded-md border border-success/30 bg-success-subtle px-3 py-2 text-xs text-success">
              Export complete. Downloaded to your browser's default location.
            </section>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-edge bg-canvas px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-3 py-1 text-xs text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={busy || tables.length === 0 || schema === null}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1 text-xs font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <DatabaseBackup className="h-3 w-3" />
            )}
            {busy ? 'Exporting…' : 'Run export'}
          </button>
        </footer>
      </div>
    </div>
  );
}
