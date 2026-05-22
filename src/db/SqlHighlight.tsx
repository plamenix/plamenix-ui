/**
 * Read-only colorised SQL block.
 *
 * Mounts a tiny CodeMirror view sharing the same Firebird dialect +
 * theme as the editor, with all interactive pieces stripped out — no
 * gutters, no active-line highlight, no caret, no key bindings, no
 * autocompletion. Used to replace plain `<pre>` SQL blocks in surfaces
 * that want syntax colour but never edit: toast SQL previews, recent-
 * query snippets, history-row hover popovers.
 */

import { useEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { sql } from '@codemirror/lang-sql';
import { useResolvedThemeMode } from '../theme/theme-store';
import { firebirdDialect } from './firebird-dialect';
import { sqlThemeFor } from './sql-theme';

export interface SqlHighlightProps {
  /** SQL text to render. Re-renders dispatch a single replace
   *  transaction; the view itself is reused so unrelated re-renders
   *  do not thrash CodeMirror. */
  value: string;
  /** Optional class hook for the wrapper `<div>`. Use to set
   *  `max-height`, padding, or border per surface. The component
   *  always sets `font-family: monospace`-stack via the CM theme. */
  className?: string;
  /** Optional title forwarded to the wrapper. */
  title?: string;
}

const baseTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent' },
  '.cm-content': {
    padding: '6px 8px',
    caretColor: 'transparent',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  '.cm-line': { padding: 0 },
  '.cm-cursor, .cm-dropCursor': { display: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-gutters': { display: 'none' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--color-accent-subtle)',
  },
});

/** Read-only SQL block. Selectable for copy; no caret, no gutter. */
export function SqlHighlight({ value, className, title }: SqlHighlightProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const themeMode = useResolvedThemeMode();

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
        EditorView.lineWrapping,
        sql({ dialect: firebirdDialect, upperCaseKeywords: true }),
        themeCompartment.current.of(sqlThemeFor(themeMode)),
        baseTheme,
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The view is constructed once. Subsequent prop changes flow
    // through the dedicated effects below so we never rebuild it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.current.reconfigure(sqlThemeFor(themeMode)),
    });
  }, [themeMode]);

  return <div ref={hostRef} className={className} title={title} />;
}
