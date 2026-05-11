/**
 * Shared types for the database UI surface.
 *
 * These mirror the shapes returned by `plamenix-db` (Rust) over either
 * transport. Keep them in sync with `plamenix-core/crates/plamenix-db`
 * — once Specta-generated types land, this file will be replaced by the
 * generated output and deleted by hand.
 */

/** State backing the connection form. */
export interface ConnectionForm {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  pureRust: boolean;
}

/** Column metadata as reported by Firebird. */
export interface ColumnDescription {
  name: string;
}

/** One typed cell value in a query result row. */
export type ColumnValue =
  | { type: 'null' }
  | { type: 'text'; value: string }
  | { type: 'integer'; value: number }
  | { type: 'float'; value: number }
  | { type: 'bool'; value: boolean }
  | { type: 'blob'; value: string };

/** A single result row. */
export interface Row {
  cells: ColumnValue[];
}

/** Result of `db.execute`. */
export type QueryResult =
  | { Rows: { columns: ColumnDescription[]; rows: Row[] } }
  | { Affected: { rows: number } };

/** Renders a cell value as a string for display. */
export function renderCell(cell: ColumnValue): string {
  switch (cell.type) {
    case 'null':
      return 'NULL';
    case 'text':
      return cell.value;
    case 'integer':
    case 'float':
      return String(cell.value);
    case 'bool':
      return cell.value ? 'true' : 'false';
    case 'blob':
      return `0x${cell.value.slice(0, 32)}${cell.value.length > 32 ? '…' : ''}`;
  }
}
