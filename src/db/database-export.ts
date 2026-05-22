/**
 * Full-database export. Walks every non-system base table from a
 * `Schema`, runs `SELECT * FROM "<table>"` per table through a host
 * callback, and concatenates the results into a single deliverable
 * per format.
 *
 *   - CSV / JSON / SQL / XML : one file with per-table markers
 *   - XLSX                   : one sheet per table
 *
 * The fetcher is supplied by the host because the transport layer
 * (Tauri invoke / fetch) is owned by the edition; this module stays
 * transport-agnostic.
 */

import type { ColumnInfo, ColumnValue, Schema, TableInfo } from './types';
import type { ExportFormat } from './display-store';
import {
  cellToCsv,
  cellToJson,
  cellToSqlLiteral,
  cellToXlsx,
  cellToXmlText,
  escapeXml,
  quoteCsvField,
  quoteIdentForExport,
  triggerDownload,
  type XlsxCell,
} from './cell-format';

/** A single table's contribution to a database-wide export. */
export interface TableExportPart {
  table: TableInfo;
  /** Column names returned by the engine, in projection order. */
  columns: { name: string }[];
  /** Decoded rows; `cells.length === columns.length`. */
  rows: { cells: ColumnValue[] }[];
}

export interface DatabaseExportProgress {
  /** 1-based index of the table currently fetching / writing. */
  step: number;
  /** Total number of tables in the export set. */
  total: number;
  /** Table whose fetch just started (empty when finished). */
  table: string;
}

export interface RunDatabaseExportArgs {
  schema: Schema;
  format: ExportFormat;
  csvDelimiter: string;
  /** Host-supplied fetcher. Receives one quoted-as-needed identifier
   *  and resolves with the result rows. Rejection aborts the export. */
  fetchTable: (table: TableInfo) => Promise<TableExportPart>;
  /** Optional progress callback. Fired before each table's fetch and
   *  after the final concat. */
  onProgress?: (progress: DatabaseExportProgress) => void;
  /** When `true` (default), the SQL output prefixes each table with a
   *  `CREATE TABLE` block. When `false`, only `INSERT` statements are
   *  emitted. No effect on non-SQL formats. */
  includeDdl?: boolean;
}

/** Returns the list of tables a database export targets — base
 *  tables only, in the order they appear in the schema. Views and
 *  system relations are skipped. */
export function targetTables(schema: Schema): TableInfo[] {
  return schema.tables.filter((t) => t.kind === 'table');
}

