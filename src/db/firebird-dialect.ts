/**
 * Firebird 5 SQL dialect for `@codemirror/lang-sql`.
 *
 * Upstream `lang-sql` ships Postgres / MySQL / MSSQL / SQLite / PLSQL
 * dialects but not Firebird, so the editor defines its own. Coverage:
 *
 *  - 250+ DDL/DML/TCL/PSQL keywords
 *  - ~100 built-in functions (aggregate, string, math, datetime, system)
 *  - Firebird 4/5 type names including DECFLOAT, INT128, time-zone types
 *
 * Schema completion (`firebirdSchemaFor`) is built on top: it converts a
 * {@link Schema} into the `{ <table>: [<columns…>] }` shape lang-sql
 * expects for dot-completion. Procedures, generators, triggers, and
 * domains are added as bare-name completions through the `tables` map
 * with no columns so they appear in the top-level identifier list.
 */

import { SQLDialect } from '@codemirror/lang-sql';
import type { Completion } from '@codemirror/autocomplete';
import type { Schema } from './types';

const KEYWORDS = [
  // DDL
  'create', 'alter', 'drop', 'recreate', 'declare', 'comment', 'global', 'temporary',
  // Object kinds
  'table', 'view', 'index', 'trigger', 'procedure', 'function', 'package', 'domain',
  'sequence', 'generator', 'role', 'user', 'exception', 'collation', 'character', 'set',
  'database', 'schema', 'mapping', 'filter', 'plugin',
  // DML
  'select', 'insert', 'update', 'delete', 'merge', 'into', 'values', 'returning',
  'execute', 'block', 'statement', 'matched',
  // TCL
  'commit', 'rollback', 'savepoint', 'release', 'transaction', 'work', 'retain',
  'snapshot', 'concurrency', 'consistency', 'isolation', 'level',
  'wait', 'no', 'lock', 'timeout', 'reserving',
  // Clauses
  'from', 'where', 'group', 'by', 'having', 'order', 'join', 'inner', 'left', 'right',
  'full', 'outer', 'cross', 'on', 'using', 'natural', 'union', 'intersect', 'except',
  'minus', 'all', 'distinct', 'with', 'recursive', 'as',
  // Pagination
  'rows', 'first', 'skip', 'fetch', 'offset', 'only', 'ties', 'next', 'limit',
  // Sort
  'asc', 'desc', 'nulls', 'last',
  // Operators
  'and', 'or', 'not', 'is', 'null', 'true', 'false', 'unknown', 'in', 'like', 'between',
  'exists', 'similar', 'to', 'starting', 'containing', 'escape', 'overlaps',
  // Conditional
  'case', 'when', 'then', 'else', 'end', 'if', 'while', 'do', 'leave', 'break', 'continue',
  // Constraints
  'primary', 'key', 'foreign', 'references', 'unique', 'check', 'constraint', 'default',
  'generated', 'always', 'identity', 'computed', 'preserve', 'restrict', 'cascade', 'action',
  // Permissions
  'grant', 'revoke', 'public', 'admin', 'option', 'role', 'with',
  // Trigger
  'before', 'after', 'active', 'inactive', 'position', 'connect', 'disconnect',
  'transaction', 'start', 'ddl',
  // PSQL
  'begin', 'end', 'variable', 'returns', 'suspend', 'exit', 'into', 'cursor', 'open',
  'close', 'parameter', 'sub_type', 'segment', 'size', 'local', 'function',
  // Index
  'ascending', 'descending', 'unique',
  // Storage
  'page_size', 'cache', 'starting', 'with',
  // Sequence
  'restart', 'increment', 'maxvalue', 'minvalue', 'cycle', 'no',
  // Encoding
  'collate', 'encoding', 'utf8', 'win1252',
  // Misc
  'returning_values', 'enable', 'disable', 'auto', 'value', 'free_it', 'output',
  'input', 'shadow', 'difference', 'file', 'length', 'manual',
  'sql', 'security', 'definer', 'invoker',
  'window', 'partition', 'range', 'rows', 'preceding', 'following', 'current', 'unbounded',
  // Cursor + PSQL extras
  'declare', 'fetch', 'absolute', 'relative', 'prior', 'forward', 'backward',
  'scrollable', 'insensitive', 'sensitive', 'asensitive', 'for', 'of',
  'lateral', 'cross', 'apply', 'pivot', 'unpivot',
  // Transaction extras
  'read', 'write', 'committed', 'record_version', 'read_committed',
  'no_record_version', 'reserving', 'protected', 'shared',
  // Permissions / users / roles
  'grant', 'revoke', 'usage', 'execute', 'reference', 'system', 'privilege',
  'privileges', 'role', 'authentication', 'session', 'reset',
  'caller', 'invoker', 'definer', 'authid',
  // Cryptography
  'encrypt', 'decrypt',
  // SET stuff
  'set', 'statistics', 'transaction', 'savepoint', 'names', 'time', 'zone',
  'role', 'bind', 'autoddl', 'list', 'sqlda_display',
  // DML extras
  'merge', 'matched', 'using', 'returning', 'old', 'new', 'updating',
  'inserting', 'deleting',
  // Constraint extras
  'add', 'modify', 'rename', 'column', 'to', 'type', 'subtype',
  'unique', 'primary', 'foreign', 'collation', 'collate',
  // Index extras
  'computed', 'expression', 'partial', 'unique',
  // Domains
  'domain', 'check', 'constraint',
  // Generators / sequences
  'gen_id', 'gen_uuid', 'gen', 'restart', 'increment',
  // Errors / exceptions
  'when', 'any', 'do', 'gdscode', 'sqlcode', 'sqlstate', 'exception',
  'error', 'raise',
  // Conditionals + control flow extras
  'iif', 'nullif', 'coalesce',
  // Plan
  'plan', 'natural', 'index', 'order', 'ordered', 'join', 'merge',
  // Charset / encoding extras
  'character', 'character_set', 'iso8859_1', 'iso8859_2', 'iso8859_15',
  'win1250', 'win1251', 'win1252', 'win1253', 'win1254', 'win1257', 'win1258',
  'utf8', 'unicode_fss', 'ascii', 'none', 'octets', 'big_5', 'sjis_0208',
  'eucj_0208', 'ksc_5601',
  // Domain / column NULL
  'null', 'not', 'nullable',
  // Boolean comparators
  'starting', 'with', 'containing', 'similar',
  // Lateral derived tables
  'lateral',
];

