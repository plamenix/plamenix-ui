/**
 * Roundtrips the union of every persisted setting Plamenix owns
 * (theme / accent / sidebar / editor / display) through a single
 * JSON envelope. Import paths run a hand-rolled validator before
 * touching the live stores so a hostile or out-of-date file can
 * never put a store into an invalid shape.
 *
 * We don't pull in zod just for this one schema — the type surface
 * is small, fully owned, and the per-field guards reuse the same
 * `ALLOWED_*` predicates the stores already apply at rehydrate.
 */

import { useDisplayStore, type CsvDelimiter, type DateFormat, type ExportFormat } from './db/display-store';
import {
  useEditorStore,
  type EditorFontSize,
  type EditorTabSize,
} from './db/editor-store';
import {
  useConnectionPrefs,
  type QueryHistoryLimit,
} from './db/connection-prefs';
import { PAGE_SIZE_OPTIONS } from './db/pagination';
import { ACCENT_COLORS, type AccentId } from './theme/accent-colors';
import { useThemeStore, type ThemeMode } from './theme/theme-store';

export const SETTINGS_EXPORT_VERSION = 5;

export interface ExportedSettings {
  /** Schema version of the file. Bump when fields are removed or
   *  renamed; additive changes can stay at the current version with
   *  defensive imports. */
  version: number;
  theme: {
    mode: ThemeMode;
    accent: AccentId;
    sidebarCollapsed: boolean;
  };
  editor: {
    fontSize: EditorFontSize;
    lineNumbers: boolean;
    lineWrap: boolean;
    tabSize: EditorTabSize;
    submitOnModEnter: boolean;
  };
  display: {
    nullDisplay: string;
    dateFormat: DateFormat;
    defaultPageSize: number;
    csvDelimiter: CsvDelimiter;
    defaultExportFormat: ExportFormat;
    exportIncludeDdl: boolean;
    showWelcomeTips: boolean;
  };
  connection: {
    autoReconnect: boolean;
    queryHistoryLimit: QueryHistoryLimit;
  };
}

const ACCENT_IDS = new Set<AccentId>(ACCENT_COLORS.map((c) => c.id));
const THEME_MODES = new Set<ThemeMode>(['system', 'dark', 'light']);
const FONT_SIZES = new Set<EditorFontSize>([12, 13, 14, 15, 16]);
const TAB_SIZES = new Set<EditorTabSize>([2, 4]);
const DATE_FORMATS = new Set<DateFormat>(['iso', 'eu', 'us', 'relative']);
const CSV_DELIMS = new Set<CsvDelimiter>([',', ';', '\t']);
const EXPORT_FORMATS = new Set<ExportFormat>(['csv', 'json', 'sql', 'xml', 'xlsx']);
const PAGE_SIZES = new Set<number>(PAGE_SIZE_OPTIONS);
const HISTORY_LIMITS = new Set<QueryHistoryLimit>([100, 500, 2000, 'unlimited']);

/** Snapshot the current state of every persisted store into the
 *  serialisable envelope used by `serializeSettings`. */
export function gatherSettings(): ExportedSettings {
  const t = useThemeStore.getState();
  const e = useEditorStore.getState();
  const d = useDisplayStore.getState();
  const c = useConnectionPrefs.getState();
  return {
    version: SETTINGS_EXPORT_VERSION,
    theme: {
      mode: t.mode,
      accent: t.accent,
      sidebarCollapsed: t.sidebarCollapsed,
    },
    editor: {
      fontSize: e.fontSize,
      lineNumbers: e.lineNumbers,
      lineWrap: e.lineWrap,
      tabSize: e.tabSize,
      submitOnModEnter: e.submitOnModEnter,
    },
    display: {
      nullDisplay: d.nullDisplay,
      dateFormat: d.dateFormat,
      defaultPageSize: d.defaultPageSize,
      csvDelimiter: d.csvDelimiter,
      defaultExportFormat: d.defaultExportFormat,
      exportIncludeDdl: d.exportIncludeDdl,
      showWelcomeTips: d.showWelcomeTips,
    },
    connection: {
      autoReconnect: c.autoReconnect,
      queryHistoryLimit: c.queryHistoryLimit,
    },
  };
}

