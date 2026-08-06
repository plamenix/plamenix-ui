/**
 * Built-in XML export (I4.5) — fourth export-format extraction. Moves
 * the formerly-hardcoded `downloadXml` toolbar branch in
 * `ResultTable.tsx` behind an `export_formats` registry contribution
 * under `@plamenix-builtin/xml-export`.
 *
 * Visual + behaviour parity with the legacy hardcoded button: same
 * `FileCode` icon, same `XML` label, same `plamenix-result-…xml`
 * filename, `application/xml` mime, same `<rows><row><col
 * name="...">…</col></row></rows>` shape. NULL cells get `null="true"`
 * attribute + empty body (mirrors legacy `toXml`); attribute values
 * pass through `escapeXml` to guard `&`, `<`, `>`, `"`, `'`.
 *
 * **Safety-net pattern**: the legacy `downloadXml` switch-branch in
 * `ResultTable` stays as a fallback; toolbar dedup-by-id makes this
 * built-in the primary `xml` button when registered.
 */

import { FileCode } from 'lucide-react';
import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import {
  cellToXmlText,
  escapeXml,
  timestampFilename,
} from '../cell-format.js';
import type {
  ExportFormatArgs,
  ExportFormatPayload,
  ExportFormatResult,
} from '../export-format-contract.js';

const BUILTIN_NAME = 'xml-export';

/** Body builder split from the React payload so unit tests can drive
 *  it directly. */
export function buildXmlBody(args: ExportFormatArgs): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<rows>');
  for (const row of args.rows) {
    lines.push('  <row>');
    args.columns.forEach((c, i) => {
      const cell = row.cells[i];
      const nullAttr = !cell || cell.type === 'null' ? ' null="true"' : '';
      const text = cell && cell.type !== 'null' ? escapeXml(cellToXmlText(cell)) : '';
      lines.push(
        `    <col name="${escapeXml(c.name)}"${nullAttr}>${text}</col>`,
      );
    });
    lines.push('  </row>');
  }
  lines.push('</rows>');
  return lines.join('\n') + '\n';
}

const xmlPayload: ExportFormatPayload = {
  label: 'XML',
  title: 'Download as XML',
  icon: FileCode,
  exportRows: async (args: ExportFormatArgs): Promise<ExportFormatResult> => ({
    filename: timestampFilename('xml'),
    mimeType: 'application/xml',
    body: buildXmlBody(args),
  }),
};

export function registerBuiltinXmlExport(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    export_formats: [
      {
        id: 'xml',
        priority: 100,
        payload: xmlPayload,
      },
    ],
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

export function unregisterBuiltinXmlExport(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
