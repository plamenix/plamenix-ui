import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildCsvBody,
  registerBuiltinCsvExport,
  unregisterBuiltinCsvExport,
} from './csv-export.js';
import {
  pluginContributionsToExportButtons,
  type ExportFormatArgs,
  type ExportFormatPayload,
} from '../export-format-contract.js';
import { useDisplayStore } from '../display-store.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry, registerContributions } from '../../plugin-react/registry.js';
import type { ColumnInfo, Row } from '../types.js';

const COLUMNS: ColumnInfo[] = [
  { name: 'ID', position: 0, sqlType: 'INTEGER', nullable: false },
  { name: 'NAME', position: 1, sqlType: 'VARCHAR(50)', nullable: true },
  { name: 'NOTE', position: 2, sqlType: 'VARCHAR(255)', nullable: true },
];

const ROWS: Row[] = [
  {
    cells: [
      { type: 'integer', value: '1' },
      { type: 'text', value: 'Alice' },
      { type: 'text', value: 'hello' },
    ],
  },
  {
    cells: [
      { type: 'integer', value: '2' },
      { type: 'text', value: 'Bob, Jr.' },
      { type: 'text', value: 'line one\nline two' },
    ],
  },
  {
    cells: [
      { type: 'integer', value: '3' },
      { type: 'null' },
      { type: 'text', value: 'has "quotes"' },
    ],
  },
];

function args(rows: Row[] = ROWS): ExportFormatArgs {
  return { columns: COLUMNS, rows };
}

function exportContributions() {
  return registry.getContributions<ExportFormatPayload>('export_formats');
}

describe('builtin CSV export (I4.2)', () => {
  beforeEach(() => {
    registry.__reset();
    useDisplayStore.getState().setCsvDelimiter(',');
  });
  afterEach(() => {
    unregisterBuiltinCsvExport();
    registry.__reset();
    useDisplayStore.getState().setCsvDelimiter(',');
  });

  it('registers at export_formats under the built-in namespace with id "csv"', () => {
    registerBuiltinCsvExport();
    const contributions = exportContributions();
    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.pluginId).toBe('@plamenix-builtin/csv-export');
    expect(isBuiltinPlugin(contributions[0]?.pluginId ?? '')).toBe(true);
    expect(contributions[0]?.contribution.id).toBe('csv');
    expect(contributions[0]?.contribution.priority).toBe(100);
  });

  it('button label/title/icon match the legacy hardcoded toolbar entry', () => {
    registerBuiltinCsvExport();
    const [button] = pluginContributionsToExportButtons(exportContributions());
    expect(button?.label).toBe('CSV');
    expect(button?.title).toBe('Download as CSV');
    expect(button?.icon).toBeDefined();
  });

  it('exportRows returns a CSV body with header + rows + text/csv mime + timestamped filename', async () => {
    registerBuiltinCsvExport();
    const [contribution] = exportContributions();
    const result = await contribution!.contribution.payload.exportRows(args());
    expect(result.mimeType).toBe('text/csv');
    expect(result.filename).toMatch(/^plamenix-result-\d{8}-\d{6}\.csv$/);
    const body = typeof result.body === 'string' ? result.body : '';
    expect(body.split('\r\n')[0]).toBe('ID,NAME,NOTE');
    // Trailing CRLF after the last row.
    expect(body.endsWith('\r\n')).toBe(true);
  });

  it('honours the active csvDelimiter from displayStore at click time', async () => {
    registerBuiltinCsvExport();
    useDisplayStore.getState().setCsvDelimiter(';');
    const [contribution] = exportContributions();
    let body = (await contribution!.contribution.payload.exportRows(args())).body as string;
    expect(body.split('\r\n')[0]).toBe('ID;NAME;NOTE');

    useDisplayStore.getState().setCsvDelimiter('\t');
    body = (await contribution!.contribution.payload.exportRows(args())).body as string;
    expect(body.split('\r\n')[0]).toBe('ID\tNAME\tNOTE');
  });

  it('escapes commas, embedded quotes, and newlines per RFC 4180 quoting rules', () => {
    // Body builder is exposed for unit-testing the escape behaviour
    // without round-tripping through displayStore.
    const body = buildCsvBody(args(), ',');
    const lines = body.split('\r\n');
    expect(lines[1]).toBe('1,Alice,hello');
    // "Bob, Jr." contains a comma → must be quoted.
    expect(lines[2]).toBe('2,"Bob, Jr.","line one\nline two"');
    // null cell empty; double-quotes inside the value doubled.
    expect(lines[3]).toBe('3,,"has ""quotes"""');
  });

  it('renders every ColumnValue type — null/text/integer/float/bool/blob', () => {
    const allTypes: Row[] = [
      {
        cells: [
          { type: 'null' },
          { type: 'text', value: 'hi' },
          { type: 'integer', value: '42' },
        ],
      },
      {
        cells: [
          { type: 'float', value: 3.14 },
          { type: 'bool', value: true },
          {
            type: 'blob',
            value: { id: 'blob-1', sizeBytes: 17, peekHex: 'deadbeef' },
          },
        ],
      },
    ];
    const cols: ColumnInfo[] = [
      { name: 'A', position: 0, sqlType: 'X', nullable: true },
      { name: 'B', position: 1, sqlType: 'X', nullable: true },
      { name: 'C', position: 2, sqlType: 'X', nullable: true },
    ];
    const body = buildCsvBody({ columns: cols, rows: allTypes }, ',');
    const lines = body.split('\r\n');
    expect(lines[0]).toBe('A,B,C');
    expect(lines[1]).toBe(',hi,42');
    // bool → 'true'/'false', blob → quoted human-readable summary
    // (contains the size + hex peek).
    expect(lines[2]).toBe('3.14,true,"BLOB(17 bytes, peek=0xdeadbeef)"');
  });

  it('third-party CSV exporter at lower priority sorts ahead of the built-in (same id, both surface)', () => {
    registerBuiltinCsvExport();
    registerContributions('com.example.faster-csv', {
      export_formats: [
        {
          id: 'csv',
          priority: 50,
          payload: {
            label: 'Faster CSV',
            title: 'Download via streaming CSV writer',
            exportRows: async () => ({
              filename: 'streamed.csv',
              mimeType: 'text/csv',
              body: 'streamed',
            }),
          },
        },
      ],
    });
    const buttons = pluginContributionsToExportButtons(exportContributions());
    expect(buttons.map((b) => b.id)).toEqual([
      'com.example.faster-csv:csv',
      '@plamenix-builtin/csv-export:csv',
    ]);
  });

  it('third-party plugin with a different local id surfaces alongside the built-in', () => {
    registerBuiltinCsvExport();
    registerContributions('com.example.parquet', {
      export_formats: [
        {
          id: 'parquet',
          payload: {
            label: 'Parquet',
            title: 'Apache Parquet columnar export',
            exportRows: async () => ({
              filename: 'out.parquet',
              mimeType: 'application/parquet',
              body: 'binary',
            }),
          },
        },
      ],
    });
    const buttons = pluginContributionsToExportButtons(exportContributions());
    expect(buttons.map((b) => b.id).sort()).toEqual([
      '@plamenix-builtin/csv-export:csv',
      'com.example.parquet:parquet',
    ]);
  });

  it('teardown unregisters cleanly + re-register works (re-init safe)', () => {
    const teardown = registerBuiltinCsvExport();
    teardown();
    expect(exportContributions()).toHaveLength(0);
    expect(() => registerBuiltinCsvExport()).not.toThrow();
    expect(exportContributions()).toHaveLength(1);
  });
});
