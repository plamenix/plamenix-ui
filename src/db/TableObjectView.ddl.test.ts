// @vitest-environment jsdom

/**
 * DDL synthesis from `TableInfo` (plamenix-desktop#4).
 *
 * A column based on a user domain must re-declare the domain, not the
 * domain's expansion: re-running expanded DDL silently detaches the
 * column from its domain, so a later domain change stops propagating.
 * `sqlType` stays the resolved base type — the filter builder and the
 * inline editor read it — so the two fields must not be conflated.
 */

import { describe, expect, it } from 'vitest';
import { buildCreateTableDdl } from './TableObjectView.js';
import type { TableInfo } from './types.js';

function tableWith(columns: Partial<TableInfo['columns'][number]>[]): TableInfo {
  return {
    name: 'tblUuidTest',
    kind: 'table',
    primaryKey: [],
    columns: columns.map((c, i) => ({
      name: `C${i}`,
      position: i,
      sqlType: 'CHAR(16)',
      nullable: true,
      defaultExpr: null,
      ...c,
    })),
  } as unknown as TableInfo;
}

describe('buildCreateTableDdl', () => {
  it('re-declares the domain a column is based on', () => {
    const ddl = buildCreateTableDdl(
      tableWith([
        { name: 'userUuid', sqlType: 'CHAR(16)', domain: 'D_UUID', nullable: false },
      ]),
    );

    expect(ddl).toContain('"userUuid" D_UUID NOT NULL');
    expect(ddl).not.toContain('CHAR(16)');
  });

  it('renders an inline-typed column from sqlType as before', () => {
    const ddl = buildCreateTableDdl(
      tableWith([{ name: 'AMOUNT', sqlType: 'NUMERIC(18,4)' }]),
    );

    expect(ddl).toContain('AMOUNT NUMERIC(18,4)');
  });

  it('quotes a domain whose stored name is not a plain identifier', () => {
    const ddl = buildCreateTableDdl(
      tableWith([{ name: 'V', sqlType: 'VARCHAR(10)', domain: 'd_special name' }]),
    );

    expect(ddl).toContain('V "d_special name"');
  });
});
