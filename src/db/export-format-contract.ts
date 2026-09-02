/**
 * Export-format contribution-point contract.
 *
 * Plugins (third-party or built-in via the internal-server pattern,
 * see `@plamenix/ui/plugin-react` `registerBuiltin`) contribute new
 * export formats by registering at the `export_formats` extension
 * point with this payload shape. The shell's ResultTable toolbar
 * appends each registered format as an extra download button beside
 * the built-in CSV / JSON / SQL / XML / XLSX paths. Built-in extracts
 * (the 5 hardcoded formats becoming `@plamenix-builtin/<id>-export`
 * registrations) land in I4 — at that point the toolbar's hardcoded
 * `definitions` array shrinks to a residual fallback and the registry
 * is the primary source.
 *
 * Plugin author's `exportRows` callback is responsible for producing
 * the download bytes; the shell handles the actual download trigger
 * (createObjectURL → click anchor → revokeObjectURL). This keeps
 * download chrome consistent across all formats and centralises the
 * URL-revocation discipline.
 */

import type { ColumnDescription, Row, TableInfo } from './types.js';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/** Snapshot of rows + columns + metadata the shell hands the plugin
 *  format on user click. */
export interface ExportFormatArgs {
  /** Columns descriptor from the current result. Wire shape is the
   *  minimal `{name}` `ColumnDescription` (= `Column` in the generated
   *  bindings) because that is what the QueryResult `Rows.columns`
   *  field exposes — full `ColumnInfo` (with `sqlType` / `nullable` /
   *  defaults / primaryKey) is only available when the result targets
   *  a single known table; see `tableInfo` below. */
  columns: ColumnDescription[];
  /** Rows currently visible / selected (depending on scope). */
  rows: Row[];
  /** When the result targets a single known table (the editable case
   *  — clicking the result table's edit affordances is enabled), the
   *  shell hands the plugin the full `TableInfo` from the cached
   *  schema: name, kind (`table` / `view`), `ColumnInfo[]` with
   *  `sqlType` + `nullable` + defaults, and `primaryKey?: string[]`.
   *  Format-aware exporters (SQL `CREATE TABLE`, Parquet, Arrow,
   *  type-tagged JSON) consult this; plain text/CSV/JSON exporters
   *  can ignore it. */
  tableInfo?: TableInfo;
  /** Whether the user explicitly opted in to schema-DDL in the
   *  export (the shell's "SQL with DDL" toggle). Plugins that emit
   *  schema-aware formats consult this; others can ignore it. */
  includeDdl?: boolean;
}

/** Result the plugin returns; the shell triggers the actual download. */
export interface ExportFormatResult {
  /** Suggested filename excluding any timestamp the shell may add. */
  filename: string;
  /** MIME type for the download Blob. */
  mimeType: string;
  /** Body — Blob preferred for large outputs (no UTF-8 round-trip
   *  cost), string accepted for small textual formats. */
  body: Blob | string;
}

export interface ExportFormatPayload {
  /** Display label shown on the toolbar button (e.g. "Parquet"). */
  label: string;
  /** Tooltip text. */
  title: string;
  /** Optional Lucide icon — string name resolved by the shell, or a
   *  React component rendered at 12x12 if the format wants a custom
   *  glyph. Plugins without an icon get a generic file icon. */
  icon?: React.ComponentType<{ className?: string }>;
  /**
   * Produces the export body. Called on user click. Plugins compose
   * the bytes / text however they want (server round-trip, in-browser
   * formatting library, etc.).
   */
  exportRows: (args: ExportFormatArgs) => Promise<ExportFormatResult>;
}

/**
 * Helper: maps registry contributions into the toolbar-button shape
 * the shell's export-toolbar expects. The shell's hardcoded built-in
 * formats stay alongside (until I4 extracts them); registered formats
 * are appended after the built-in 5 in priority-sort order (already
 * applied by the registry).
 */
export interface ExportButtonDefinition {
  /** Stable id — includes the plugin id namespace so two plugins
   *  with the same local id do not collide on click. */
  id: string;
  pluginId: string;
  label: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Invokes the plugin's `exportRows` and hands the result to the
   *  shell's download trigger. */
  onSelect: (args: ExportFormatArgs) => Promise<ExportFormatResult>;
}

export function pluginContributionsToExportButtons(
  contributions: ReadonlyArray<PluginContribution<ExportFormatPayload>>,
): ExportButtonDefinition[] {
  return contributions.map(({ pluginId, contribution }) => {
    const def: ExportButtonDefinition = {
      id: `${pluginId}:${contribution.id}`,
      pluginId,
      label: contribution.payload.label,
      title: contribution.payload.title,
      onSelect: (args) => contribution.payload.exportRows(args),
    };
    if (contribution.payload.icon) {
      def.icon = contribution.payload.icon;
    }
    return def;
  });
}
