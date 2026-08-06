import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildXmlBody,
  registerBuiltinXmlExport,
  unregisterBuiltinXmlExport,
} from './xml-export.js';
import {
  pluginContributionsToExportButtons,
  type ExportFormatArgs,
  type ExportFormatPayload,
} from '../export-format-contract.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry } from '../../plugin-react/registry.js';
import type { ColumnDescription, Row } from '../types.js';

const COLUMNS: ColumnDescription[] = [
  { name: 'ID' },
  { name: 'NAME & TITLE' },
];

const ROWS: Row[] = [
  {
    cells: [
      { type: 'integer', value: '1' },
      { type: 'text', value: 'Alice <admin>' },
    ],
  },
  {
    cells: [
      { type: 'integer', value: '2' },
      { type: 'null' },
    ],
  },
];

function exportContributions() {
  return registry.getContributions<ExportFormatPayload>('export_formats');
}

describe('builtin XML export (I4.5)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    unregisterBuiltinXmlExport();
    registry.__reset();
  });

  it('registers at export_formats under the built-in namespace with id "xml"', () => {
    registerBuiltinXmlExport();
    const contributions = exportContributions();
    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.pluginId).toBe('@plamenix-builtin/xml-export');
    expect(isBuiltinPlugin(contributions[0]?.pluginId ?? '')).toBe(true);
    expect(contributions[0]?.contribution.id).toBe('xml');
    expect(contributions[0]?.contribution.priority).toBe(100);
  });

  it('button label/title/icon match the legacy hardcoded entry', () => {
    registerBuiltinXmlExport();
    const [button] = pluginContributionsToExportButtons(exportContributions());
    expect(button?.label).toBe('XML');
    expect(button?.title).toBe('Download as XML');
    expect(button?.icon).toBeDefined();
  });

  it('exportRows returns valid XML + application/xml mime + timestamped filename', async () => {
    registerBuiltinXmlExport();
    const [contribution] = exportContributions();
    const args: ExportFormatArgs = { columns: COLUMNS, rows: ROWS };
    const result = await contribution!.contribution.payload.exportRows(args);
    expect(result.mimeType).toBe('application/xml');
    expect(result.filename).toMatch(/^plamenix-result-\d{8}-\d{6}\.xml$/);
    const body = result.body as string;
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain('<rows>');
    expect(body).toContain('</rows>');
  });

  it('escapes attribute values + text content per escapeXml', () => {
    const body = buildXmlBody({ columns: COLUMNS, rows: ROWS });
    // Column name `NAME & TITLE` escaped in the `name=...` attribute.
    expect(body).toContain('name="NAME &amp; TITLE"');
    // `Alice <admin>` escaped in the cell text.
    expect(body).toContain('>Alice &lt;admin&gt;</col>');
  });

  it('marks null cells with null="true" + empty body', () => {
    const body = buildXmlBody({ columns: COLUMNS, rows: ROWS });
    // Row 2's second column is null.
    expect(body).toContain('<col name="NAME &amp; TITLE" null="true"></col>');
  });

  it('renders every ColumnValue type with the right XML text', () => {
    const cols: ColumnDescription[] = [
      { name: 'A' },
      { name: 'B' },
      { name: 'C' },
      { name: 'D' },
    ];
    const rows: Row[] = [
      {
        cells: [
          { type: 'integer', value: '42' },
          { type: 'float', value: 3.14 },
          { type: 'bool', value: true },
          {
            type: 'blob',
            value: { id: 'b1', sizeBytes: 9, peekHex: 'cafef00d' },
          },
        ],
      },
    ];
    const body = buildXmlBody({ columns: cols, rows });
    expect(body).toContain('<col name="A">42</col>');
    expect(body).toContain('<col name="B">3.14</col>');
    expect(body).toContain('<col name="C">true</col>');
    // BLOB summary contains an opening paren the escaper leaves alone
    // but the inner quoted hex is wrapped by `BLOB(N bytes, peek=0x…)`.
    expect(body).toContain('<col name="D">BLOB(9 bytes, peek=0xcafef00d)</col>');
  });

  it('teardown unregisters cleanly + re-register works', () => {
    const teardown = registerBuiltinXmlExport();
    teardown();
    expect(exportContributions()).toHaveLength(0);
    expect(() => registerBuiltinXmlExport()).not.toThrow();
    expect(exportContributions()).toHaveLength(1);
  });
});
