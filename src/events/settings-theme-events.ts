/**
 * Settings + theme events (I6.10) — two topics covering user-prefs
 * mutations:
 *
 *   - `settings/changed` — fires per key when a user-pref store
 *                          (`useEditorStore` or `useDisplayStore`)
 *                          mutates a tracked value. Payload carries
 *                          the scope, key, and previous/next value.
 *   - `theme/changed`    — fires when any of the theme-store's
 *                          visual-theme fields (`mode`, `accent`,
 *                          `activeThemeId`) changes. Single event per
 *                          transition even when multiple fields
 *                          change in one update (the payload carries
 *                          all three fields).
 *
 * Both follow the diff-on-subscribe pattern (I6.4-I6.6 shape) — the
 * stores already drive state changes, so the cleanest emit point is
 * the store-subscription bridge rather than per-call-site emit.
 * `sidebarCollapsed` is intentionally excluded from `theme/changed`
 * — it's a layout pref, not a theme pref, and would create noise on
 * a popular topic.
 */

import { useEffect, useRef } from 'react';
import { eventBus } from './event-bus.js';
import { useEditorStore, type EditorState } from '../db/editor-store.js';
import { useDisplayStore, type DisplayState } from '../db/display-store.js';
import {
  useThemeStore,
  type ThemeMode,
  type ThemeState,
} from '../theme/theme-store.js';
import type { AccentId } from '../theme/accent-colors.js';

/** Topic literals. */
export const SETTINGS_CHANGED = 'settings/changed' as const;
export const THEME_CHANGED = 'theme/changed' as const;

/** Scope discriminator for `settings/changed`. */
export type SettingsScope = 'editor' | 'display';

/** Setting keys tracked in `editor` scope. Mirrors `EditorState` fields
 *  excluding setters. */
export type EditorSettingKey =
  | 'fontSize'
  | 'lineNumbers'
  | 'lineWrap'
  | 'tabSize'
  | 'submitOnModEnter';

/** Setting keys tracked in `display` scope. Mirrors `DisplayState`
 *  fields excluding setters. */
export type DisplaySettingKey =
  | 'nullDisplay'
  | 'dateFormat'
  | 'defaultPageSize'
  | 'csvDelimiter'
  | 'defaultExportFormat'
  | 'exportIncludeDdl'
  | 'showWelcomeTips';

export interface SettingsChangedPayload {
  scope: SettingsScope;
  /** Field name within the scope (e.g. `'fontSize'`, `'csvDelimiter'`). */
  key: EditorSettingKey | DisplaySettingKey;
  /** Previous value. `unknown` because field types vary across the
   *  tracked keys; subscribers narrow on `(scope, key)`. */
  previousValue: unknown;
  nextValue: unknown;
  changedAt: number;
}

export interface ThemeChangedPayload {
  previousMode: ThemeMode;
  nextMode: ThemeMode;
  previousAccent: AccentId;
  nextAccent: AccentId;
  /** Active theme contribution id (`<pluginId>:<contribId>`) or
   *  `null` when no plugin theme is active. */
  previousThemeId: string | null;
  nextThemeId: string | null;
  changedAt: number;
}

export function emitSettingsChanged(payload: SettingsChangedPayload): void {
  eventBus.emit<SettingsChangedPayload>(SETTINGS_CHANGED, payload);
}

export function emitThemeChanged(payload: ThemeChangedPayload): void {
  eventBus.emit<ThemeChangedPayload>(THEME_CHANGED, payload);
}

/** Snapshot type for the editor-store diff. Only carries the keys
 *  the diff actually compares — setters are excluded since they
 *  reference-change every update and would create false-positive
 *  diffs. */
export type EditorSettingsSnapshot = Pick<EditorState, EditorSettingKey>;

/** Snapshot type for the display-store diff. */
export type DisplaySettingsSnapshot = Pick<DisplayState, DisplaySettingKey>;

const EDITOR_KEYS: ReadonlyArray<EditorSettingKey> = [
  'fontSize',
  'lineNumbers',
  'lineWrap',
  'tabSize',
  'submitOnModEnter',
];

const DISPLAY_KEYS: ReadonlyArray<DisplaySettingKey> = [
  'nullDisplay',
  'dateFormat',
  'defaultPageSize',
  'csvDelimiter',
  'defaultExportFormat',
  'exportIncludeDdl',
  'showWelcomeTips',
];

/** Pure diff — emits one `settings/changed` per key that changed
 *  between `prev` and `next` in either scope. Returns total event
 *  count emitted. */
