import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

/* Plamenix CodeMirror themes.
 *
 * Two static syntax palettes inspired by JetBrains:
 *  - Dark mode = Darcula
 *  - Light mode = IntelliJ
 *
 * UI chrome (selection, active line, bracket match, gutter) is bound to
 * the active accent through the same CSS variables that drive the rest
 * of the shell, so the editor follows the user's accent preset. The
 * syntax colours themselves stay static — JetBrains tradition, and
 * accent-driven keyword colours degrade quickly into illegibility on
 * yellow/teal/rose accents.
 */

const MONO_STACK =
  'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace';

const darkEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--color-code)',
      color: '#a9b7c6',
      fontSize: '13px',
      height: '100%',
    },
    '.cm-content': {
      caretColor: 'var(--color-fg)',
      padding: '8px 0',
      fontFamily: MONO_STACK,
    },
    '.cm-cursor': { borderLeftColor: 'var(--color-fg)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--color-accent-subtle) !important',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--color-accent-row-hover)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--color-panel)',
      color: '#606366',
      borderRight: '1px solid var(--color-edge)',
      fontFamily: MONO_STACK,
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--color-accent-row-hover)',
      color: '#a4a3a3',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'var(--color-accent-subtle)',
      outline: '1px solid var(--color-accent)',
      color: '#ffef28 !important',
    },
    '.cm-selectionMatch': {
      backgroundColor: 'var(--color-accent-subtle)',
    },
    '&.cm-focused': { outline: 'none' },
  },
  { dark: true },
);

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#cc7832', fontWeight: '500' },
  { tag: tags.typeName, color: '#b389d9' },
  { tag: tags.standard(tags.typeName), color: '#b389d9' },
  { tag: tags.standard(tags.name), color: '#ffc66d' },
  { tag: tags.number, color: '#6897bb' },
  { tag: tags.integer, color: '#6897bb' },
  { tag: tags.float, color: '#6897bb' },
  { tag: tags.string, color: '#6a8759' },
  { tag: tags.character, color: '#6a8759' },
  { tag: tags.bool, color: '#cc7832', fontWeight: '700' },
  { tag: tags.null, color: '#cc7832', fontWeight: '700' },
  { tag: tags.lineComment, color: '#808080', fontStyle: 'italic' },
  { tag: tags.blockComment, color: '#629755', fontStyle: 'italic' },
  { tag: tags.comment, color: '#808080', fontStyle: 'italic' },
  { tag: tags.name, color: '#a9b7c6' },
  { tag: tags.variableName, color: '#a9b7c6' },
  { tag: tags.special(tags.string), color: '#e8bf6a' },
  { tag: tags.special(tags.name), color: '#9876aa' },
  { tag: tags.operator, color: '#a9b7c6' },
  { tag: tags.compareOperator, color: '#a9b7c6' },
  { tag: tags.punctuation, color: '#a9b7c6' },
  { tag: tags.separator, color: '#cc7832' },
  { tag: tags.paren, color: '#a9b7c6' },
  { tag: tags.brace, color: '#a9b7c6' },
  { tag: tags.squareBracket, color: '#a9b7c6' },
  { tag: tags.definition(tags.variableName), color: '#ffc66d' },
  { tag: tags.definition(tags.name), color: '#ffc66d' },
  { tag: tags.propertyName, color: '#9876aa' },
  { tag: tags.labelName, color: '#e8bf6a' },
  { tag: tags.escape, color: '#cc7832' },
]);

const lightEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--color-code)',
      color: '#2b2b2b',
      fontSize: '13px',
      height: '100%',
    },
    '.cm-content': {
      caretColor: 'var(--color-fg)',
      padding: '8px 0',
      fontFamily: MONO_STACK,
    },
    '.cm-cursor': { borderLeftColor: 'var(--color-fg)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--color-accent-subtle) !important',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--color-accent-row-hover)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--color-panel)',
      color: '#b0b0b0',
      borderRight: '1px solid var(--color-edge)',
      fontFamily: MONO_STACK,
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--color-accent-row-hover)',
      color: '#787878',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'var(--color-accent-subtle)',
      outline: '1px solid var(--color-accent)',
    },
    '.cm-selectionMatch': {
      backgroundColor: 'var(--color-accent-subtle)',
    },
    '&.cm-focused': { outline: 'none' },
  },
  { dark: false },
);

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#0033b3', fontWeight: '600' },
  { tag: tags.typeName, color: '#7a3e9d' },
  { tag: tags.standard(tags.typeName), color: '#7a3e9d' },
  { tag: tags.standard(tags.name), color: '#00627a' },
  { tag: tags.number, color: '#1750eb' },
  { tag: tags.integer, color: '#1750eb' },
  { tag: tags.float, color: '#1750eb' },
  { tag: tags.string, color: '#067d17' },
  { tag: tags.character, color: '#067d17' },
  { tag: tags.bool, color: '#0033b3', fontWeight: '700' },
  { tag: tags.null, color: '#0033b3', fontWeight: '700' },
  { tag: tags.lineComment, color: '#8c8c8c', fontStyle: 'italic' },
  { tag: tags.blockComment, color: '#5f826b', fontStyle: 'italic' },
  { tag: tags.comment, color: '#8c8c8c', fontStyle: 'italic' },
  { tag: tags.name, color: '#2b2b2b' },
  { tag: tags.variableName, color: '#2b2b2b' },
  { tag: tags.special(tags.string), color: '#9e880d' },
  { tag: tags.special(tags.name), color: '#660e7a' },
  { tag: tags.operator, color: '#2b2b2b' },
  { tag: tags.compareOperator, color: '#2b2b2b' },
  { tag: tags.punctuation, color: '#2b2b2b' },
  { tag: tags.separator, color: '#0033b3' },
  { tag: tags.paren, color: '#2b2b2b' },
  { tag: tags.brace, color: '#2b2b2b' },
  { tag: tags.squareBracket, color: '#2b2b2b' },
  { tag: tags.definition(tags.variableName), color: '#00627a', fontWeight: '500' },
  { tag: tags.definition(tags.name), color: '#00627a', fontWeight: '500' },
  { tag: tags.propertyName, color: '#660e7a' },
  { tag: tags.labelName, color: '#9e880d' },
  { tag: tags.escape, color: '#0033b3' },
]);

/** Darcula-inspired dark theme. */
export const firebirdDarkTheme: Extension = [
  darkEditorTheme,
  syntaxHighlighting(darkHighlightStyle),
];

/** IntelliJ-inspired light theme. */
export const firebirdLightTheme: Extension = [
  lightEditorTheme,
  syntaxHighlighting(lightHighlightStyle),
];

/** Picks the right theme for the active mode. */
export function sqlThemeFor(mode: 'dark' | 'light'): Extension {
  return mode === 'dark' ? firebirdDarkTheme : firebirdLightTheme;
}
