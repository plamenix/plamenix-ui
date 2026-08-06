import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PAGE_SIZE_OPTIONS } from './pagination';

/**
 * Cell-rendering preferences shared by every result table. Distinct
 * from `editor-store` (CodeMirror) and `theme-store` (visual chrome)
 * because the concerns are orthogonal — a user can prefer a tight
 * editor but a verbose result view, etc. Exports remain governed by
 * their own format spec; only on-screen rendering reads from here.
 */

/** Date/time/timestamp cell display formats.
 *
 *   - `iso`      `YYYY-MM-DD HH:MM:SS` — driver-native, lossless
 *   - `eu`       `DD.MM.YYYY HH:MM:SS`
 *   - `us`       `MM/DD/YYYY HH:MM:SS`
 *   - `relative` `5m ago` / `in 3h` / `just now`
 */
export type DateFormat = 'iso' | 'eu' | 'us' | 'relative';
/** CSV field separator. Tab is `\t` (one character). */
export type CsvDelimiter = ',' | ';' | '\t';
/** Export formats surfaced in the result-table toolbar. */
export type ExportFormat = 'csv' | 'json' | 'sql' | 'xml' | 'xlsx';

export interface DisplayState {
  /** Text rendered in place of a SQL NULL cell. Common values: the
   *  default `NULL`, the math empty-set glyph `∅`, or an empty string
   *  to render NULLs as blanks. */
  nullDisplay: string;
  /** Applied to result cells whose value matches a DATE / TIME /
   *  TIMESTAMP shape. Exports keep ISO regardless. */
  dateFormat: DateFormat;
  /** Default page size used by the result-table footer when no host
   *  state exists yet. Must be one of `PAGE_SIZE_OPTIONS`. */
  defaultPageSize: number;
  /** Field separator used by the CSV exporter. */
  csvDelimiter: CsvDelimiter;
  /** Format the export toolbar promotes to the primary button. */
  defaultExportFormat: ExportFormat;
  /** When `true`, the SQL export prefixes the INSERT statements with
   *  a generated `CREATE TABLE`. When `false`, only INSERTs are
   *  emitted. Honoured by both the per-result SQL button and the
   *  full-database SQL export. */
  exportIncludeDdl: boolean;
  /** When `true`, the welcome dashboard renders the rotating Firebird
   *  tips card. Toggle off for a quieter landing surface. */
  showWelcomeTips: boolean;
  /** Spaces of indentation the JSON exporter emits. `0` → minified,
   *  `2` / `4` → pretty-printed. */
  jsonIndent: number;
  /** Hex-byte preview length the BLOB cell renderer shows in the
   *  result table button. Defaults to `16` (the legacy value); range
   *  `4-64`. */
  blobHexPreviewLength: number;
  /** Auto-rotation interval in milliseconds for the Firebird tips card.
   *  `0` → disabled (no auto-rotation, user clicks Next). */
  tipRotationMs: number;
  /** Keyword case the basic SQL formatter emits. */
  sqlFormatterKeywordCase: 'upper' | 'lower' | 'preserve';
  /** Spaces per indent level the SQL formatter emits. Range `2-8`. */
  sqlFormatterIndentSize: number;
  setNullDisplay: (value: string) => void;
  setDateFormat: (value: DateFormat) => void;
  setDefaultPageSize: (value: number) => void;
  setCsvDelimiter: (value: CsvDelimiter) => void;
  setDefaultExportFormat: (value: ExportFormat) => void;
  setExportIncludeDdl: (value: boolean) => void;
  setShowWelcomeTips: (value: boolean) => void;
  setJsonIndent: (value: number) => void;
  setBlobHexPreviewLength: (value: number) => void;
  setTipRotationMs: (value: number) => void;
  setSqlFormatterKeywordCase: (value: 'upper' | 'lower' | 'preserve') => void;
  setSqlFormatterIndentSize: (value: number) => void;
}

const MAX_NULL_DISPLAY_LENGTH = 32;
const ALLOWED_DATE_FORMATS = new Set<DateFormat>(['iso', 'eu', 'us', 'relative']);
const ALLOWED_PAGE_SIZES = new Set<number>(PAGE_SIZE_OPTIONS);
const ALLOWED_CSV_DELIMITERS = new Set<CsvDelimiter>([',', ';', '\t']);
const ALLOWED_EXPORT_FORMATS = new Set<ExportFormat>([
  'csv',
  'json',
  'sql',
  'xml',
  'xlsx',
]);

