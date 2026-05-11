import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { sql, SQLDialect } from '@codemirror/lang-sql';
import { bracketMatching, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { autocompletion } from '@codemirror/autocomplete';

export interface SqlEditorProps {
  /** Current SQL text. Controlled component — host owns the state. */
  value: string;
  /** Fired on every user edit. Not fired for programmatic updates
   *  driven by external `value` changes. */
  onChange: (value: string) => void;
  /** Disables editing while a request is in flight. */
  busy?: boolean;
}

/**
 * Firebird-flavoured SQL dialect for `@codemirror/lang-sql`.
 *
 * The upstream `lang-sql` package ships dialects for Postgres / MySQL /
 * MSSQL / SQLite / PLSQL but not Firebird. We define one here covering
 * Firebird 5's core keyword set — enough for syntax highlighting and
 * keyword completion. System tables (`RDB$*`, `MON$*`) and built-in
 * functions can grow into a richer completion source later.
 */
const firebirdDialect = SQLDialect.define({
  keywords:
    'select from where join inner left right outer full cross on group by having order asc desc ' +
    'limit offset fetch first skip rows union all distinct insert into values update set delete ' +
    'as and or not null true false case when then else end between in like is exists ' +
    'create alter drop table index view procedure function trigger domain sequence generator database ' +
    'returns returning execute block statement role grant revoke with recursive default ' +
    'primary key foreign references unique check constraint computed generated identity ' +
    'begin end commit rollback transaction',
  builtin:
    'current_timestamp current_date current_time current_user current_role user today now tomorrow yesterday ' +
    'count sum avg min max coalesce nullif iif decode cast extract substring trim upper lower ' +
    'char_length octet_length bit_length position overlay replace left right lpad rpad',
  types:
    'integer bigint smallint int128 numeric decimal float double precision boolean ' +
    'char varchar nchar nvarchar blob date time timestamp timestamp_with_time_zone time_with_time_zone',
  hashComments: false,
  slashComments: true,
  doubleQuotedStrings: false,
  unquotedBitLiterals: true,
});

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'rgb(24 24 27)',
    color: 'rgb(228 228 231)',
    fontSize: '13px',
    border: '1px solid rgb(63 63 70)',
    borderRadius: '4px',
  },
  '.cm-content': {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    caretColor: 'rgb(228 228 231)',
    minHeight: '120px',
  },
  '.cm-gutters': {
    backgroundColor: 'rgb(24 24 27)',
    color: 'rgb(113 113 122)',
    borderRight: '1px solid rgb(39 39 42)',
  },
  '.cm-activeLine': { backgroundColor: 'rgb(39 39 42 / 0.4)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgb(39 39 42 / 0.4)' },
  '.cm-cursor': { borderLeftColor: 'rgb(228 228 231)' },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgb(180 83 9 / 0.35) !important',
  },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, &.cm-focused ::selection': {
    backgroundColor: 'rgb(180 83 9 / 0.45) !important',
  },
});

/**
 * CodeMirror 6 SQL editor with Firebird-flavoured keyword highlighting
 * and completion. Replaces the previous `<textarea>` inside
 * {@link QueryPanel}; the surrounding API is unchanged so the host's
 * `sql` / `onSqlChange` plumbing stays the same.
 */
export function SqlEditor({ value, onChange, busy = false }: SqlEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        autocompletion(),
        sql({ dialect: firebirdDialect, upperCaseKeywords: true }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        editorTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor is built once; `value` updates flow through the second
    // effect below so we do not re-create the view on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.contentDOM.setAttribute('contenteditable', busy ? 'false' : 'true');
  }, [busy]);

  return <div ref={hostRef} className="overflow-hidden" />;
}
