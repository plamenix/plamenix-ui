/**
 * Transport-agnostic export protocol. The frontend never sees raw
 * Tauri events or `fetch` streams; consumers (Result-table toolbar,
 * Database-export modal) call a host-provided `runStreamedExport`
 * which resolves to a Blob ready for download.
 *
 * XLSX is intentionally not handled here — it stays a client-side
 * pipeline because `write-excel-file` produces binary output directly
 * from typed cells.
 */

import type { TableInfo } from './types';

export type StreamedExportFormat = 'csv' | 'json' | 'sql' | 'xml';
export type StreamedCsvDelimiter = 'comma' | 'semicolon' | 'tab';

export type StreamedExportScope =
  | {
      kind: 'statement';
      sql: string;
      label?: string;
      table?: TableInfo;
    }
  | {
      kind: 'tables';
      tables: TableInfo[];
    };

export interface StreamedExportRequest {
  sessionId: string;
  format: StreamedExportFormat;
  csvDelimiter: StreamedCsvDelimiter;
  scope: StreamedExportScope;
  /** When `format === 'sql'`, controls whether the server emits the
   *  `CREATE TABLE` block before the `INSERT` rows. Ignored by other
   *  formats. Defaults to `true` when omitted. */
  includeDdl?: boolean;
}

export interface StreamedExportResult {
  blob: Blob;
  /** Backend-suggested filename. Host editions usually compute it but
   *  consumers can override. */
  suggestedFilename: string;
}

export type StreamedExportRunner = (
  req: StreamedExportRequest,
) => Promise<StreamedExportResult>;

const FORMAT_MIME: Record<StreamedExportFormat, string> = {
  csv: 'text/csv',
  json: 'application/json',
  sql: 'application/sql',
  xml: 'application/xml',
};

/** Builds a 14-char `YYYYMMDDHHMMSS` stamp used in the default
 *  filename when the backend doesn't supply one. */
export function exportStamp(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

export function defaultExportFilename(format: StreamedExportFormat, prefix = 'plamenix-export'): string {
  return `${prefix}-${exportStamp()}.${format}`;
}

export function mimeFor(format: StreamedExportFormat): string {
  return FORMAT_MIME[format];
}

/** Triggers a browser download for a Blob. No-op in non-DOM contexts. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