/** JSON-serialise the current settings with a 2-space indent. */
export function serializeSettings(): string {
  return `${JSON.stringify(gatherSettings(), null, 2)}\n`;
}

export type ValidationResult =
  | { ok: true; settings: ExportedSettings }
  | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(path: string, expected: string): ValidationResult {
  return { ok: false, error: `${path}: expected ${expected}` };
}

/** Validates a parsed JSON value against the {@link ExportedSettings}
 *  shape. Rejects on the first failing field so the caller can show a
 *  pinpointed message rather than a generic "invalid file". */
export function validateSettings(raw: unknown): ValidationResult {
  if (!isRecord(raw)) return fail('root', 'object');
  const version = raw['version'];
  if (typeof version !== 'number') return fail('version', 'number');
  if (version !== SETTINGS_EXPORT_VERSION) {
    return {
      ok: false,
      error: `unsupported version ${version}; expected ${SETTINGS_EXPORT_VERSION}`,
    };
  }

  const themeRaw = raw['theme'];
  if (!isRecord(themeRaw)) return fail('theme', 'object');
  const mode = themeRaw['mode'];
  const accent = themeRaw['accent'];
  const sidebarCollapsed = themeRaw['sidebarCollapsed'];
  if (typeof mode !== 'string' || !THEME_MODES.has(mode as ThemeMode)) {
    return fail('theme.mode', 'system | dark | light');
  }
  if (typeof accent !== 'string' || !ACCENT_IDS.has(accent as AccentId)) {
    return fail('theme.accent', 'known accent id');
  }
  if (typeof sidebarCollapsed !== 'boolean') {
    return fail('theme.sidebarCollapsed', 'boolean');
  }

  const editorRaw = raw['editor'];
  if (!isRecord(editorRaw)) return fail('editor', 'object');
  const fontSize = editorRaw['fontSize'];
  const lineNumbers = editorRaw['lineNumbers'];
  const lineWrap = editorRaw['lineWrap'];
  const tabSize = editorRaw['tabSize'];
  const submitOnModEnter = editorRaw['submitOnModEnter'];
  if (typeof fontSize !== 'number' || !FONT_SIZES.has(fontSize as EditorFontSize)) {
    return fail('editor.fontSize', '12 | 13 | 14 | 15 | 16');
  }
  if (typeof lineNumbers !== 'boolean') return fail('editor.lineNumbers', 'boolean');
  if (typeof lineWrap !== 'boolean') return fail('editor.lineWrap', 'boolean');
  if (typeof tabSize !== 'number' || !TAB_SIZES.has(tabSize as EditorTabSize)) {
    return fail('editor.tabSize', '2 | 4');
  }
  if (typeof submitOnModEnter !== 'boolean') {
    return fail('editor.submitOnModEnter', 'boolean');
  }

  const displayRaw = raw['display'];
  if (!isRecord(displayRaw)) return fail('display', 'object');
  const nullDisplay = displayRaw['nullDisplay'];
  const dateFormat = displayRaw['dateFormat'];
  const defaultPageSize = displayRaw['defaultPageSize'];
  const csvDelimiter = displayRaw['csvDelimiter'];
  const defaultExportFormat = displayRaw['defaultExportFormat'];
  const exportIncludeDdl = displayRaw['exportIncludeDdl'];
  if (typeof nullDisplay !== 'string' || nullDisplay.length > 32) {
    return fail('display.nullDisplay', 'string (≤ 32 chars)');
  }
  if (typeof dateFormat !== 'string' || !DATE_FORMATS.has(dateFormat as DateFormat)) {
    return fail('display.dateFormat', 'iso | eu | us | relative');
  }
  if (typeof defaultPageSize !== 'number' || !PAGE_SIZES.has(defaultPageSize)) {
    return fail('display.defaultPageSize', PAGE_SIZE_OPTIONS.join(' | '));
  }
  if (
    typeof csvDelimiter !== 'string' ||
    !CSV_DELIMS.has(csvDelimiter as CsvDelimiter)
  ) {
    return fail('display.csvDelimiter', '"," | ";" | "\\t"');
  }
  if (
    typeof defaultExportFormat !== 'string' ||
    !EXPORT_FORMATS.has(defaultExportFormat as ExportFormat)
  ) {
    return fail('display.defaultExportFormat', 'csv | json | xlsx | sql | xml');
  }
  if (typeof exportIncludeDdl !== 'boolean') {
    return fail('display.exportIncludeDdl', 'boolean');
  }
  const showWelcomeTips = displayRaw['showWelcomeTips'];
  if (typeof showWelcomeTips !== 'boolean') {
    return fail('display.showWelcomeTips', 'boolean');
  }

  const connectionRaw = raw['connection'];
  if (!isRecord(connectionRaw)) return fail('connection', 'object');
  const autoReconnect = connectionRaw['autoReconnect'];
  if (typeof autoReconnect !== 'boolean') {
    return fail('connection.autoReconnect', 'boolean');
  }
  const queryHistoryLimit = connectionRaw['queryHistoryLimit'];
  if (!HISTORY_LIMITS.has(queryHistoryLimit as QueryHistoryLimit)) {
    return fail('connection.queryHistoryLimit', '100 | 500 | 2000 | "unlimited"');
  }

  return {
    ok: true,
    settings: {
      version,
      theme: {
        mode: mode as ThemeMode,
        accent: accent as AccentId,
        sidebarCollapsed,
      },
      editor: {
        fontSize: fontSize as EditorFontSize,
        lineNumbers,
        lineWrap,
        tabSize: tabSize as EditorTabSize,
        submitOnModEnter,
      },
      display: {
        nullDisplay,
        dateFormat: dateFormat as DateFormat,
        defaultPageSize,
        csvDelimiter: csvDelimiter as CsvDelimiter,
        defaultExportFormat: defaultExportFormat as ExportFormat,
        exportIncludeDdl,
        showWelcomeTips,
      },
      connection: {
        autoReconnect,
        queryHistoryLimit: queryHistoryLimit as QueryHistoryLimit,
      },
    },
  };
}

