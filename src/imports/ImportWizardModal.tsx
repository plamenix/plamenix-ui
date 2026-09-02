/**
 * Import wizard modal (I5.14). Hosts the `import_sources` registry —
 * renders tab-strip of registered providers, the active provider's
 * FormComponent, a target-table input, and a submit button that pipes
 * the provider's `importRows(args)` AsyncIterable through the
 * host-supplied `onSubmit(rows, target)` callback.
 *
 * The modal is host-opt-in: the wiring (a button on the QueryPanel
 * toolbar or TabStrip that opens it, plus the INSERT-execution
 * pipeline that consumes the AsyncIterable) lands when the shell
 * picks an integration point. The contract + modal + CSV built-in
 * ship today so third-party plugins can register import sources
 * immediately.
 */

import { useEffect, useMemo, useState } from 'react';
import { Database, Loader2, X } from 'lucide-react';
import { usePluginContributions } from '../plugin-react/usePluginContributions';
import {
  pluginContributionsToImportSources,
  type ImportContext,
  type ImportSourceContributionPayload,
  type ImportSourceFormProps,
} from './import-source-contract';
import type { Row, Schema } from '../db/types';

export interface ImportWizardModalProps {
  /** When `false`, the modal collapses to hidden. */
  open: boolean;
  /** Closes the modal. */
  onClose: () => void;
  /** Active session id (passed through to providers via ImportContext). */
  sessionId: string | null;
  /** Whole-database schema for the target-table dropdown + provider
   *  context. Pass `null` while still fetching. */
  schema: Schema | null;
  /** Fired when the user clicks Import with a valid target. The host
   *  consumes the AsyncIterable + runs INSERTs through its existing
   *  query pipeline. Should `await` the iterable to completion before
   *  closing the modal. */
  onSubmit: (rows: AsyncIterable<Row>, targetTable: string) => Promise<void>;
}

export function ImportWizardModal({
  open,
  onClose,
  sessionId,
  schema,
  onSubmit,
}: ImportWizardModalProps) {
  // Built-in CSV importer registers once per modal lifetime — single
  // wizard per shell today, double-mount would throw at the registry.

  const sourceContributions =
    usePluginContributions<ImportSourceContributionPayload>('import_sources');
  const sources = useMemo(
    () => pluginContributionsToImportSources(sourceContributions),
    [sourceContributions],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const resolvedId =
    activeId && sources.some((s) => s.id === activeId) ? activeId : sources[0]?.id ?? null;
  const active = sources.find((s) => s.id === resolvedId) ?? null;

  /** Per-source form state map — keyed by descriptor id so switching
   *  tabs preserves each tab's draft. Initialised lazily on first
   *  tab activation. */
  const [formStates, setFormStates] = useState<Record<string, unknown>>({});
  const activeState =
    active && formStates[active.id] !== undefined
      ? formStates[active.id]
      : active?.initialState;

  const [targetTable, setTargetTable] = useState('');
  const [progress, setProgress] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setProgress(0);
      setBusy(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const ctx: ImportContext = {
    sessionId,
    schema,
    onProgress: (count) => setProgress(count),
  };

  const handleSubmit = async () => {
    if (!active || busy || targetTable.trim().length === 0) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const rows = active.importRows({ state: activeState, ctx });
      await onSubmit(rows, targetTable.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const tableNames = schema?.tables.map((t) => t.name) ?? [];

  return (
    <div
      role="dialog"
      aria-label="Import wizard"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-[10vh] flex max-h-[80vh] w-[min(36rem,94vw)] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      >
        <header className="flex items-center gap-2 border-b border-edge bg-canvas px-4 py-3">
          <Database className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-fg">Import data</h2>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        {sources.length === 0 ? (
          <div className="p-8 text-center text-xs text-fg-subtle">
            No import sources registered.
          </div>
        ) : (
          <>
            {sources.length > 1 && (
              <div
                role="tablist"
                aria-label="Import source"
                className="flex items-center gap-1 border-b border-edge px-3"
              >
                {sources.map((s) => {
                  const isActive = s.id === resolvedId;
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveId(s.id)}
                      className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                        isActive
                          ? 'border-accent text-accent'
                          : 'border-transparent text-fg-muted hover:text-fg'
                      }`}
                    >
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {active && (
                <ActiveFormHost
                  active={active}
                  state={activeState}
                  setState={(next) =>
                    setFormStates((prev) => ({ ...prev, [active.id]: next }))
                  }
                  ctx={ctx}
                />
              )}

              <div className="mt-4">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-fg-muted">
                  Target table
                </label>
                <input
                  type="text"
                  list="plamenix-import-target-tables"
                  value={targetTable}
                  onChange={(e) => setTargetTable(e.target.value)}
                  placeholder="CUSTOMERS"
                  className="w-full rounded-lg border border-edge bg-inset px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                <datalist id="plamenix-import-target-tables">
                  {tableNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>

              {error && (
                <div className="mt-3 rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-[11px] text-danger">
                  Import failed: {error}
                </div>
              )}

              {busy && progress > 0 && (
                <div className="mt-3 text-[11px] text-fg-subtle">
                  Imported {progress.toLocaleString()} row{progress === 1 ? '' : 's'}…
                </div>
              )}
            </div>

            <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-edge bg-canvas px-4 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  busy ||
                  !active ||
                  targetTable.trim().length === 0 ||
                  sessionId === null
                }
                className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                Import
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

/** Thin wrapper so we can pass `state` + `setState` to the active
 *  source's FormComponent through a stable identity (the host's
 *  FormComponent might be type-narrowed beyond `unknown`). */
function ActiveFormHost({
  active,
  state,
  setState,
  ctx,
}: {
  active: { FormComponent: React.ComponentType<ImportSourceFormProps<unknown>> };
  state: unknown;
  setState: (next: unknown) => void;
  ctx: ImportContext;
}) {
  const Form = active.FormComponent;
  return <Form state={state} setState={setState} ctx={ctx} />;
}
