/**
 * Built-in default settings sections (I5.9) — extracts the eight
 * hardcoded sections from the legacy inline `sections` array in
 * `SettingsPage` into `settings_panels` contributions registered
 * under `@plamenix-builtin/settings-default-sections`.
 *
 * Each section becomes a self-contained Component that pulls its own
 * store subscriptions. No props — the Components read
 * `useThemeStore` / `useEditorStore` / `useDisplayStore` /
 * `useConnectionPrefs` directly, same as the inline array used to do
 * via closures from the SettingsPage scope.
 *
 * The Components re-use the helper Row primitives exported from
 * `SettingsPanel.tsx` (`ModeButton`, `AccentGrid`, `ToggleRow`,
 * `SegmentRow`, etc.) so the markup matches the pre-I5.9 layout
 * pixel-for-pixel.
 *
 * Priority spacing 200-270 preserves the legacy display order (Theme
 * first, Exports last). Registry default 100 → third-party sections
 * sort above the built-ins by default (community plugins surface
 * ahead of shell defaults — same convention as I5.2 menus / I5.3
 * toolbar / I5.4 inspector / I5.8 themes).
 */

import {
  Code2,
  CornerDownLeft,
  Droplet,
  FileCode,
  History,
  Indent,
  Lightbulb,
  ListOrdered,
  Monitor,
  Moon,
  Palette,
  PanelLeftClose,
  PlugZap,
  Sun,
  Table2,
  TextCursorInput,
  WrapText,
} from 'lucide-react';
import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import {
  AccentGrid,
  CsvDelimiterRow,
  DateFormatRow,
  DefaultExportRow,
  ExportIncludeDdlRow,
  ModeButton,
  NullDisplayRow,
  PageSizeRow,
  QueryHistoryLimitRow,
  SegmentRow,
  ToggleRow,
} from '../../theme/SettingsPanel.js';
import { useResolvedThemeMode, useThemeStore } from '../../theme/theme-store.js';
import {
  useEditorStore,
  type EditorFontSize,
  type EditorTabSize,
} from '../../db/editor-store.js';
import { useDisplayStore } from '../../db/display-store.js';
import { useConnectionPrefs } from '../../db/connection-prefs.js';
import type { SettingsPanelContributionPayload } from '../settings-panel-contract.js';

const BUILTIN_NAME = 'settings-default-sections';

function ThemeSection() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  return (
    <div className="grid grid-cols-3 gap-2 rounded-lg border border-edge bg-inset p-1">
      <ModeButton
        label="System"
        icon={Monitor}
        active={mode === 'system'}
        onClick={() => setMode('system')}
      />
      <ModeButton
        label="Light"
        icon={Sun}
        active={mode === 'light'}
        onClick={() => setMode('light')}
      />
      <ModeButton
        label="Dark"
        icon={Moon}
        active={mode === 'dark'}
        onClick={() => setMode('dark')}
      />
    </div>
  );
}

function AccentSection() {
  const accent = useThemeStore((s) => s.accent);
  const setAccent = useThemeStore((s) => s.setAccent);
  const resolvedMode = useResolvedThemeMode();
  return <AccentGrid current={accent} onPick={setAccent} mode={resolvedMode} />;
}

function LayoutSection() {
  const sidebarCollapsed = useThemeStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useThemeStore((s) => s.setSidebarCollapsed);
  return (
    <ToggleRow
      icon={PanelLeftClose}
      label="Collapse schema sidebar"
      checked={sidebarCollapsed}
      onChange={setSidebarCollapsed}
    />
  );
}

function ConnectionSection() {
  const autoReconnect = useConnectionPrefs((s) => s.autoReconnect);
  const setAutoReconnect = useConnectionPrefs((s) => s.setAutoReconnect);
  return (
    <ToggleRow
      icon={PlugZap}
      label="Auto-reconnect on disconnect"
      checked={autoReconnect}
      onChange={setAutoReconnect}
    />
  );
}

function HistorySection() {
  const queryHistoryLimit = useConnectionPrefs((s) => s.queryHistoryLimit);
  const setQueryHistoryLimit = useConnectionPrefs((s) => s.setQueryHistoryLimit);
  return (
    <QueryHistoryLimitRow value={queryHistoryLimit} onChange={setQueryHistoryLimit} />
  );
}

