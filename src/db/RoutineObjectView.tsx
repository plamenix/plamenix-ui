/**
 * In-pane read-only DDL view for procedures, triggers, generators,
 * domains, and views surfaced from the schema browser.
 *
 * Mirrors {@link TableObjectView}'s header / close-button shape so the
 * routine display feels of-a-piece with the rich table inspector and
 * not like a stray modal layered on top of the workspace. Body is
 * pre-fetched by the host (for view / procedure / trigger sources) or
 * synthesised client-side (for generator / domain) and passed in as
 * `source`.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Clipboard,
  Code2,
  FileTerminal,
  Loader2,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { sql } from '@codemirror/lang-sql';
import { bracketMatching } from '@codemirror/language';
import { usePluginContributions } from '../plugin-react/usePluginContributions';
import {
  pickSqlFormatter,
  type SqlFormatterContributionPayload,
} from '../formatters/sql-formatter-contract';
import { resolveThemeMode, useThemeStore } from '../theme/theme-store';
import { sqlThemeFor } from './sql-theme';
import type { DdlSourceKind } from './schema-actions';
import { copyText } from '../clipboard.js';

export interface RoutineObjectViewProps {
  /** Kind of the object whose source is being shown. */
  kind: DdlSourceKind;
  /** Name of the object whose source is being shown. */
  name: string;
  /** Pre-fetched source text. `null` while loading or on error. */
  source: string | null;
  /** True while the host is fetching the source. */
  loading: boolean;
  /** Error message surfaced if the fetch failed. */
  error: string | null;
  /** Closes the routine view, returning the content pane to its
   *  query-editor + ad-hoc results default. */
  onClose: () => void;
  /** Drops the source into the current editor tab. Host wires this to
   *  the SQL-change callback so the user can reuse / edit the DDL. */
  onOpenInEditor: (sql: string) => void;
}

const KIND_LABEL: Record<DdlSourceKind, string> = {
  view: 'VIEW',
  procedure: 'PROCEDURE',
  trigger: 'TRIGGER',
  generator: 'GENERATOR',
  domain: 'DOMAIN',
};

export function RoutineObjectView({
  kind,
  name,
  source,
  loading,
  error,
  onClose,
  onOpenInEditor,
}: RoutineObjectViewProps) {
  const [copied, setCopied] = useState(false);
  const [formatted, setFormatted] = useState<string | null>(null);
  const formatterContributions =
    usePluginContributions<SqlFormatterContributionPayload>('sql_formatters');

  useEffect(() => {
    setFormatted(null);
    setCopied(false);
  }, [kind, name, source]);

  const rawBody = source ?? '';
  const body = formatted ?? rawBody;
  const formatter = pickSqlFormatter(formatterContributions, 'firebird');

  const handleFormat = () => {
    if (!formatter || rawBody.length === 0) return;
    setFormatted(formatter.format(rawBody));
  };
  const handleCopy = () => {
    if (!body) return;
    void copyText(body);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <section className="flex flex-1 flex-col overflow-hidden rounded-lg bg-panel">
      <header className="flex shrink-0 items-center gap-2 border-b border-edge bg-canvas px-3 py-2.5">
        <Code2 className="h-4 w-4 text-fg-subtle" />
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">
          {KIND_LABEL[kind]}
        </h2>
        <span className="font-mono text-[13px] font-semibold text-fg" title={name}>
          {name}
        </span>
        <span className="flex-1" />
        {formatter && (
          <button
            type="button"
            onClick={handleFormat}
            disabled={!rawBody || loading}
            title={
              formatted
                ? `Re-format via ${formatter.label}`
                : `Format via ${formatter.label}`
            }
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" />
            {formatted ? 'Re-format' : 'Format'}
          </button>
        )}
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
          }}
          disabled={!body || loading}
          title="Drop this DDL into the editor"
          className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-fg-inverted shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          <FileTerminal className="h-3 w-3" />
          Open in Editor
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close routine view"
          title="Close"
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
          <SqlSourceView body={body} />
        )}
      </div>
    </section>
  );
}

/** Read-only syntax-highlighted view backed by a tiny CodeMirror
 *  instance. Reuses the workspace SQL theme + grammar so colours match
 *  the main editor. Re-builds on body / theme-mode change; cheap because
 *  routine bodies are small. */
function SqlSourceView({ body }: { body: string }) {
  const themeMode = useThemeStore((s) => s.mode);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const resolved = resolveThemeMode(themeMode);
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: body,
        extensions: [
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          lineNumbers(),
          bracketMatching(),
          sql(),
          sqlThemeFor(resolved),
          EditorView.theme({
            '&': { backgroundColor: 'transparent' },
            '.cm-scroller': { fontFamily: 'inherit', fontSize: '12px' },
            '.cm-gutters': {
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--color-fg-subtle)',
            },
            '.cm-activeLineGutter': { backgroundColor: 'transparent' },
            '.cm-content': { padding: '8px 0' },
          }),
        ],
      }),
    });
    return () => view.destroy();
  }, [body, themeMode]);
  return <div ref={ref} className="h-full font-mono text-[12px]" />;
}
