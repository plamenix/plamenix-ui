import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildSqlBody,
  registerBuiltinSqlExport,
  unregisterBuiltinSqlExport,
} from './sql-export.js';
import {
  pluginContributionsToExportButtons,
  type ExportFormatArgs,
  type ExportFormatPayload,
} from '../export-format-contract.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry } from '../../plugin-react/registry.js';
import type { ColumnDescription, Row, TableInfo } from '../types.js';

const COLUMNS: ColumnDescription[] = [
  { name: 'ID' },
  { name: 'NAME' },
  { name: 'NOTE' },
];

const ROWS: Row[] = [
  {
    cells: [
      { type: 'integer', value: 1 },
      { type: 'text', value: 'Alice' },
      { type: 'null' },
    ],
  },
  {
    cells: [
      { type: 'integer', value: 2 },
      { type: 'text', value: "O'Brien" },
      { type: 'text', value: 'note two' },
    ],
  },
];

const TABLE: TableInfo = {
  name: 'CUSTOMERS',
  kind: 'table',
  columns: [
    { name: 'ID', position: 0, sqlType: 'INTEGER', nullable: false },
    { name: 'NAME', position: 1, sqlType: 'VARCHAR(50)', nullable: false },
    { name: 'NOTE', position: 2, sqlType: 'VARCHAR(255)', nullable: true },
  ],
  primaryKey: ['ID'],
};

function exportContributions() {
  return registry.getContributions<ExportFormatPayload>('export_formats');
}

describe('builtin SQL export (I4.4)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    unregisterBuiltinSqlExport();
    registry.__reset();
  });

  it('registers at export_formats under the built-in namespace with id "sql"', () => {
    registerBuiltinSqlExport();
    const contributions = exportContributions();
    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.pluginId).toBe('@plamenix-builtin/sql-export');
    expect(isBuiltinPlugin(contributions[0]?.pluginId ?? '')).toBe(true);
    expect(contributions[0]?.contribution.id).toBe('sql');
    expect(contributions[0]?.contribution.priority).toBe(100);
  });

  it('button label/title/icon match the legacy hardcoded entry', () => {
    registerBuiltinSqlExport();
    const [button] = pluginContributionsToExportButtons(exportContributions());
    expect(button?.label).toBe('SQL');
    expect(button?.title).toContain('INSERT');
    expect(button?.icon).toBeDefined();
  });

  it('exportRows returns SQL body with INSERTs + application/sql mime + timestamped filename', async () => {
    registerBuiltinSqlExport();
    const [contribution] = exportContributions();
    const args: ExportFormatArgs = { columns: COLUMNS, rows: ROWS, tableInfo: TABLE };
    const result = await contribution!.contribution.payload.exportRows(args);
    expect(result.mimeType).toBe('application/sql');
    expect(result.filename).toMatch(/^plamenix-result-\d{8}-\d{6}\.sql$/);
    const body = result.body as string;
    expect(body).toContain('INSERT INTO "CUSTOMERS"');
    // Single quote in literal doubled per SQL escaping.
    expect(body).toContain(`'O''Brien'`);
    expect(body).toContain('NULL');
  });

  it('emits CREATE TABLE DDL when includeDdl is true and tableInfo is present', () => {
    const args: ExportFormatArgs = {
      columns: COLUMNS,
      rows: ROWS,
      tableInfo: TABLE,
      includeDdl: true,
    };
    const body = buildSqlBody(args);
    expect(body).toContain('-- DDL');
    expect(body).toContain('CREATE TABLE "CUSTOMERS" (');
    expect(body).toContain('"ID" INTEGER NOT NULL,');
    expect(body).toContain('"NAME" VARCHAR(50) NOT NULL,');
    expect(body).toContain('"NOTE" VARCHAR(255),');
    expect(body).toContain('PRIMARY KEY ("ID")');
  });

  it('skips DDL when includeDdl is false even if tableInfo is present', () => {
    const args: ExportFormatArgs = {
      columns: COLUMNS,
      rows: ROWS,
      tableInfo: TABLE,
      includeDdl: false,
    };
    const body = buildSqlBody(args);
    expect(body).not.toContain('CREATE TABLE');
    expect(body).toContain('INSERT INTO "CUSTOMERS"');
  });

  it('uses <TABLE> placeholder + skips DDL when tableInfo is absent', () => {
    const args: ExportFormatArgs = {
      columns: COLUMNS,
      rows: ROWS,
      includeDdl: true,
    };
    const body = buildSqlBody(args);
    expect(body).not.toContain('CREATE TABLE');
    expect(body).toContain('-- Data for <TABLE>');
    expect(body).toContain('INSERT INTO <TABLE>');
  });

  it('omits PRIMARY KEY clause when tableInfo.primaryKey is missing or empty', () => {
    const tableNoPk: TableInfo = { ...TABLE, primaryKey: [] };
    const body = buildSqlBody({
      columns: COLUMNS,
      rows: ROWS,
      tableInfo: tableNoPk,
      includeDdl: true,
    });
    expect(body).not.toContain('PRIMARY KEY');
    expect(body).toContain('CREATE TABLE "CUSTOMERS"');
  });

  it('renders every ColumnValue type with the expected SQL literal form', () => {
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
          { type: 'integer', value: 42 },
          { type: 'float', value: 3.14 },
          { type: 'bool', value: true },
          {
            type: 'blob',
            value: { id: 'b1', sizeBytes: 9, peekHex: 'cafef00d' },
          },
        ],
      },
    ];
    const body = buildSqlBody({ columns: cols, rows });
    expect(body).toContain(
      'VALUES (NULL, 42, 3.14, TRUE, /* BLOB(9 bytes, peek=0xcafef00d) */ NULL);',
    );
  });

  it('teardown unregisters cleanly + re-register works', () => {
    const teardown = registerBuiltinSqlExport();
    teardown();
    expect(exportContributions()).toHaveLength(0);
    expect(() => registerBuiltinSqlExport()).not.toThrow();
    expect(exportContributions()).toHaveLength(1);
  });
});