export const useDisplayStore = create<DisplayState>()(
  persist(
    (set) => ({
      nullDisplay: 'NULL',
      dateFormat: 'iso',
      defaultPageSize: 100,
      csvDelimiter: ',',
      defaultExportFormat: 'sql',
      exportIncludeDdl: true,
      showWelcomeTips: true,
      jsonIndent: 2,
      blobHexPreviewLength: 16,
      tipRotationMs: 8000,
      sqlFormatterKeywordCase: 'upper',
      sqlFormatterIndentSize: 2,
      setNullDisplay: (nullDisplay) =>
        set({ nullDisplay: nullDisplay.slice(0, MAX_NULL_DISPLAY_LENGTH) }),
      setDateFormat: (dateFormat) => set({ dateFormat }),
      setDefaultPageSize: (defaultPageSize) => {
        if (ALLOWED_PAGE_SIZES.has(defaultPageSize)) set({ defaultPageSize });
      },
      setCsvDelimiter: (csvDelimiter) => {
        if (ALLOWED_CSV_DELIMITERS.has(csvDelimiter)) set({ csvDelimiter });
      },
      setDefaultExportFormat: (defaultExportFormat) => {
        if (ALLOWED_EXPORT_FORMATS.has(defaultExportFormat)) set({ defaultExportFormat });
      },
      setExportIncludeDdl: (exportIncludeDdl) => {
        if (typeof exportIncludeDdl === 'boolean') set({ exportIncludeDdl });
      },
      setShowWelcomeTips: (showWelcomeTips) => {
        if (typeof showWelcomeTips === 'boolean') set({ showWelcomeTips });
      },
      setJsonIndent: (jsonIndent) => {
        if (Number.isInteger(jsonIndent) && jsonIndent >= 0 && jsonIndent <= 8) {
          set({ jsonIndent });
        }
      },
      setBlobHexPreviewLength: (blobHexPreviewLength) => {
        if (
          Number.isInteger(blobHexPreviewLength)
          && blobHexPreviewLength >= 4
          && blobHexPreviewLength <= 64
        ) {
          set({ blobHexPreviewLength });
        }
      },
      setTipRotationMs: (tipRotationMs) => {
        if (Number.isInteger(tipRotationMs) && tipRotationMs >= 0 && tipRotationMs <= 600000) {
          set({ tipRotationMs });
        }
      },
      setSqlFormatterKeywordCase: (sqlFormatterKeywordCase) => {
        if (['upper', 'lower', 'preserve'].includes(sqlFormatterKeywordCase)) {
          set({ sqlFormatterKeywordCase });
        }
      },
      setSqlFormatterIndentSize: (sqlFormatterIndentSize) => {
        if (
          Number.isInteger(sqlFormatterIndentSize)
          && sqlFormatterIndentSize >= 2
          && sqlFormatterIndentSize <= 8
        ) {
          set({ sqlFormatterIndentSize });
        }
      },
    }),
    {
      name: 'plamenix.display',
      version: 6,
      // Additive bumps only — every prior shape is a subset of the
      // current one. Hand the persisted state back unchanged and let
      // the rehydrate guard below sanitise / default-fill anything
      // that may be missing or out of range.
      migrate: (persistedState) => persistedState as DisplayState,
      partialize: (s) => ({
        nullDisplay: s.nullDisplay,
        dateFormat: s.dateFormat,
        defaultPageSize: s.defaultPageSize,
        csvDelimiter: s.csvDelimiter,
        defaultExportFormat: s.defaultExportFormat,
        exportIncludeDdl: s.exportIncludeDdl,
        showWelcomeTips: s.showWelcomeTips,
        jsonIndent: s.jsonIndent,
        blobHexPreviewLength: s.blobHexPreviewLength,
        tipRotationMs: s.tipRotationMs,
        sqlFormatterKeywordCase: s.sqlFormatterKeywordCase,
        sqlFormatterIndentSize: s.sqlFormatterIndentSize,
      }),
      onRehydrateStorage: () => (rehydrated) => {
        if (!rehydrated) return;
        // Sanitise hostile/oversized values from older versions or
        // hand-edited storage; never throw at boot.
        if (typeof rehydrated.nullDisplay !== 'string') {
          rehydrated.nullDisplay = 'NULL';
        } else if (rehydrated.nullDisplay.length > MAX_NULL_DISPLAY_LENGTH) {
          rehydrated.nullDisplay = rehydrated.nullDisplay.slice(0, MAX_NULL_DISPLAY_LENGTH);
        }
        if (!ALLOWED_DATE_FORMATS.has(rehydrated.dateFormat)) {
          rehydrated.dateFormat = 'iso';
        }
        if (!ALLOWED_PAGE_SIZES.has(rehydrated.defaultPageSize)) {
          rehydrated.defaultPageSize = 100;
        }
        if (!ALLOWED_CSV_DELIMITERS.has(rehydrated.csvDelimiter)) {
          rehydrated.csvDelimiter = ',';
        }
        if (!ALLOWED_EXPORT_FORMATS.has(rehydrated.defaultExportFormat)) {
          rehydrated.defaultExportFormat = 'csv';
        }
        if (typeof rehydrated.exportIncludeDdl !== 'boolean') {
          rehydrated.exportIncludeDdl = true;
        }
        if (typeof rehydrated.showWelcomeTips !== 'boolean') {
          rehydrated.showWelcomeTips = true;
        }
      },
    },
  ),
);
