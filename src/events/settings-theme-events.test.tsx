// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  SETTINGS_CHANGED,
  THEME_CHANGED,
  diffAndEmitSettingsChanges,
  diffAndEmitThemeChange,
  emitSettingsChanged,
  emitThemeChanged,
  useEmitSettingsThemeEvents,
  type DisplaySettingsSnapshot,
  type EditorSettingsSnapshot,
  type SettingsChangedPayload,
  type ThemeChangedPayload,
  type ThemeSnapshot,
} from './settings-theme-events.js';
import { eventBus } from './event-bus.js';
import { useEditorStore } from '../db/editor-store.js';
import { useDisplayStore } from '../db/display-store.js';
import { useThemeStore } from '../theme/theme-store.js';

const editor = (overrides: Partial<EditorSettingsSnapshot> = {}): EditorSettingsSnapshot => ({
  fontSize: 13,
  lineNumbers: true,
  lineWrap: false,
  tabSize: 2,
  submitOnModEnter: true,
  ...overrides,
});

const display = (overrides: Partial<DisplaySettingsSnapshot> = {}): DisplaySettingsSnapshot => ({
  nullDisplay: 'NULL',
  dateFormat: 'iso',
  defaultPageSize: 100,
  csvDelimiter: ',',
  defaultExportFormat: 'csv',
  exportIncludeDdl: true,
  showWelcomeTips: true,
  ...overrides,
});

const theme = (overrides: Partial<ThemeSnapshot> = {}): ThemeSnapshot => ({
  mode: 'system',
  accent: 'amber',
  activeThemeId: null,
  ...overrides,
});

describe('settings-theme-events topic constants (I6.10)', () => {
  it('exposes the two expected topic literals', () => {
    expect(SETTINGS_CHANGED).toBe('settings/changed');
    expect(THEME_CHANGED).toBe('theme/changed');
  });
});

describe('diffAndEmitSettingsChanges (I6.10)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => eventBus.__reset());

  it('emits one settings/changed per editor key that changed', () => {
    const handler = vi.fn();
    eventBus.subscribe<SettingsChangedPayload>('p', SETTINGS_CHANGED, handler);
    const count = diffAndEmitSettingsChanges(
      editor({ fontSize: 13, lineWrap: false }),
      editor({ fontSize: 16, lineWrap: true }),
      display(),
      display(),
    );
    expect(count).toBe(2);
    const keys = handler.mock.calls.map((c) => (c[1] as SettingsChangedPayload).key);
    expect(keys).toEqual(['fontSize', 'lineWrap']);
  });

  it('emits one settings/changed per display key that changed with correct scope', () => {
    const handler = vi.fn();
    eventBus.subscribe<SettingsChangedPayload>('p', SETTINGS_CHANGED, handler);
    diffAndEmitSettingsChanges(
      editor(),
      editor(),
      display({ nullDisplay: 'NULL', dateFormat: 'iso' }),
      display({ nullDisplay: '∅', dateFormat: 'eu' }),
    );
    expect(handler).toHaveBeenCalledTimes(2);
    const scopes = handler.mock.calls.map((c) => (c[1] as SettingsChangedPayload).scope);
    expect(scopes).toEqual(['display', 'display']);
  });

  it('does NOT emit when nothing changed', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', SETTINGS_CHANGED, handler);
    const e = editor();
    const d = display();
    diffAndEmitSettingsChanges(e, e, d, d);
    expect(handler).not.toHaveBeenCalled();
  });

  it('payload carries previousValue + nextValue for the diffed key', () => {
    const handler = vi.fn();
    eventBus.subscribe<SettingsChangedPayload>('p', SETTINGS_CHANGED, handler);
    diffAndEmitSettingsChanges(
      editor({ fontSize: 13 }),
      editor({ fontSize: 16 }),
      display(),
      display(),
    );
    const payload = handler.mock.calls[0]?.[1] as SettingsChangedPayload;
    expect(payload.previousValue).toBe(13);
    expect(payload.nextValue).toBe(16);
  });

  it('uses the supplied now() (deterministic timestamps)', () => {
    const handler = vi.fn();
    eventBus.subscribe<SettingsChangedPayload>('p', SETTINGS_CHANGED, handler);
    diffAndEmitSettingsChanges(
      editor({ lineWrap: false }),
      editor({ lineWrap: true }),
      display(),
      display(),
      () => 8888,
    );
    expect((handler.mock.calls[0]?.[1] as SettingsChangedPayload).changedAt).toBe(8888);
  });
});