/** Parse + validate a JSON string in one shot. The parse error is
 *  surfaced verbatim so the user can see "Unexpected token …" rather
 *  than a generic "invalid file". */
export function parseSettings(text: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return validateSettings(raw);
}

/** Push a validated settings envelope into the live stores. The setters
 *  re-apply the per-field guards so even a hand-built object can't put
 *  a store into an unknown state. */
export function applySettings(settings: ExportedSettings): void {
  const t = useThemeStore.getState();
  t.setMode(settings.theme.mode);
  t.setAccent(settings.theme.accent);
  t.setSidebarCollapsed(settings.theme.sidebarCollapsed);

  const e = useEditorStore.getState();
  e.setFontSize(settings.editor.fontSize);
  e.setLineNumbers(settings.editor.lineNumbers);
  e.setLineWrap(settings.editor.lineWrap);
  e.setTabSize(settings.editor.tabSize);
  e.setSubmitOnModEnter(settings.editor.submitOnModEnter);

  const d = useDisplayStore.getState();
  d.setNullDisplay(settings.display.nullDisplay);
  d.setDateFormat(settings.display.dateFormat);
  d.setDefaultPageSize(settings.display.defaultPageSize);
  d.setCsvDelimiter(settings.display.csvDelimiter);
  d.setDefaultExportFormat(settings.display.defaultExportFormat);
  d.setExportIncludeDdl(settings.display.exportIncludeDdl);
  d.setShowWelcomeTips(settings.display.showWelcomeTips);

  const c = useConnectionPrefs.getState();
  c.setAutoReconnect(settings.connection.autoReconnect);
  c.setQueryHistoryLimit(settings.connection.queryHistoryLimit);
}

/** Trigger a browser download for the current settings envelope.
 *  No-op in non-DOM contexts. */
export function downloadSettings(filename = 'plamenix-settings.json'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([serializeSettings()], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