function timestampFile(ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `plamenix-database-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
}

function buildCreateTable(table: TableInfo): string {
  const cols = (table.columns ?? []).map((c: ColumnInfo) => {
    const ident = quoteIdentForExport(c.name);
    const nullable = c.nullable ? '' : ' NOT NULL';
    const def = c.defaultExpr ? ` DEFAULT ${c.defaultExpr}` : '';
    return `    ${ident} ${c.sqlType}${def}${nullable}`;
  });
  const pk = (table.primaryKey ?? []).map((n) => quoteIdentForExport(n));
  const pkLine = pk.length > 0 ? [`    PRIMARY KEY (${pk.join(', ')})`] : [];
  const inner = [...cols, ...pkLine].join(',\n');
  return `CREATE TABLE ${quoteIdentForExport(table.name)} (\n${inner}\n);`;
}

function buildCsv(parts: TableExportPart[], delimiter: string): string {
  const out: string[] = [];
  for (const p of parts) {
    out.push(`-- TABLE ${p.table.name}`);
    out.push(
      p.columns.map((c) => quoteCsvField(c.name, delimiter)).join(delimiter),
    );
    for (const r of p.rows) {
      out.push(r.cells.map((c) => cellToCsv(c, delimiter)).join(delimiter));
    }
    out.push('');
  }
  return out.join('\r\n');
}

function buildJson(parts: TableExportPart[]): string {
  const root: Record<string, unknown[]> = {};
  for (const p of parts) {
    root[p.table.name] = p.rows.map((r) => {
      const obj: Record<string, unknown> = {};
      p.columns.forEach((c, i) => {
        obj[c.name] = cellToJson(r.cells[i]);
      });
      return obj;
    });
  }
  return `${JSON.stringify(root, null, 2)}\n`;
}

function buildSql(parts: TableExportPart[], includeDdl: boolean): string {
  const out: string[] = [
    '-- Plamenix database export',
    `-- ${new Date().toISOString()}`,
    '',
  ];
  for (const p of parts) {
    out.push(`-- ============================================`);
    out.push(`-- TABLE ${p.table.name}`);
    out.push(`-- ============================================`);
    if (includeDdl) {
      out.push(buildCreateTable(p.table));
      out.push('');
    }
    if (p.rows.length > 0) {
      const cols = p.columns
        .map((c) => quoteIdentForExport(c.name))
        .join(', ');
      const ident = quoteIdentForExport(p.table.name);
      for (const r of p.rows) {
        const values = r.cells.map(cellToSqlLiteral).join(', ');
        out.push(`INSERT INTO ${ident} (${cols}) VALUES (${values});`);
      }
      out.push('');
    }
  }
  return out.join('\n');
}

function buildXml(parts: TableExportPart[]): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<database>'];
  for (const p of parts) {
    lines.push(`  <table name="${escapeXml(p.table.name)}">`);
    for (const r of p.rows) {
      lines.push('    <row>');
      p.columns.forEach((c, i) => {
        const cell = r.cells[i];
        const nullAttr = !cell || cell.type === 'null' ? ' null="true"' : '';
        const text = cell && cell.type !== 'null' ? escapeXml(cellToXmlText(cell)) : '';
        lines.push(`      <col name="${escapeXml(c.name)}"${nullAttr}>${text}</col>`);
      });
      lines.push('    </row>');
    }
    lines.push('  </table>');
  }
  lines.push('</database>');
  return `${lines.join('\n')}\n`;
}

/** XLSX sheet names must be ≤ 31 chars and may not contain `: \ / ? * [ ]`.
 *  Substitutes invalid chars with `_` and truncates to 31. */
function sanitiseSheetName(name: string): string {
  return name
    .replace(/[:\\/?*\[\]]/g, '_')
    .slice(0, 31);
}

async function downloadXlsxMultiSheet(parts: TableExportPart[]): Promise<void> {
  const mod = (await import('write-excel-file/browser')) as unknown as {
    default: (
      data: XlsxCell[][][],
      opts: { fileName: string; sheets?: string[] },
    ) => Promise<unknown>;
  };
  const sheets: XlsxCell[][][] = [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const header: XlsxCell[] = p.columns.map((c) => ({ value: c.name }));
    const body: XlsxCell[][] = p.rows.map((r) =>
      p.columns.map((_, i) => cellToXlsx(r.cells[i])),
    );
    sheets.push([header, ...body]);
    // Dedupe sanitised names — Excel rejects duplicate sheet names.
    let candidate = sanitiseSheetName(p.table.name);
    let n = 1;
    while (seen.has(candidate)) {
      n += 1;
      const suffix = ` (${n})`;
      candidate = `${sanitiseSheetName(p.table.name).slice(0, 31 - suffix.length)}${suffix}`;
    }
    seen.add(candidate);
    names.push(candidate);
  }
  await mod.default(sheets, { fileName: timestampFile('xlsx'), sheets: names });
}

/**
 * Drives the export end-to-end: iterates target tables, calls
 * `fetchTable` per row set, then concatenates and triggers a
 * browser download. Throws if any fetch rejects so the caller can
 * surface the failing table to the user.
 */
export async function runDatabaseExport({
  schema,
  format,
  csvDelimiter,
  fetchTable,
  onProgress,
  includeDdl = true,
}: RunDatabaseExportArgs): Promise<void> {
  const tables = targetTables(schema);
  const parts: TableExportPart[] = [];
  for (let i = 0; i < tables.length; i += 1) {
    const t = tables[i]!;
    onProgress?.({ step: i + 1, total: tables.length, table: t.name });
    parts.push(await fetchTable(t));
  }
  onProgress?.({ step: tables.length, total: tables.length, table: '' });
  if (format === 'csv') {
    triggerDownload(buildCsv(parts, csvDelimiter), timestampFile('csv'), 'text/csv');
    return;
  }
  if (format === 'json') {
    triggerDownload(buildJson(parts), timestampFile('json'), 'application/json');
    return;
  }
  if (format === 'sql') {
    triggerDownload(buildSql(parts, includeDdl), timestampFile('sql'), 'application/sql');
    return;
  }
  if (format === 'xml') {
    triggerDownload(buildXml(parts), timestampFile('xml'), 'application/xml');
    return;
  }
  await downloadXlsxMultiSheet(parts);
}
