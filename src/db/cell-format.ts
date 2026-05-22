/**
 * Per-cell formatting helpers shared by the in-result-table export
 * toolbar (`ResultTable`) and the full-database export
 * (`database-export.ts`). Each formatter consumes a `ColumnValue`
 * and produces the right wire-shape for one output format.
 *
 * BLOBs in result rows only carry the metadata stub (size + peek);
 * the full body has to be fetched on demand and is not bundled into
 * exports. All formatters therefore degrade BLOB cells to a
 * human-readable summary rather than the bytes themselves.
 */

import type { BlobRef, ColumnValue } from './types';

/** Escapes regex metacharacters so a user-picked delimiter can be
 *  embedded inside a `new RegExp(`[…${esc(delim)}]`)` character class
 *  without blowing up on `\`, `]`, etc. */
export function escapeRegex(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

/** Human-readable summary used by exporters that cannot embed the
 *  full BLOB body. Includes size and the leading hex preview so the
 *  recipient at least sees the magic-number prefix. */
export function blobSummary(ref: BlobRef): string {
  return `BLOB(${ref.sizeBytes} bytes, peek=0x${ref.peekHex})`;
}

/** Always-quote triggers: any quote / CR / LF in the field, plus the
 *  active delimiter so the parser on the receiving side can split
 *  unambiguously regardless of which separator the user picked. */
export function quoteCsvField(s: string, delimiter: string): string {
  const re = new RegExp(`["\\r\\n${escapeRegex(delimiter)}]`);
  if (re.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function cellToCsv(cell: ColumnValue | undefined, delimiter: string): string {
  if (!cell) return '';
  switch (cell.type) {
    case 'null':
      return '';
    case 'text':
      return quoteCsvField(cell.value, delimiter);
    case 'integer':
    case 'float':
      return String(cell.value);
    case 'bool':
      return cell.value ? 'true' : 'false';
    case 'blob':
      return quoteCsvField(blobSummary(cell.value), delimiter);
  }
}

/** Type-aware plain-text rendering for "copy cell" actions.
 *
 *   - `null`               → empty string
 *   - `text`               → raw value
 *   - `integer` / `float`  → stringified number (`float` `null` → `''`)
 *   - `bool`               → `"true"` / `"false"`
 *   - `blob`               → leading hex preview (full body needs a
 *                            separate fetch via `onFetchBlob`)
 */
export function cellToPlainText(cell: ColumnValue | undefined): string {
  if (!cell) return '';
  switch (cell.type) {
    case 'null':
      return '';
    case 'text':
      return cell.value;
    case 'integer':
      return String(cell.value);
    case 'float':
      return cell.value === null ? '' : String(cell.value);
    case 'bool':
      return cell.value ? 'true' : 'false';
    case 'blob':
      return cell.value.peekHex;
  }
}

export function cellToJson(cell: ColumnValue | undefined): unknown {
  if (!cell || cell.type === 'null') return null;
  if (cell.type === 'integer' || cell.type === 'float') return cell.value;
  if (cell.type === 'bool') return cell.value;
  if (cell.type === 'blob') return blobSummary(cell.value);
  return cell.value;
}

/** Renders a single cell as a Firebird-dialect SQL literal. NULLs go
 *  through as bare `NULL`; BLOBs degrade to a comment + NULL since
 *  the body is not embedded with each row. */
export function cellToSqlLiteral(cell: ColumnValue | undefined): string {
  if (!cell || cell.type === 'null') return 'NULL';
  switch (cell.type) {
    case 'text':
      return `'${cell.value.replace(/'/g, "''")}'`;
    case 'integer':
      return String(cell.value);
    case 'float':
      return cell.value === null ? 'NULL' : String(cell.value);
    case 'bool':
      return cell.value ? 'TRUE' : 'FALSE';
    case 'blob':
      return `/* ${blobSummary(cell.value)} */ NULL`;
  }
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function cellToXmlText(cell: ColumnValue | undefined): string {
  if (!cell || cell.type === 'null') return '';
  if (cell.type === 'integer' || cell.type === 'float') return String(cell.value);
  if (cell.type === 'bool') return cell.value ? 'true' : 'false';
  if (cell.type === 'blob') return blobSummary(cell.value);
  return cell.value;
}

/** XLSX cell shape compatible with `write-excel-file`. The lib infers
 *  the cell type from the JS value (`number` → numeric, `Date` →
 *  date, `boolean` → boolean, everything else → text). */
export type XlsxCell = { value: string | number | boolean | null };

export function cellToXlsx(cell: ColumnValue | undefined): XlsxCell {
  if (!cell || cell.type === 'null') return { value: null };
  if (cell.type === 'integer' || cell.type === 'float') return { value: cell.value };
  if (cell.type === 'bool') return { value: cell.value };
  if (cell.type === 'blob') return { value: blobSummary(cell.value) };
  return { value: cell.value };
}

/** Quotes a Firebird identifier for safe interpolation into DDL/DML.
 *  Doubles embedded double quotes; always wraps in double quotes so
 *  case-sensitive / reserved names are preserved verbatim. */
export function quoteIdentForExport(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function timestampFilename(ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `plamenix-result-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
}

export function triggerDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
