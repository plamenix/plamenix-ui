import { useEffect, useRef } from 'react';
import {
  Compartment,
  EditorState,
  RangeSet,
  StateEffect,
  StateField,
} from '@codemirror/state';
import {
  EditorView,
  GutterMarker,
  gutter,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { sql } from '@codemirror/lang-sql';
import { bracketMatching } from '@codemirror/language';
import { autocompletion } from '@codemirror/autocomplete';
import {
  linter,
  lintGutter,
  type Diagnostic as CmDiagnostic,
} from '@codemirror/lint';
import { resolveThemeMode, useThemeStore } from '../theme/theme-store';
import { sqlThemeFor } from './sql-theme';
import { useEditorStore, type EditorFontSize } from './editor-store';
import { firebirdDialect, firebirdSchemaFor } from './firebird-dialect';
import { usePluginContributions } from '../plugin-react/usePluginContributions';
import {
  pluginContributionsToCompletionProviders,
  runApplicableCompletionProviders,
  type CompletionProviderContributionPayload,
  type CompletionProviderDescriptor,
} from '../completions/completion-provider-contract';
import { registerBuiltinFirebirdKeywordsCompletion } from '../completions/builtins/firebird-keywords';
import {
  lineColToOffset,
  pluginContributionsToDiagnosticProviders,
  runDiagnosticProviders,
  type DiagnosticProviderContributionPayload,
  type DiagnosticProviderDescriptor,
} from '../diagnostics/diagnostic-provider-contract';
import { registerBuiltinBasicSyntaxDiagnostic } from '../diagnostics/builtins/basic-syntax';
import type { Schema } from './types';

/** Theme extension that sets the font size for the content + gutters
 *  in one pass. Kept here so the SqlEditor compartment can reconfigure
 *  it cheaply on store updates. */
function fontSizeTheme(size: EditorFontSize) {
  return EditorView.theme({
    '.cm-content': { fontSize: `${size}px` },
    '.cm-gutters': { fontSize: `${size}px` },
  });
}

/** Map of bookmark slot (`'0'`..`'9'`) to document offset. */
export type BookmarkMap = Record<string, number>;

export interface SqlEditorProps {
  /** Current SQL text. Controlled component — host owns the state. */
  value: string;
  /** Fired on every user edit. Not fired for programmatic updates
   *  driven by external `value` changes. */
  onChange: (value: string) => void;
  /** Disables editing while a request is in flight. */
  busy?: boolean;
  /** Optional Mod-Enter (⌘/Ctrl + Return) handler. When provided the
   *  editor binds the shortcut so users can execute without leaving the
   *  keyboard. Suppressed while `busy`. */
  onSubmit?: () => void;
  /** Schema feed for identifier completion. When supplied, tables /
   *  views surface their columns through dot-completion and procedure /
   *  generator / domain names join the top-level identifier list. */
  schema?: Schema | null;
  /** Bookmark slots persisted by the host (typically one map per tab).
   *  The editor owns live positions internally and bubbles updates
   *  through `onBookmarksChange`; this prop only seeds the initial map
   *  and resets the slots when its identity changes (e.g. tab switch). */
  bookmarks?: BookmarkMap | undefined;
  /** Notifies the host when bookmark slots change — adds, jumps that
   *  fall off the edited region, or doc-edit position remaps. The
   *  argument is the new authoritative map; do not merge with stale
   *  copies. */
  onBookmarksChange?: ((next: BookmarkMap) => void) | undefined;
  /** Fires when the editor's DOM root gains focus. Threaded through
   *  to the host so `editor/focused` events (I6.11) can emit with
   *  the active tab id. */
  onFocus?: (() => void) | undefined;
  /** Fires when the editor's selection changes (caret move, marquee,
   *  keyboard selection). Threaded through to the host so
   *  `editor/selection-changed` events (I6.11) can emit. `anchor` is
   *  the side the user clicked first; `head` is where the cursor
   *  sits — equal when the selection is empty (cursor-only). */
  onSelectionChange?: ((sel: { anchor: number; head: number }) => void) | undefined;
}

/** Builds the `sql({...})` extension for the current schema. Re-built
 *  through the Compartment whenever the host passes a new schema so
 *  completion stays in sync without rebuilding the whole editor. */
function buildSqlExtension(schema: Schema | null) {
  return sql({
    dialect: firebirdDialect,
    upperCaseKeywords: true,
    schema: firebirdSchemaFor(schema),
  });
}

/** Effect that replaces the entire bookmark map. The field listens for
 *  this in its update fn; document edits without the effect remap each
 *  existing offset through `tr.changes.mapPos`. */
const setBookmarksEffect = StateEffect.define<BookmarkMap>();

function bookmarksEqual(a: BookmarkMap, b: BookmarkMap): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

/** Live bookmark positions. Doc edits remap offsets through
 *  `tr.changes.mapPos`; setting/jumping/replacing happens via the
 *  `setBookmarksEffect` above. */
const bookmarksField = StateField.define<BookmarkMap>({
  create: () => ({}),
  update(value, tr) {
    let next: BookmarkMap | null = null;
    for (const eff of tr.effects) {
      if (eff.is(setBookmarksEffect)) next = eff.value;
    }
    if (next !== null) return next;
    if (!tr.docChanged) return value;
    const remapped: BookmarkMap = {};
    for (const [slot, pos] of Object.entries(value)) {
      remapped[slot] = tr.changes.mapPos(pos);
    }
    return remapped;
  },
});

/** Gutter marker rendering the digit for a bookmark slot. */
class BookmarkGutterMarker extends GutterMarker {
  constructor(private slot: string) {
    super();
  }
  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-bookmark-marker';
    el.textContent = this.slot;
    return el;
  }
}

