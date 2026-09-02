/**
 * Built-in XLSX export (I4.6) — fifth and final hardcoded toolbar
 * format extraction. Moves the formerly-hardcoded `downloadXlsx`
 * branch in `ResultTable.tsx` behind an `export_formats` registry
 * contribution under `@plamenix-builtin/xlsx-export`.
 *
 * Visual + behaviour parity with the legacy hardcoded button: same
 * `FileSpreadsheet` icon, same `XLSX` label, same `plamenix-result-…xlsx`
 * filename, same MIME (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`),
 * same `cellToXlsx` per-cell formatter (re-used verbatim).
 *
 * **Binary path differs from CSV/JSON/SQL/XML**: XLSX is built
 * client-side via `write-excel-file/browser`. The lib's universal API
 * returns `{ toBlob(): Promise<Blob> }` when called without a
 * `fileName` option — the contract returns the Blob directly so the
 * shell's standard `triggerDownload` pipeline handles the anchor
 * click + URL revoke (no double-download). Dynamic import keeps the
 * ~250 kB lib out of the initial bundle — it lands only on first
 * XLSX click. (Same `await import('write-excel-file/browser')` shape
 * as the legacy `downloadXlsx`.)
 *
 * **Safety-net pattern**: the legacy `downloadXlsx` switch-branch in
 * `ResultTable` stays as a fallback; toolbar dedup-by-id makes this
 * built-in the primary `xlsx` button when registered.
 */

import { FileSpreadsheet } from 'lucide-react';
import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import { cellToXlsx, timestampFilename, type XlsxCell } from '../cell-format.js';
import type {
  ExportFormatArgs,
  ExportFormatPayload,
  ExportFormatResult,
} from '../export-format-contract.js';

const BUILTIN_NAME = 'xlsx-export';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Type of the dynamically-imported `write-excel-file/browser`
 *  default export. Narrow enough that the lib's full type surface
 *  does not need to load into the main bundle. */
type WriteXlsx = (
  data: XlsxCell[][],
) => { toBlob: () => Promise<Blob> };

/** Body builder split from the React payload so unit tests can drive
 *  it directly (callers stub `loader` to bypass the dynamic import). */
export async function buildXlsxBlob(
  args: ExportFormatArgs,
  loader: () => Promise<{ default: WriteXlsx }> = () =>
    import('write-excel-file/browser') as unknown as Promise<{ default: WriteXlsx }>,
): Promise<Blob> {
  const mod = await loader();
  const header: XlsxCell[] = args.columns.map((c) => ({ value: c.name }));
  const body: XlsxCell[][] = args.rows.map((r) =>
    args.columns.map((_, i) => cellToXlsx(r.cells[i])),
  );
  return mod.default([header, ...body]).toBlob();
}

const xlsxPayload: ExportFormatPayload = {
  label: 'XLSX',
  title: 'Download as XLSX',
  icon: FileSpreadsheet,
  exportRows: async (args: ExportFormatArgs): Promise<ExportFormatResult> => ({
    filename: timestampFilename('xlsx'),
    mimeType: XLSX_MIME,
    body: await buildXlsxBlob(args),
  }),
};

export function registerBuiltinXlsxExport(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    export_formats: [
      {
        id: 'xlsx',
        priority: 100,
        payload: xlsxPayload,
      },
    ],
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

export function unregisterBuiltinXlsxExport(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