function EditorSection() {
  const fontSize = useEditorStore((s) => s.fontSize);
  const editorLineNumbers = useEditorStore((s) => s.lineNumbers);
  const lineWrap = useEditorStore((s) => s.lineWrap);
  const tabSize = useEditorStore((s) => s.tabSize);
  const submitOnModEnter = useEditorStore((s) => s.submitOnModEnter);
  const setFontSize = useEditorStore((s) => s.setFontSize);
  const setLineNumbers = useEditorStore((s) => s.setLineNumbers);
  const setLineWrap = useEditorStore((s) => s.setLineWrap);
  const setTabSize = useEditorStore((s) => s.setTabSize);
  const setSubmitOnModEnter = useEditorStore((s) => s.setSubmitOnModEnter);
  return (
    <div className="flex flex-col gap-2">
      <SegmentRow<EditorFontSize>
        icon={TextCursorInput}
        label="Font size"
        value={fontSize}
        options={[12, 13, 14, 15, 16]}
        onChange={setFontSize}
        formatOption={(v) => `${v}`}
      />
      <SegmentRow<EditorTabSize>
        icon={Indent}
        label="Tab size"
        value={tabSize}
        options={[2, 4]}
        onChange={setTabSize}
        formatOption={(v) => `${v}`}
      />
      <ToggleRow
        icon={ListOrdered}
        label="Line numbers"
        checked={editorLineNumbers}
        onChange={setLineNumbers}
      />
      <ToggleRow
        icon={WrapText}
        label="Word wrap"
        checked={lineWrap}
        onChange={setLineWrap}
      />
      <ToggleRow
        icon={CornerDownLeft}
        label="⌘/Ctrl+Enter runs query"
        checked={submitOnModEnter}
        onChange={setSubmitOnModEnter}
      />
    </div>
  );
}

function ResultsSection() {
  const nullDisplay = useDisplayStore((s) => s.nullDisplay);
  const setNullDisplay = useDisplayStore((s) => s.setNullDisplay);
  const dateFormat = useDisplayStore((s) => s.dateFormat);
  const setDateFormat = useDisplayStore((s) => s.setDateFormat);
  const defaultPageSize = useDisplayStore((s) => s.defaultPageSize);
  const setDefaultPageSize = useDisplayStore((s) => s.setDefaultPageSize);
  const showWelcomeTips = useDisplayStore((s) => s.showWelcomeTips);
  const setShowWelcomeTips = useDisplayStore((s) => s.setShowWelcomeTips);
  return (
    <div className="flex flex-col gap-2">
      <NullDisplayRow value={nullDisplay} onChange={setNullDisplay} />
      <DateFormatRow value={dateFormat} onChange={setDateFormat} />
      <PageSizeRow value={defaultPageSize} onChange={setDefaultPageSize} />
      <ToggleRow
        icon={Lightbulb}
        label="Show Firebird tips on Welcome"
        checked={showWelcomeTips}
        onChange={setShowWelcomeTips}
      />
    </div>
  );
}

function ExportsSection() {
  const csvDelimiter = useDisplayStore((s) => s.csvDelimiter);
  const setCsvDelimiter = useDisplayStore((s) => s.setCsvDelimiter);
  const defaultExportFormat = useDisplayStore((s) => s.defaultExportFormat);
  const setDefaultExportFormat = useDisplayStore((s) => s.setDefaultExportFormat);
  const exportIncludeDdl = useDisplayStore((s) => s.exportIncludeDdl);
  const setExportIncludeDdl = useDisplayStore((s) => s.setExportIncludeDdl);
  return (
    <div className="flex flex-col gap-2">
      <CsvDelimiterRow value={csvDelimiter} onChange={setCsvDelimiter} />
      <DefaultExportRow
        value={defaultExportFormat}
        onChange={setDefaultExportFormat}
      />
      <ExportIncludeDdlRow value={exportIncludeDdl} onChange={setExportIncludeDdl} />
    </div>
  );
}

const SECTIONS: {
  id: string;
  priority: number;
  payload: SettingsPanelContributionPayload;
}[] = [
  {
    id: 'theme',
    priority: 200,
    payload: {
      title: 'Theme',
      description: 'Pick the colour mode. System tracks your OS preference.',
      icon: Palette,
      Component: ThemeSection,
    },
  },
  {
    id: 'accent',
    priority: 210,
    payload: {
      title: 'Accent',
      description: 'Highlight colour used by buttons, focus rings and the tab strip.',
      icon: Droplet,
      Component: AccentSection,
    },
  },
  {
    id: 'layout',
    priority: 220,
    payload: {
      title: 'Layout',
      description: 'Workspace chrome.',
      icon: PanelLeftClose,
      Component: LayoutSection,
    },
  },
  {
    id: 'connection',
    priority: 230,
    payload: {
      title: 'Connection',
      description: 'How connection sessions behave.',
      icon: PlugZap,
      Component: ConnectionSection,
    },
  },
  {
    id: 'history',
    priority: 240,
    payload: {
      title: 'History',
      description: 'Query history retention per profile.',
      icon: History,
      Component: HistorySection,
    },
  },
  {
    id: 'editor',
    priority: 250,
    payload: {
      title: 'Editor',
      description: 'SQL editor typography, indent + keymap.',
      icon: Code2,
      Component: EditorSection,
    },
  },
  {
    id: 'results',
    priority: 260,
    payload: {
      title: 'Results',
      description: 'How rows are rendered in the result table + welcome dashboard.',
      icon: Table2,
      Component: ResultsSection,
    },
  },
  {
    id: 'exports',
    priority: 270,
    payload: {
      title: 'Exports',
      description: 'Default formatting for CSV / SQL / JSON dumps.',
      icon: FileCode,
      Component: ExportsSection,
    },
  },
];

/**
 * Registers the eight built-in settings sections. Returns a teardown
 * closure for `useEffect` pairing.
 */
export function registerBuiltinDefaultSettingsSections(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    settings_panels: SECTIONS,
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

export function unregisterBuiltinDefaultSettingsSections(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