describe('diffAndEmitThemeChange (I6.10)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => eventBus.__reset());

  it('emits theme/changed when mode changes', () => {
    const handler = vi.fn();
    eventBus.subscribe<ThemeChangedPayload>('p', THEME_CHANGED, handler);
    const count = diffAndEmitThemeChange(theme({ mode: 'system' }), theme({ mode: 'dark' }));
    expect(count).toBe(1);
    const payload = handler.mock.calls[0]?.[1] as ThemeChangedPayload;
    expect(payload.previousMode).toBe('system');
    expect(payload.nextMode).toBe('dark');
  });

  it('emits theme/changed when accent changes', () => {
    const handler = vi.fn();
    eventBus.subscribe<ThemeChangedPayload>('p', THEME_CHANGED, handler);
    diffAndEmitThemeChange(theme({ accent: 'amber' }), theme({ accent: 'rose' }));
    const payload = handler.mock.calls[0]?.[1] as ThemeChangedPayload;
    expect(payload.previousAccent).toBe('amber');
    expect(payload.nextAccent).toBe('rose');
  });

  it('emits theme/changed when activeThemeId changes (plugin theme switch)', () => {
    const handler = vi.fn();
    eventBus.subscribe<ThemeChangedPayload>('p', THEME_CHANGED, handler);
    diffAndEmitThemeChange(
      theme({ activeThemeId: null }),
      theme({ activeThemeId: 'cool-plugin:midnight' }),
    );
    const payload = handler.mock.calls[0]?.[1] as ThemeChangedPayload;
    expect(payload.previousThemeId).toBeNull();
    expect(payload.nextThemeId).toBe('cool-plugin:midnight');
  });

  it('emits ONE event when multiple theme fields change together', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', THEME_CHANGED, handler);
    diffAndEmitThemeChange(
      theme({ mode: 'system', accent: 'amber' }),
      theme({ mode: 'dark', accent: 'rose' }),
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT emit when no theme field changed', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', THEME_CHANGED, handler);
    const t = theme();
    diffAndEmitThemeChange(t, t);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('emit helpers + wildcards (I6.10)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => eventBus.__reset());

  it('emitSettingsChanged dispatches with full payload', () => {
    const handler = vi.fn();
    eventBus.subscribe<SettingsChangedPayload>('p', SETTINGS_CHANGED, handler);
    emitSettingsChanged({
      scope: 'editor', key: 'fontSize', previousValue: 13, nextValue: 16, changedAt: 1,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as SettingsChangedPayload).key).toBe('fontSize');
  });

  it('emitThemeChanged dispatches with full payload', () => {
    const handler = vi.fn();
    eventBus.subscribe<ThemeChangedPayload>('p', THEME_CHANGED, handler);
    emitThemeChanged({
      previousMode: 'system', nextMode: 'dark',
      previousAccent: 'amber', nextAccent: 'amber',
      previousThemeId: null, nextThemeId: null,
      changedAt: 1,
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('useEmitSettingsThemeEvents (I6.10)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => {
    cleanup();
    eventBus.__reset();
  });

  it('emits settings/changed when useEditorStore.setFontSize fires', () => {
    const handler = vi.fn();
    eventBus.subscribe<SettingsChangedPayload>('p', SETTINGS_CHANGED, handler);
    renderHook(() => useEmitSettingsThemeEvents());
    const originalFont = useEditorStore.getState().fontSize;
    const nextFont = originalFont === 16 ? 14 : 16;
    act(() => useEditorStore.getState().setFontSize(nextFont as 12 | 13 | 14 | 15 | 16));
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]?.[1] as SettingsChangedPayload;
    expect(payload.scope).toBe('editor');
    expect(payload.key).toBe('fontSize');
    expect(payload.nextValue).toBe(nextFont);
    // restore
    act(() => useEditorStore.getState().setFontSize(originalFont));
  });

  it('emits settings/changed when useDisplayStore.setCsvDelimiter fires', () => {
    const handler = vi.fn();
    eventBus.subscribe<SettingsChangedPayload>('p', SETTINGS_CHANGED, handler);
    renderHook(() => useEmitSettingsThemeEvents());
    const originalDelim = useDisplayStore.getState().csvDelimiter;
    const nextDelim = originalDelim === ';' ? ',' : ';';
    act(() => useDisplayStore.getState().setCsvDelimiter(nextDelim as ',' | ';' | '\t'));
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]?.[1] as SettingsChangedPayload;
    expect(payload.scope).toBe('display');
    expect(payload.key).toBe('csvDelimiter');
    act(() => useDisplayStore.getState().setCsvDelimiter(originalDelim));
  });

  it('emits theme/changed when useThemeStore.setMode fires', () => {
    const handler = vi.fn();
    eventBus.subscribe<ThemeChangedPayload>('p', THEME_CHANGED, handler);
    renderHook(() => useEmitSettingsThemeEvents());
    const originalMode = useThemeStore.getState().mode;
    const nextMode = originalMode === 'dark' ? 'light' : 'dark';
    act(() => useThemeStore.getState().setMode(nextMode));
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]?.[1] as ThemeChangedPayload;
    expect(payload.nextMode).toBe(nextMode);
    act(() => useThemeStore.getState().setMode(originalMode));
  });

  it('does NOT emit on sidebarCollapsed toggle (excluded from theme events)', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', THEME_CHANGED, handler);
    renderHook(() => useEmitSettingsThemeEvents());
    act(() => useThemeStore.getState().toggleSidebar());
    expect(handler).not.toHaveBeenCalled();
    // restore
    act(() => useThemeStore.getState().toggleSidebar());
  });
});