/** Bookmark gutter — one digit per bookmarked line. */
const bookmarkGutter = gutter({
  class: 'cm-bookmark-gutter',
  markers(view) {
    const map = view.state.field(bookmarksField);
    const entries = Object.entries(map);
    if (entries.length === 0) return RangeSet.empty;
    const ranges = entries
      .map(([slot, pos]) => {
        const safe = Math.min(pos, view.state.doc.length);
        const line = view.state.doc.lineAt(safe);
        return new BookmarkGutterMarker(slot).range(line.from);
      })
      .sort((a, b) => a.from - b.from);
    return RangeSet.of(ranges, true);
  },
});

/** Theme rules for the bookmark gutter. Plain CSS picks up the token
 *  variables already declared in the app's theme.css. */
const bookmarkGutterTheme = EditorView.baseTheme({
  '.cm-bookmark-gutter': {
    width: '1.25em',
    padding: '0 2px',
    textAlign: 'center',
  },
  '.cm-bookmark-marker': {
    display: 'inline-block',
    minWidth: '1em',
    fontSize: '10px',
    fontWeight: '600',
    lineHeight: '1.2',
    color: 'var(--color-fg-inverted)',
    backgroundColor: 'var(--color-accent)',
    borderRadius: '3px',
  },
});

/** Builds the `Mod-Shift-N` (set) + `Mod-N` (jump) keymap entries. The
 *  set handler captures the current selection head; the jump handler
 *  clamps the stored offset to the current document length so a
 *  bookmark on a deleted region still lands somewhere sensible. */
function bookmarkKeymap() {
  return Array.from({ length: 10 }).flatMap((_, n) => {
    const slot = String(n);
    return [
      {
        key: `Mod-Shift-${slot}`,
        preventDefault: true,
        run: (view: EditorView) => {
          const head = view.state.selection.main.head;
          const current = view.state.field(bookmarksField);
          let next: BookmarkMap;
          if (current[slot] === head) {
            next = { ...current };
            delete next[slot];
          } else {
            next = { ...current, [slot]: head };
          }
          view.dispatch({ effects: setBookmarksEffect.of(next) });
          return true;
        },
      },
      {
        key: `Mod-${slot}`,
        preventDefault: true,
        run: (view: EditorView) => {
          const map = view.state.field(bookmarksField);
          const pos = map[slot];
          if (pos === undefined) return true;
          const clamped = Math.min(pos, view.state.doc.length);
          view.dispatch({
            selection: { anchor: clamped },
            scrollIntoView: true,
          });
          view.focus();
          return true;
        },
      },
    ];
  });
}

/** DOM event handlers that wire the schema-browser drag source to the
 *  editor's drop surface. The drag payload is the bare identifier
 *  (table, `table.column`, procedure, …); we insert it at the position
 *  derived from `view.posAtCoords` and move the caret to the end of
 *  the inserted text so the user can keep typing. */
