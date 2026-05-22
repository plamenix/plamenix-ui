/**
 * Read-only DDL viewer.
 *
 * Surfaces `RDB$VIEW_SOURCE` / `RDB$PROCEDURE_SOURCE` /
 * `RDB$TRIGGER_SOURCE` text without forking into edit-and-apply
 * territory (that overlaps the deferred Object Editor UI). The body is
 * passed in pre-fetched by the host; the modal handles layout, copy,
 * "Open in Editor", and the close/loading/error chrome.
 */

import { useEffect, useState } from 'react';
import {
  Check,
  Clipboard,
  Code2,
  FileTerminal,
  Loader2,
  X,
  XCircle,
} from 'lucide-react';
import type { DdlSourceKind } from './schema-actions';

export interface DdlViewerModalProps {
  /** Kind of the object whose source is being shown. `null` collapses
   *  the modal to closed (controls visibility together with `name`). */
  kind: DdlSourceKind | null;
  /** Name of the object whose source is being shown. */
  name: string | null;
  /** Pre-fetched source text. `null` while loading or on error. */
  source: string | null;
  /** True while the host is fetching the source. */
  loading: boolean;
  /** Error message surfaced if the fetch failed. */
  error: string | null;
  /** Closes the modal. */
  onClose: () => void;
  /** Drops the source into a fresh editor tab. Host wires this to
   *  `newTab() + patchTab + setActive` so the user can reuse / edit
   *  the DDL elsewhere. */
  onOpenInEditor: (sql: string) => void;
}

const KIND_LABEL: Record<DdlSourceKind, string> = {
  view: 'VIEW',
  procedure: 'PROCEDURE',
  trigger: 'TRIGGER',
};

export function DdlViewerModal({
  kind,
  name,
  source,
  loading,
  error,
  onClose,
  onOpenInEditor,
}: DdlViewerModalProps) {
  const [copied, setCopied] = useState(false);
  const open = kind !== null && name !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open || !kind || !name) return null;

  const body = source ?? '';
  const handleCopy = () => {
    if (!body) return;
    void navigator.clipboard.writeText(body).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div
      role="dialog"
      aria-label="DDL viewer"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-[8vh] flex max-h-[84vh] w-[min(56rem,94vw)] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      >
        <header className="flex items-center gap-2 border-b border-edge bg-canvas px-3 py-2.5">
          <Code2 className="h-4 w-4 text-fg-subtle" />
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">
            {KIND_LABEL[kind]}
          </h2>
          <span className="font-mono text-[13px] font-semibold text-fg" title={name}>
            {name}
          </span>
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

        <div className="flex-1 overflow-y-auto bg-canvas">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-fg-subtle">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading source…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 px-4 py-3 text-[12px] text-danger">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-pre-wrap font-mono">{error}</span>
            </div>
          ) : body.trim().length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-fg-subtle">
              No source text recorded for this {kind}.
            </p>
          ) : (
            <pre className="m-0 whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12px] leading-relaxed text-fg">
              {body}
            </pre>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-edge bg-canvas px-3 py-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!body || loading}
            title={copied ? 'Copied!' : 'Copy DDL'}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
          >
            {copied ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Clipboard className="h-3 w-3" />
            )}
            {copied ? 'Copied' : 'Copy DDL'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!body) return;
              onOpenInEditor(body);
              onClose();
            }}
            disabled={!body || loading}
            title="Open this DDL in a new editor tab"
            className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            <FileTerminal className="h-3 w-3" />
            Open in Editor
          </button>
        </footer>
      </div>
    </div>
  );
}