export function diffAndEmitSettingsChanges(
  prevEditor: EditorSettingsSnapshot,
  nextEditor: EditorSettingsSnapshot,
  prevDisplay: DisplaySettingsSnapshot,
  nextDisplay: DisplaySettingsSnapshot,
  now: () => number = Date.now,
): number {
  let count = 0;
  for (const key of EDITOR_KEYS) {
    if (prevEditor[key] !== nextEditor[key]) {
      emitSettingsChanged({
        scope: 'editor',
        key,
        previousValue: prevEditor[key],
        nextValue: nextEditor[key],
        changedAt: now(),
      });
      count++;
    }
  }
  for (const key of DISPLAY_KEYS) {
    if (prevDisplay[key] !== nextDisplay[key]) {
      emitSettingsChanged({
        scope: 'display',
        key,
        previousValue: prevDisplay[key],
        nextValue: nextDisplay[key],
        changedAt: now(),
      });
      count++;
    }
  }
  return count;
}

/** Snapshot type for the theme-store diff. Excludes `sidebarCollapsed`
 *  — that's a layout pref, not a theme pref. */
export interface ThemeSnapshot {
  mode: ThemeMode;
  accent: AccentId;
  activeThemeId: string | null;
}

/** Pure diff — emits one `theme/changed` if any of mode / accent /
 *  activeThemeId differ. Returns 1 if emitted, 0 otherwise. */
export function diffAndEmitThemeChange(
  prev: ThemeSnapshot,
  next: ThemeSnapshot,
  now: () => number = Date.now,
): number {
  if (
    prev.mode === next.mode &&
    prev.accent === next.accent &&
    prev.activeThemeId === next.activeThemeId
  ) {
    return 0;
  }
  emitThemeChanged({
    previousMode: prev.mode,
    nextMode: next.mode,
    previousAccent: prev.accent,
    nextAccent: next.accent,
    previousThemeId: prev.activeThemeId,
    nextThemeId: next.activeThemeId,
    changedAt: now(),
  });
  return 1;
}

function editorSnapshot(state: EditorState): EditorSettingsSnapshot {
  return {
    fontSize: state.fontSize,
    lineNumbers: state.lineNumbers,
    lineWrap: state.lineWrap,
    tabSize: state.tabSize,
    submitOnModEnter: state.submitOnModEnter,
  };
}

function displaySnapshot(state: DisplayState): DisplaySettingsSnapshot {
  return {
    nullDisplay: state.nullDisplay,
    dateFormat: state.dateFormat,
    defaultPageSize: state.defaultPageSize,
    csvDelimiter: state.csvDelimiter,
    defaultExportFormat: state.defaultExportFormat,
    exportIncludeDdl: state.exportIncludeDdl,
    showWelcomeTips: state.showWelcomeTips,
  };
}

function themeSnapshot(state: ThemeState): ThemeSnapshot {
  return {
    mode: state.mode,
    accent: state.accent,
    activeThemeId: state.activeThemeId,
  };
}

/** React hook that subscribes to all three relevant stores +
 *  emits `settings/changed` + `theme/changed` events on every
 *  tracked change. Mount once at the App component:
 *
 *    useEmitSettingsThemeEvents();
 *
 *  Initial mount captures current snapshots — no events fire on
 *  mount itself (settings are user prefs, not session state, so
 *  there's nothing to "replay"; subscribers mounting late read the
 *  current store directly via `useEditorStore.getState()` etc.). */
export function useEmitSettingsThemeEvents(): void {
  const prevEditorRef = useRef<EditorSettingsSnapshot | null>(null);
  const prevDisplayRef = useRef<DisplaySettingsSnapshot | null>(null);
  const prevThemeRef = useRef<ThemeSnapshot | null>(null);
  useEffect(() => {
    prevEditorRef.current = editorSnapshot(useEditorStore.getState());
    prevDisplayRef.current = displaySnapshot(useDisplayStore.getState());
    prevThemeRef.current = themeSnapshot(useThemeStore.getState());
    const unsubEditor = useEditorStore.subscribe((state) => {
      const next = editorSnapshot(state);
      if (prevEditorRef.current && prevDisplayRef.current) {
        diffAndEmitSettingsChanges(
          prevEditorRef.current,
          next,
          prevDisplayRef.current,
          prevDisplayRef.current,
        );
      }
      prevEditorRef.current = next;
    });
    const unsubDisplay = useDisplayStore.subscribe((state) => {
      const next = displaySnapshot(state);
      if (prevEditorRef.current && prevDisplayRef.current) {
        diffAndEmitSettingsChanges(
          prevEditorRef.current,
          prevEditorRef.current,
          prevDisplayRef.current,
          next,
        );
      }
      prevDisplayRef.current = next;
    });
    const unsubTheme = useThemeStore.subscribe((state) => {
      const next = themeSnapshot(state);
      if (prevThemeRef.current) {
        diffAndEmitThemeChange(prevThemeRef.current, next);
      }
      prevThemeRef.current = next;
    });
    return () => {
      unsubEditor();
      unsubDisplay();
      unsubTheme();
    };
  }, []);
}