const BUILTIN = [
  // Aggregate
  'count', 'sum', 'avg', 'min', 'max', 'list', 'corr', 'covar_pop', 'covar_samp',
  'stddev_pop', 'stddev_samp', 'var_pop', 'var_samp',
  'regr_avgx', 'regr_avgy', 'regr_count', 'regr_intercept', 'regr_r2', 'regr_slope',
  'regr_sxx', 'regr_sxy', 'regr_syy',
  // Window
  'row_number', 'rank', 'dense_rank', 'percent_rank', 'cume_dist',
  'lag', 'lead', 'first_value', 'last_value', 'nth_value', 'ntile',
  // String
  'ascii_char', 'ascii_val', 'btrim', 'char_length', 'character_length', 'octet_length',
  'bit_length', 'left', 'right', 'lpad', 'rpad', 'ltrim', 'rtrim', 'trim',
  'lower', 'upper', 'lcase', 'ucase', 'reverse', 'overlay', 'position', 'replace',
  'substring', 'string_agg', 'unicode_char', 'unicode_val',
  // Math
  'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh', 'ceil', 'ceiling',
  'cos', 'cosh', 'cot', 'exp', 'floor', 'ln', 'log', 'log10', 'mod', 'pi', 'power',
  'rand', 'round', 'sign', 'sin', 'sinh', 'sqrt', 'tan', 'tanh', 'trunc',
  // Bit
  'bin_and', 'bin_or', 'bin_xor', 'bin_not', 'bin_shl', 'bin_shr',
  // Date/Time
  'current_date', 'current_time', 'current_timestamp', 'localtime', 'localtimestamp',
  'now', 'today', 'tomorrow', 'yesterday',
  'current_connection', 'current_role', 'current_transaction', 'current_user',
  'dateadd', 'datediff', 'extract',
  'year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond', 'weekday', 'yearday',
  'week',
  // Conditional
  'coalesce', 'decode', 'iif', 'nullif', 'maxvalue', 'minvalue',
  // Type
  'cast', 'convert', 'blob_append',
  // System
  'gen_id', 'gen_uuid', 'char_to_uuid', 'uuid_to_char', 'hash', 'encrypt', 'decrypt',
  'rdb$get_context', 'rdb$set_context', 'rdb$record_version', 'rdb$db_key',
  'rdb$system_privilege', 'rdb$role_in_use', 'make_dbkey',
  'next', 'value', 'for',
  // Sequence (used as function-like)
  'gen_uuid',
];

