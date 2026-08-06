/**
 * Built-in CSV export (I4.2) — first export-format extraction. Moves
 * the formerly-hardcoded `downloadCsv` toolbar branch in
 * `ResultTable.tsx` behind a `export_formats` registry contribution
 * under `@plamenix-builtin/csv-export`.
 *
 * Visual + behaviour parity with the legacy hardcoded button: same
 * `FileText` icon, same `CSV` label, same field delimiter pulled from
 * `useDisplayStore` (`,` / `;` / `\t`), same `plamenix-result-…csv`
 * filename and `text/csv` mime, same `quoteCsvField` / `cellToCsv`
 * helpers (re-used verbatim). The contract returns a `Blob | string`
 * body that the shell wraps in `triggerDownload`.
 *
 * **Safety-net pattern** (same approach as I4.1's BLOB renderer): the
 * existing `downloadCsv` branch in `ResultTable`'s toolbar `switch`
 * stays as a fallback, plus its hardcoded toolbar button. When this
 * built-in registers (on `ResultTable` mount), its contribution `id`
 * (`csv`) shadows the matching hardcoded entry — the toolbar's
 * dedup-by-id filter drops the legacy button before rendering. Tests
 * and SSR contexts that never mount `ResultTable` keep working through
 * the legacy path. A third-party CSV exporter at higher priority (or
 * same priority but registered first) supersedes the built-in
 * naturally — the toolbar still dedups by `id`, so only one CSV
 * button surfaces.
 *
 * Delimiter read at click time via `useDisplayStore.getState()` rather
 * than re-registering on every store change — keeps registration
 * cheap and avoids tearing the registry-contribution list during a
 * settings panel edit.
 */

import { FileText } from 'lucide-react';
import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import {
  cellToCsv,
  quoteCsvField,
  timestampFilename,
} from '../cell-format.js';
import { useDisplayStore } from '../display-store.js';
import type {
  ExportFormatArgs,
  ExportFormatPayload,
  ExportFormatResult,
} from '../export-format-contract.js';

const BUILTIN_NAME = 'csv-export';

/** Body builder split from the React payload so unit tests can call
 *  it without dragging in the toolbar / store wiring. */
export function buildCsvBody(args: ExportFormatArgs, delimiter: string): string {
  const header = args.columns
    .map((c) => quoteCsvField(c.name, delimiter))
    .join(delimiter);
  const body = args.rows
    .map((r) => r.cells.map((c) => cellToCsv(c, delimiter)).join(delimiter))
    .join('\r\n');
  return `${header}\r\n${body}\r\n`;
}

const csvPayload: ExportFormatPayload = {
  label: 'CSV',
  title: 'Download as CSV',
  icon: FileText,
  exportRows: async (args: ExportFormatArgs): Promise<ExportFormatResult> => {
    const delimiter = useDisplayStore.getState().csvDelimiter;
    return {
      filename: timestampFilename('csv'),
      mimeType: 'text/csv',
      body: buildCsvBody(args, delimiter),
    };
  },
};

/**
 * Registers the built-in CSV export through the shared registry. Call
 * once per shell instance (typically from `ResultTable`'s mount
 * `useEffect`); the returned closure unregisters on unmount.
 */
export function registerBuiltinCsvExport(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    export_formats: [
      {
        id: 'csv',
        priority: 100,
        payload: csvPayload,
      },
    ],
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

/** Explicit teardown — alternative to the returned closure. */
export function unregisterBuiltinCsvExport(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
