import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildJsonBody,
  registerBuiltinJsonExport,
  unregisterBuiltinJsonExport,
} from './json-export.js';
import {
  pluginContributionsToExportButtons,
  type ExportFormatArgs,
  type ExportFormatPayload,
} from '../export-format-contract.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry, registerContributions } from '../../plugin-react/registry.js';
import type { ColumnDescription, Row } from '../types.js';

const COLUMNS: ColumnDescription[] = [
  { name: 'ID' },
  { name: 'NAME' },
  { name: 'EMAIL' },
];

const ROWS: Row[] = [
  {
    cells: [
      { type: 'integer', value: '1' },
      { type: 'text', value: 'Alice' },
      { type: 'null' },
    ],
  },
  {
    cells: [
      { type: 'integer', value: '2' },
      { type: 'text', value: 'Bob "the Builder"' },
      { type: 'text', value: 'bob@example.com' },
    ],
  },
];

function args(): ExportFormatArgs {
  return { columns: COLUMNS, rows: ROWS };
}

function exportContributions() {
  return registry.getContributions<ExportFormatPayload>('export_formats');
}

describe('builtin JSON export (I4.3)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    unregisterBuiltinJsonExport();
    registry.__reset();
  });

  it('registers at export_formats under the built-in namespace with id "json"', () => {
    registerBuiltinJsonExport();
    const contributions = exportContributions();
    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.pluginId).toBe('@plamenix-builtin/json-export');
    expect(isBuiltinPlugin(contributions[0]?.pluginId ?? '')).toBe(true);
    expect(contributions[0]?.contribution.id).toBe('json');
    expect(contributions[0]?.contribution.priority).toBe(100);
  });

  it('exportRows returns 2-space-indented JSON body + application/json mime + timestamped filename', async () => {
    registerBuiltinJsonExport();
    const [contribution] = exportContributions();
    const result = await contribution!.contribution.payload.exportRows(args());
    expect(result.mimeType).toBe('application/json');
    expect(result.filename).toMatch(/^plamenix-result-\d{8}-\d{6}\.json$/);
    const parsed = JSON.parse(result.body as string);
    expect(parsed).toEqual([
      { ID: '1', NAME: 'Alice', EMAIL: null },
      { ID: '2', NAME: 'Bob "the Builder"', EMAIL: 'bob@example.com' },
    ]);
  });

  it('preserves 2-space indentation', () => {
    const body = buildJsonBody(args());
    // First indent under array open is 2 spaces; first key is `"ID"`.
    expect(body.split('\n')[1]).toBe('  {');
    // Integers are quoted: see cellToJson — a BIGINT cannot survive a
    // JSON number, so the projection keeps them uniformly as text.
    expect(body.split('\n')[2]).toBe('    "ID": "1",');
  });

  it('renders every ColumnValue type with the expected JSON projection', () => {
    const cols: ColumnDescription[] = [
      { name: 'A' },
      { name: 'B' },
      { name: 'C' },
      { name: 'D' },
      { name: 'E' },
    ];
    const rows: Row[] = [
      {
        cells: [
          { type: 'null' },
          { type: 'integer', value: '42' },
          { type: 'float', value: 3.14 },
          { type: 'bool', value: false },
          {
            type: 'blob',
            value: { id: 'b1', sizeBytes: 9, peekHex: 'cafef00d' },
          },
        ],
      },
    ];
    const parsed = JSON.parse(buildJsonBody({ columns: cols, rows }));
    expect(parsed).toEqual([
      {
        A: null,
        B: '42',
        C: 3.14,
        D: false,
        E: 'BLOB(9 bytes, peek=0xcafef00d)',
      },
    ]);
  });

  it('button label/title/icon match the legacy hardcoded entry', () => {
    registerBuiltinJsonExport();
    const [button] = pluginContributionsToExportButtons(exportContributions());
    expect(button?.label).toBe('JSON');
    expect(button?.title).toBe('Download as JSON');
    expect(button?.icon).toBeDefined();
  });

  it('third-party JSON exporter interleaves by priority + dedups by local id at the toolbar', () => {
    registerBuiltinJsonExport();
    registerContributions('com.example.streaming-json', {
      export_formats: [
        {
          id: 'json',
          priority: 50,
          payload: {
            label: 'Streaming JSON',
            title: 'Streaming JSON exporter',
            exportRows: async () => ({
              filename: 'streamed.json',
              mimeType: 'application/json',
              body: '[]',
            }),
          },
        },
      ],
    });
    const buttons = pluginContributionsToExportButtons(exportContributions());
    expect(buttons.map((b) => b.id)).toEqual([
      'com.example.streaming-json:json',
      '@plamenix-builtin/json-export:json',
    ]);
  });

  it('teardown unregisters cleanly + re-register works', () => {
    const teardown = registerBuiltinJsonExport();
    teardown();
    expect(exportContributions()).toHaveLength(0);
    expect(() => registerBuiltinJsonExport()).not.toThrow();
    expect(exportContributions()).toHaveLength(1);
  });
});