const TYPES = [
  'smallint', 'integer', 'int', 'bigint', 'int128',
  'numeric', 'decimal', 'decfloat',
  'float', 'real', 'double', 'precision',
  'boolean',
  'date', 'time', 'timestamp',
  'time with time zone', 'timestamp with time zone',
  'char', 'character', 'varchar', 'character varying', 'nchar', 'nvarchar',
  'national', 'varying',
  'blob', 'binary', 'varbinary', 'binary varying',
  'text', 'cstring',
];

/**
 * The Plamenix Firebird dialect. Plug into `sql({ dialect: ... })`.
 */
export const firebirdDialect: SQLDialect = SQLDialect.define({
  keywords: KEYWORDS.join(' '),
  builtin: BUILTIN.join(' '),
  types: TYPES.join(' '),
  // Firebird-specific lexer quirks. Hash comments are NOT supported,
  // double-quoted identifiers ARE (case-sensitive). Bit literals are
  // written as `0xABCD` so we leave `unquotedBitLiterals` off.
  hashComments: false,
  slashComments: true,
  doubleQuotedStrings: false,
  unquotedBitLiterals: false,
});

/**
 * Bare keyword + builtin + type tokens. The editor injects these as
 * `Completion[]` so identifiers from these lists rank alongside schema
 * names instead of relying on the dialect's default tokenizer-driven
 * completion (which only fires on exact prefix matches).
 */
export const firebirdGlobalCompletions: Completion[] = [
  ...KEYWORDS.map((k) => ({ label: k.toUpperCase(), type: 'keyword' as const })),
  ...BUILTIN.map((b) => ({ label: b.toUpperCase(), type: 'function' as const })),
  ...TYPES.map((t) => ({ label: t.toUpperCase(), type: 'type' as const })),
];

/**
 * Translates a {@link Schema} into the `{ name: [columns…] }` map that
 * `@codemirror/lang-sql` consumes through its `schema` option. Tables
 * and views surface their column list; procedures, generators, and
 * domains land as zero-column entries so they appear in the bare-name
 * completion menu. Triggers are deliberately left out — they are
 * rarely referenced by name from interactive SQL.
 */
export function firebirdSchemaFor(schema: Schema | null): Record<string, string[]> {
  if (!schema) return {};
  const out: Record<string, string[]> = {};
  for (const t of schema.tables) {
    out[t.name] = t.columns.map((c) => c.name);
  }
  for (const p of schema.procedures ?? []) {
    out[p.name] = [];
  }
  for (const g of schema.generators ?? []) {
    out[g.name] = [];
  }
  for (const d of schema.domains ?? []) {
    out[d.name] = [];
  }
  return out;
}
