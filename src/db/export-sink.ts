import { triggerDownload } from './cell-format.js';
import { useToastStore } from '../toast/toast-store.js';

/**
 * Where an exported file goes.
 *
 * The export builders (result grid, whole-database export, plugin
 * formats) produce `filename + mime + contents`; *where that lands* is
 * an edition concern. In a browser the default sink is a plain
 * download; a desktop shell registers a real sink with
 * {@link setExportFileSink} — typically a native save dialog plus a
 * file write — so exports behave like a desktop tool instead of
 * silently dropping a file into the platform's Downloads folder with
 * no confirmation at all (plamenix-desktop: the Export dropdown looked
 * inert precisely because that drop was invisible).
 */

/** A file an export wants to write. `contents` is text in the
 *  caller's encoding or raw bytes (XLSX). */
export interface ExportFileRequest {
  /** Suggested file name, extension included. */
  filename: string;
  mime: string;
  contents: string | Uint8Array;
}

/** Outcome of one export write. */
export interface ExportFileResult {
  ok: boolean;
  /** Where the file was written. The default browser sink reports
   *  `null` (the browser chose the location); a dialog-based sink
   *  reports the picked path. */
  path: string | null;
  /** True when the user backed out of the save — not an error, and
   *  nothing should complain about it. */
  canceled: boolean;
}

/** Wire mime type per built-in export format — the save sink uses it
 *  for the file-dialog filter and the default download's blob header. */
export const EXPORT_MIME = {
  csv: 'text/csv',
  json: 'application/json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sql: 'application/sql',
  xml: 'application/xml',
} as const;

/** An edition-supplied writer. Implementations must not throw for a
 *  user cancel: report `{ ok: false, canceled: true }`. Real failures
 *  (unwritable path, disk full) may throw — the caller surfaces the
 *  message in the grid's inline export-error banner. */
export type ExportFileSink = (request: ExportFileRequest) => Promise<ExportFileResult>;

let sink: ExportFileSink | null = null;

/** Installs the edition's export writer. Pass `null` to restore the
 *  default browser download. Idempotent; hosts call it once at boot. */
export function setExportFileSink(next: ExportFileSink | null): void {
  sink = next;
}

/** Writes an export through the registered sink, falling back to the
 *  browser download when no sink is installed. */
export async function saveExportFile(request: ExportFileRequest): Promise<ExportFileResult> {
  const active = sink;
  if (!active) {
    triggerDownload(request.contents, request.filename, request.mime);
    return { ok: true, path: null, canceled: false };
  }
  return active(request);
}

/** Success notice for one export. Cancels stay silent — backing out of
 *  a save dialog is a decision, not an event — and the default sink's
 *  `null` path falls back to the suggested file name, since that is
 *  the best description a browser download can offer. */
export function notifyExportSaved(
  rows: number | null,
  result: ExportFileResult,
  fallbackFilename: string,
): void {
  if (!result.ok || result.canceled) return;
  const where = result.path ?? fallbackFilename;
  useToastStore.getState().push({
    kind: 'notice',
    tone: 'success',
    title: rows === null ? `Saved ${where}` : `Exported ${rows} rows → ${where}`,
  });
}
