/**
 * Built-in JSON export (I4.3) — second export-format extraction. Moves
 * the formerly-hardcoded `downloadJson` toolbar branch in
 * `ResultTable.tsx` behind an `export_formats` registry contribution
 * under `@plamenix-builtin/json-export`.
 *
 * Visual + behaviour parity with the legacy hardcoded button: same
 * `FileJson` icon, same `JSON` label, same
 * `plamenix-result-…json` filename, `application/json` mime, two-space
 * indentation, `cellToJson` per-cell formatter (re-used verbatim from
 * `cell-format.ts`). The emitted body is an array of row objects keyed
 * by column name — identical to `toJson` in the legacy toolbar.
 *
 * **Safety-net pattern**: the legacy `downloadJson` switch-branch in
 * `ResultTable` stays as a fallback. The toolbar dedups by `id` so
 * once this built-in registers, its contribution shadows the
 * hardcoded `json` button (the safety net only fires when the
 * built-in is not registered — currently only in test envs that never
 * mount `ResultTable`).
 */

import { FileJson } from 'lucide-react';
import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import { cellToJson, timestampFilename } from '../cell-format.js';
import type {
  ExportFormatArgs,
  ExportFormatPayload,
  ExportFormatResult,
} from '../export-format-contract.js';

const BUILTIN_NAME = 'json-export';

/** Body builder split from the React payload so unit tests can call
 *  it without the registry/toolbar wiring. */
export function buildJsonBody(args: ExportFormatArgs): string {
  return JSON.stringify(
    args.rows.map((r) => {
      const obj: Record<string, unknown> = {};
      args.columns.forEach((c, i) => {
        obj[c.name] = cellToJson(r.cells[i]);
      });
      return obj;
    }),
    null,
    2,
  );
}

const jsonPayload: ExportFormatPayload = {
  label: 'JSON',
  title: 'Download as JSON',
  icon: FileJson,
  exportRows: async (args: ExportFormatArgs): Promise<ExportFormatResult> => ({
    filename: timestampFilename('json'),
    mimeType: 'application/json',
    body: buildJsonBody(args),
  }),
};

/** Registers the built-in JSON export. Returns a teardown closure for
 *  `useEffect` pairing. */
export function registerBuiltinJsonExport(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    export_formats: [
      {
        id: 'json',
        priority: 100,
        payload: jsonPayload,
      },
    ],
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

export function unregisterBuiltinJsonExport(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
