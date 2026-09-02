/**
 * Built-in SQL export (I4.4) — third export-format extraction. Moves
 * the formerly-hardcoded `downloadSql` toolbar branch in
 * `ResultTable.tsx` behind an `export_formats` registry contribution
 * under `@plamenix-builtin/sql-export`.
 *
 * Visual + behaviour parity with the legacy hardcoded button: same
 * `FileCode` icon, same `SQL` label, same `plamenix-result-…sql`
 * filename, `application/sql` mime. Body composition mirrors the
 * legacy `toSql`: optional `CREATE TABLE` DDL (gated by the user's
 * "with DDL" toggle, surfaced through `args.includeDdl`), then one
 * `INSERT INTO …` per row. When the result targets an unknown table
 * (no `tableInfo` because the query isn't editable), DDL is skipped
 * and the `INSERT` uses a `<TABLE>` placeholder for find-and-replace.
 *
 * **Safety-net pattern**: the legacy `downloadSql` switch-branch in
 * `ResultTable` stays as a fallback; toolbar dedup-by-id makes this
 * built-in the primary `sql` button when registered.
 */

import { FileCode } from 'lucide-react';
import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import {
  cellToSqlLiteral,
  quoteIdentForExport,
  timestampFilename,
} from '../cell-format.js';
import type {
  ExportFormatArgs,
  ExportFormatPayload,
  ExportFormatResult,
} from '../export-format-contract.js';

const BUILTIN_NAME = 'sql-export';

/** Body builder split from the React payload so unit tests can drive
 *  it directly. */
export function buildSqlBody(args: ExportFormatArgs): string {
  const tableInfo = args.tableInfo;
  const tableName = tableInfo?.name ?? '<TABLE>';
  const ident = tableInfo ? quoteIdentForExport(tableInfo.name) : '<TABLE>';
  const colList = args.columns
    .map((c) => quoteIdentForExport(c.name))
    .join(', ');
  const out: string[] = [];
  if (tableInfo && args.includeDdl) {
    out.push(`-- DDL`);
    out.push(`CREATE TABLE ${ident} (`);
    tableInfo.columns.forEach((c, i, arr) => {
      const tail = i === arr.length - 1 ? '' : ',';
      out.push(
        `    ${quoteIdentForExport(c.name)} ${c.sqlType}${c.nullable ? '' : ' NOT NULL'}${tail}`,
      );
    });
    const pk = tableInfo.primaryKey ?? [];
    if (pk.length > 0) {
      out[out.length - 1] += ',';
      out.push(
        `    PRIMARY KEY (${pk.map(quoteIdentForExport).join(', ')})`,
      );
    }
    out.push(`);`);
    out.push(``);
  }
  out.push(`-- Data for ${tableName}`);
  for (const row of args.rows) {
    const values = args.columns
      .map((_, i) => cellToSqlLiteral(row.cells[i]))
      .join(', ');
    out.push(`INSERT INTO ${ident} (${colList}) VALUES (${values});`);
  }
  return out.join('\n') + '\n';
}

const sqlPayload: ExportFormatPayload = {
  label: 'SQL',
  title: 'Download as SQL (INSERTs, optionally with CREATE TABLE)',
  icon: FileCode,
  exportRows: async (args: ExportFormatArgs): Promise<ExportFormatResult> => ({
    filename: timestampFilename('sql'),
    mimeType: 'application/sql',
    body: buildSqlBody(args),
  }),
};

export function registerBuiltinSqlExport(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    export_formats: [
      {
        id: 'sql',
        priority: 100,
        payload: sqlPayload,
      },
    ],
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

export function unregisterBuiltinSqlExport(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
