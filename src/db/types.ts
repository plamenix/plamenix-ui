/**
 * Shared types for the database UI surface.
 *
 * Wire shapes are owned by Rust (`plamenix-core`) and emitted into
 * `generated.ts` by `plamenix-ts-gen`. This module re-exports the
 * generated names alongside the UI-only types that have no Rust mirror
 * (`ConnectionForm`, `TableAction`) and the `renderCell` helper used
 * throughout the table surface.
 */

export type {
  AttachmentInfo,
  BlobRef,
  Column as ColumnDescription,
  ColumnInfo,
  ColumnValue,
  CryptState,
  DatabaseAlias,
  DatabaseStats,
  DomainInfo,
  GeneratorInfo,
  HistoryEntry,
  ListAliasesResult,
  MonDatabase,
  ProcedureInfo,
  Profile,
  ProfileId,
  QueryResult,
  Row,
  Schema,
  SessionId,
  StatementInfo,
  StatementOutcome,
  TabId,
  TableInfo,
  TableKind,
  TestConnectionResult,
  TriggerInfo,
} from './generated';

import type {
  ColumnValue,
  DomainInfo,
  GeneratorInfo,
  ProcedureInfo,
  TableInfo,
  TriggerInfo,
} from './generated';

/** State backing the connection form.
 *
 *  Distinct from the Rust `ConnectionConfig`: the form additionally
 *  carries `pureRust` and `password` / `encryptionKey` in cleartext, and
 *  uses `camelCase` field names because it round-trips through the UI
 *  unchanged. */
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
  /** Absolute path to the Firebird native client library
   *  (`libfbclient.so` / `.dylib` / `fbclient.dll`). Empty string
   *  means "auto-detect via the usual `PLAMENIX_FBCLIENT_PATH` chain".
   *  Ignored when `pureRust` is true (rsfbclient's pure-Rust backend
   *  never loads a native library). */
  fbclientPath: string;
  /** Wire charset for the session. Default `UTF8`. Affects how the
   *  driver decodes legacy single-byte-encoded text columns (e.g.
   *  `WIN1250` for Croatian / Czech / Polish databases that predate
   *  UTF8 collations). */
  charset: string;
  /** When true, attach via Firebird's embedded engine — `database`
   *  is a local file path; `host` and `port` are ignored; the OS
   *  user becomes the attached user (no password). Exclusive access
   *  only. Native mode required. */
  embedded: boolean;
}

/** Charset choices surfaced by the connection dialog. Values match
 *  `rsfbclient_core::Charset::from_str` exactly; passing any other
 *  value yields a "doesn't represent any charset" error at attach
 *  time. */
export const SUPPORTED_CHARSETS: readonly string[] = [
  'UTF8',
  'ISO8859_1',
  'ISO8859_2',
  'ISO8859_3',
  'ISO8859_4',
  'ISO8859_5',
  'ISO8859_6',
  'ISO8859_7',
  'ISO8859_13',
  'WIN1250',
  'WIN1251',
  'WIN1252',
  'WIN1253',
  'WIN1254',
  'WIN1256',
  'WIN1257',
  'WIN1258',
  'ASCII',
  'KOI8R',
  'KOI8U',
  'EUCJP',
  'BIG5_2003',
];

/** DDL action the schema browser surfaces on its per-table context
 *  menu. The browser itself never executes SQL — the host translates
 *  the action into a concrete statement and routes it through the
 *  usual `execute` path. */
export type TableAction = 'drop' | 'alter' | 'create-index';

/** Right-click DDL action across every schema-browser object kind.
 *  The schema browser emits one of these and the host turns it into a
 *  concrete SQL template (or, for `drop`, runs it after confirm). */
export type SchemaAction =
  | {
      kind: 'table';
      action: 'drop' | 'alter' | 'create-index' | 'recreate' | 'recompute-statistics';
      target: TableInfo;
    }
  | {
      kind: 'view';
      action: 'drop' | 'alter' | 'show-source';
      target: TableInfo;
    }
  | {
      kind: 'procedure';
      action: 'execute' | 'alter' | 'drop' | 'show-source';
      target: ProcedureInfo;
    }
  | {
      kind: 'trigger';
      action: 'toggle-active' | 'drop' | 'show-source';
      target: TriggerInfo;
    }
  | {
      kind: 'generator';
      action: 'next-value' | 'reset' | 'drop';
      target: GeneratorInfo;
    }
  | {
      kind: 'generator';
      action: 'set-value';
      target: GeneratorInfo;
      /** New target value for the generator counter, as exact decimal
       *  text — a generator is a BIGINT and does not fit a JS number.
       *
       *  This is interpolated into DDL, so it must already have passed
       *  `parseExactInt`, which admits only an optional sign followed by
       *  digits within the signed 64-bit range. Never assign a raw draft
       *  string here. */
      value: string;
      /** Active engine version string (e.g. `'3.0.7'`). Drives the
       *  dialect choice in {@link schemaDdl}: ALTER SEQUENCE RESTART
       *  WITH for FB 3+, SET GENERATOR TO for older. `null` defaults
       *  to the modern form. */
      engineVersion: string | null;
    }
  | { kind: 'domain'; action: 'alter-type' | 'drop'; target: DomainInfo };

/** Renders a cell value as a string for display. */
export function renderCell(cell: ColumnValue): string {
  switch (cell.type) {
    case 'null':
      return 'NULL';
    case 'text':
      return cell.value;
    case 'integer':
      return String(cell.value);
    case 'float':
      return cell.value === null ? 'NULL' : String(cell.value);
    case 'bool':
      return cell.value ? 'true' : 'false';
    case 'blob':
      return `0x${cell.value.peekHex}${cell.value.sizeBytes > cell.value.peekHex.length / 2 ? '…' : ''}`;
  }
}
