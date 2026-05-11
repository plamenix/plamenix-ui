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
  /** Optional encryption key for at-rest-encrypted databases.
   *  Empty string means "no key supplied"; the host treats `''` and
   *  `undefined` identically. */
  encryptionKey: string;
  /** When true, the host refuses to connect to a database whose
   *  `MON$CRYPT_STATE` is not `1` (encrypted). */
  encryptionRequired: boolean;
}

/** A saved connection profile.
 *
 *  Shape mirrors the `Profile` struct in `plamenix-profiles` after serde
 *  `rename_all = "camelCase"`. The two `*KeyringRef` fields are optional
 *  because the web edition's profile store doesn't carry them. */
export interface Profile {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  encryptionRequired: boolean;
  pureRust: boolean;
  passwordKeyringRef?: string;
  encryptionKeyKeyringRef?: string;
}

/** Encryption state of the attached database, mirroring
 *  `MON$DATABASE.MON$CRYPT_STATE`. */
export type CryptState =
  | 'unencrypted'
  | 'encrypted'
  | 'decrypt_in_progress'
  | 'encrypt_in_progress';

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

/** Catalogue of tables and views visible to the active session.
 *  Mirrors `plamenix_types::Schema`. */
export interface Schema {
  tables: TableInfo[];
}

/** Persistent base table vs view, per `RDB$RELATION_TYPE`. */
export type TableKind = 'table' | 'view';

/** One table or view from `RDB$RELATIONS`. */
export interface TableInfo {
  name: string;
  kind: TableKind;
  columns: ColumnInfo[];
}

/** One column from `RDB$RELATION_FIELDS`/`RDB$FIELDS`. */
export interface ColumnInfo {
  name: string;
  position: number;
  sqlType: string;
  nullable: boolean;
}

/** DDL action the schema browser surfaces on its per-table context
 *  menu. The browser itself never executes SQL — the host translates
 *  the action into a concrete statement and routes it through the
 *  usual `execute` path. */
export type TableAction = 'drop' | 'alter' | 'create-index';

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