const dropHandlers = EditorView.domEventHandlers({
  dragover(event) {
    if (event.dataTransfer?.types.includes('text/plain')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  },
  drop(event, view) {
    const text = event.dataTransfer?.getData('text/plain');
    if (!text) return false;
    event.preventDefault();
    const pos =
      view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
      view.state.selection.main.head;
    const before = pos > 0 ? view.state.doc.sliceString(pos - 1, pos) : '';
    const after = view.state.doc.sliceString(pos, pos + 1);
    const needsLeading = before !== '' && !/\s/.test(before);
    const needsTrailing = after !== '' && !/\s/.test(after);
    const insert = `${needsLeading ? ' ' : ''}${text}${needsTrailing ? ' ' : ''}`;
    const cursor = pos + insert.length;
    view.dispatch({
      changes: { from: pos, insert },
      selection: { anchor: cursor },
    });
    view.focus();
    return true;
  },
});

/**
 * CodeMirror 6 SQL editor with Firebird-flavoured keyword highlighting,
 * autocompletion, and a JetBrains-inspired theme (Darcula in dark mode,
 * IntelliJ in light mode). The theme rebinds at runtime whenever the
 * `mode` field of {@link useThemeStore} flips.
 */
export function SqlEditor({
  value,
  onChange,
  busy = false,
  onSubmit,
  schema = null,
  bookmarks,
  onBookmarksChange,
  onFocus,
  onSelectionChange,
}: SqlEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const sqlCompartment = useRef(new Compartment());
  const lineNumbersCompartment = useRef(new Compartment());
  const lineWrapCompartment = useRef(new Compartment());
  const fontSizeCompartment = useRef(new Compartment());
  const tabSizeCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onBookmarksChangeRef = useRef(onBookmarksChange);
  onBookmarksChangeRef.current = onBookmarksChange;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const initialBookmarksRef = useRef(bookmarks ?? {});

  // I5.12 — register the built-in Firebird-keywords completion
  // provider through the shared registry. Same idempotent ref-bridge
  // pattern as other built-in registrations.
  useEffect(() => registerBuiltinFirebirdKeywordsCompletion(), []);

  // Live snapshot of registered completion providers, captured into
  // a ref so the CodeMirror autocompletion override (installed once
  // at EditorState.create time) sees the latest descriptors on every
  // keystroke without rebuilding the editor.
  const completionContributions =
    usePluginContributions<CompletionProviderContributionPayload>('completion_providers');
  const completionDescriptorsRef = useRef<CompletionProviderDescriptor[]>([]);
  completionDescriptorsRef.current =
    pluginContributionsToCompletionProviders(completionContributions);

  // I5.13 — register the built-in basic-syntax diagnostic provider.
  // Same ref-bridge so the linter callback (installed once at editor
  // creation) reads the latest descriptors per lint run.
  useEffect(() => registerBuiltinBasicSyntaxDiagnostic(), []);
  const diagnosticContributions =
    usePluginContributions<DiagnosticProviderContributionPayload>('diagnostics_providers');
  const diagnosticDescriptorsRef = useRef<DiagnosticProviderDescriptor[]>([]);
  diagnosticDescriptorsRef.current =
    pluginContributionsToDiagnosticProviders(diagnosticContributions);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const initialMode = useThemeStore.getState().mode;
    const initialEditor = useEditorStore.getState();

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbersCompartment.current.of(
          initialEditor.lineNumbers ? lineNumbers() : [],
        ),
        bookmarkGutter,
        bookmarkGutterTheme,
        highlightActiveLine(),
        history(),
        bracketMatching(),
        autocompletion({
          override: [
            (ctx) => {
              const word = ctx.matchBefore(/\w+/);
              if (!word || (word.from === word.to && !ctx.explicit)) return null;
              // I5.12 — merge contributions from registered providers
              // applicable to the `'sql'` scope. The descriptors-ref
              // is updated on every React render so this callback
              // sees the latest registered providers without
              // rebuilding the editor.
              const options = runApplicableCompletionProviders(
                completionDescriptorsRef.current,
                'sql',
                {
                  cm: ctx,
                  word: { from: word.from, to: word.to, text: word.text },
                  explicit: ctx.explicit,
                },
              );
              if (options.length === 0) return null;
              return { from: word.from, options };
            },
          ],
        }),
        // I5.13 — `@codemirror/lint` linter calls back per buffer
        // change with the current document text. The callback walks
        // the registered diagnostic providers via the ref, flattens
        // their output, maps each diagnostic's 1-based (line, col)
        // to the 0-based document offset CodeMirror consumes, and
        // returns the resulting `CmDiagnostic[]`. The gutter pip
        // strip is rendered by `lintGutter()` to the left of line
        // numbers.
        linter((view) => {
          const text = view.state.doc.toString();
          const diagnostics = runDiagnosticProviders(
            diagnosticDescriptorsRef.current,
            text,
          );
          const out: CmDiagnostic[] = [];
          for (const d of diagnostics) {
            const from = lineColToOffset(text, d.line, d.col);
            const to = lineColToOffset(text, d.line, d.endCol ?? d.col + 1);
            const cm: CmDiagnostic = {
              from,
              to: Math.max(from, to),
              severity: d.severity,
              message: d.message,
            };
            if (d.code !== undefined) cm.source = d.code;
            out.push(cm);
          }
          return out;
        }),
        lintGutter(),
        sqlCompartment.current.of(buildSqlExtension(schema)),
        dropHandlers,
        bookmarksField.init(() => initialBookmarksRef.current),
        tabSizeCompartment.current.of(EditorState.tabSize.of(initialEditor.tabSize)),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              if (busyRef.current) return false;
              // Honour the live setting — disabling the shortcut at
              // run time would otherwise require rebuilding the keymap.
              if (!useEditorStore.getState().submitOnModEnter) return false;
              const fn = onSubmitRef.current;
              if (!fn) return false;
              fn();
              return true;
            },
          },
          ...bookmarkKeymap(),
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        themeCompartment.current.of(sqlThemeFor(resolveThemeMode(initialMode))),
        fontSizeCompartment.current.of(fontSizeTheme(initialEditor.fontSize)),
        lineWrapCompartment.current.of(
          initialEditor.lineWrap ? EditorView.lineWrapping : [],
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
          const prev = update.startState.field(bookmarksField, false);
          const next = update.state.field(bookmarksField, false);
          if (prev && next && !bookmarksEqual(prev, next)) {
            onBookmarksChangeRef.current?.(next);
          }
          if (update.selectionSet) {
            const range = update.state.selection.main;
            onSelectionChangeRef.current?.({
              anchor: range.anchor,
              head: range.head,
            });
          }
        }),
        EditorView.domEventHandlers({
          focus: () => {
            onFocusRef.current?.();
          },
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;

    let lastResolved = resolveThemeMode(initialMode);
    const applyResolvedTheme = () => {
      const resolved = resolveThemeMode(useThemeStore.getState().mode);
      if (resolved === lastResolved) return;
      lastResolved = resolved;
      view.dispatch({
        effects: themeCompartment.current.reconfigure(sqlThemeFor(resolved)),
      });
    };
    const unsubTheme = useThemeStore.subscribe(applyResolvedTheme);
    // System-mode users still need the highlight to flip when the OS
    // dark/light preference changes; the store does not emit for that.
    const mq =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    const onSystemThemeChange = () => {
      if (useThemeStore.getState().mode === 'system') applyResolvedTheme();
    };
    if (mq && typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onSystemThemeChange);
    } else if (mq && typeof (mq as MediaQueryList).addListener === 'function') {
      (mq as MediaQueryList).addListener(onSystemThemeChange);
    }

    const unsubEditor = useEditorStore.subscribe((next, prev) => {
      const effects = [];
      if (next.fontSize !== prev.fontSize) {
        effects.push(
          fontSizeCompartment.current.reconfigure(fontSizeTheme(next.fontSize)),
        );
      }
      if (next.lineNumbers !== prev.lineNumbers) {
        effects.push(
          lineNumbersCompartment.current.reconfigure(
            next.lineNumbers ? lineNumbers() : [],
          ),
        );
      }
      if (next.lineWrap !== prev.lineWrap) {
        effects.push(
          lineWrapCompartment.current.reconfigure(
            next.lineWrap ? EditorView.lineWrapping : [],
          ),
        );
      }
      if (next.tabSize !== prev.tabSize) {
        effects.push(
          tabSizeCompartment.current.reconfigure(EditorState.tabSize.of(next.tabSize)),
        );
      }
      // `submitOnModEnter` is read live inside the keymap run fn — no
      // compartment reconfigure required.
      if (effects.length > 0) view.dispatch({ effects });
    });

    return () => {
      unsubTheme();
      unsubEditor();
      if (mq && typeof mq.removeEventListener === 'function') {
        mq.removeEventListener('change', onSystemThemeChange);
      } else if (mq && typeof (mq as MediaQueryList).removeListener === 'function') {
        (mq as MediaQueryList).removeListener(onSystemThemeChange);
      }
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
    view.dispatch({
      effects: sqlCompartment.current.reconfigure(buildSqlExtension(schema)),
    });
  }, [schema]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const next = bookmarks ?? {};
    const current = view.state.field(bookmarksField);
    if (bookmarksEqual(current, next)) return;
    view.dispatch({ effects: setBookmarksEffect.of(next) });
  }, [bookmarks]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.contentDOM.setAttribute('contenteditable', busy ? 'false' : 'true');
  }, [busy]);

  return <div ref={hostRef} className="overflow-hidden" />;
}
