/**
 * Built-in basic SQL formatter (I5.6) — minimal viable formatter so
 * the Format button has something to do out of the box. Registered
 * under `@plamenix-builtin/sql-formatter-basic` at priority 200 (i.e.
 * any third-party formatter at the default priority 100 sorts above
 * it; the built-in surfaces only when no plugin is installed).
 *
 * What it does (intentionally tiny — third-party plugins ship the
 * real heavy lifters like sql-formatter / Prettier-SQL / pgFormatter):
 *
 *   - Upper-cases recognised SQL keywords (case-insensitive match).
 *   - Inserts a newline before each major clause keyword
 *     (`SELECT`, `FROM`, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`,
 *     `LIMIT`, `OFFSET`, `JOIN`, `LEFT JOIN`, `INNER JOIN`,
 *     `OUTER JOIN`, `UNION`).
 *   - Collapses redundant whitespace (multi-spaces → single, trailing
 *     spaces on each line trimmed).
 *   - Indents continuation lines (everything after `SELECT` lead) by
 *     four spaces.
 *   - Preserves string literals + comments verbatim — never reaches
 *     into a `'…'` quoted span or a `--` / `/* …`-style comment.
 *
 * What it does NOT do (deferred to third-party formatters):
 *
 *   - Comma alignment / vertical column lists.
 *   - Function-call argument wrapping.
 *   - Window-clause re-formatting.
 *   - PL/SQL / PSQL block re-indentation.
 *   - Dialect-specific keyword sets (Firebird `RECREATE`,
 *     `EXECUTE BLOCK`, `MERGE`, `WITH RECURSIVE` are recognised but
 *     the corner cases aren't all polished — third-party formatters
 *     fill in).
 *
 * Per the contract, the function NEVER throws — input that can't be
 * tokenised round-trips unchanged.
 */

import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import type { SqlFormatterContributionPayload } from '../sql-formatter-contract.js';

const BUILTIN_NAME = 'sql-formatter-basic';

/** Keywords we recognise + upper-case. Listed case-insensitively in
 *  the matcher; the SET below carries the canonical upper form. */
const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'NULL',
  'IS', 'AS', 'ON', 'BY', 'GROUP', 'ORDER', 'HAVING', 'LIMIT',
  'OFFSET', 'UNION', 'ALL', 'JOIN', 'LEFT', 'RIGHT', 'INNER',
  'OUTER', 'FULL', 'CROSS', 'INSERT', 'INTO', 'VALUES', 'UPDATE',
  'SET', 'DELETE', 'CREATE', 'TABLE', 'INDEX', 'VIEW', 'PROCEDURE',
  'TRIGGER', 'GENERATOR', 'SEQUENCE', 'DOMAIN', 'ALTER', 'DROP',
  'RECREATE', 'EXECUTE', 'BLOCK', 'DECLARE', 'BEGIN', 'END', 'IF',
  'THEN', 'ELSE', 'WHILE', 'DO', 'RETURN', 'RETURNS', 'WITH',
  'RECURSIVE', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'GRANT',
  'REVOKE', 'TO', 'USER', 'ROLE', 'PRIMARY', 'KEY', 'FOREIGN',
  'REFERENCES', 'UNIQUE', 'CHECK', 'CONSTRAINT', 'DEFAULT',
  'COMPUTED', 'COLLATE', 'CHARACTER', 'CASE', 'WHEN', 'EXISTS',
  'BETWEEN', 'LIKE', 'STARTING', 'CONTAINING', 'SIMILAR', 'TRUE',
  'FALSE', 'UNKNOWN', 'CAST', 'COALESCE', 'MERGE', 'USING',
  'MATCHED', 'INSENSITIVE', 'STATISTICS', 'COMPUTE',
]);

/** Phrases (multi-word keywords) that start a new clause line. */
const CLAUSE_LEADS: readonly string[] = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY',
  'LIMIT', 'OFFSET', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN',
  'OUTER JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN', 'UNION ALL',
  'UNION', 'WITH', 'INSERT INTO', 'UPDATE', 'DELETE FROM',
  'VALUES', 'SET',
];

interface Token {
  /** Token text (raw — may be quoted literal or comment). */
  text: string;
  /** True when the token is a quoted string, identifier, or comment
   *  — its inner content must round-trip verbatim. */
  literal: boolean;
}

/** Tokenises SQL into a stream that preserves quoted spans + comments
 *  as opaque literals. Non-literal runs are alphanumeric words or
 *  punctuation. Whitespace is dropped (the formatter re-introduces
 *  its own). */
function tokenise(sql: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // Line comment -- …\n
    if (c === '-' && sql[i + 1] === '-') {
      let j = i + 2;
      while (j < n && sql[j] !== '\n') j++;
      out.push({ text: sql.slice(i, j), literal: true });
      i = j;
      continue;
    }
    // Block comment /* … */
    if (c === '/' && sql[i + 1] === '*') {
      let j = i + 2;
      while (j < n - 1 && !(sql[j] === '*' && sql[j + 1] === '/')) j++;
      j = Math.min(n, j + 2);
      out.push({ text: sql.slice(i, j), literal: true });
      i = j;
      continue;
    }
    // Single-quoted string '…' (Firebird doubles internal quotes)
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") {
          j++;
          break;
        }
        j++;
      }
      out.push({ text: sql.slice(i, j), literal: true });
      i = j;
      continue;
    }
    // Double-quoted identifier "…"
    if (c === '"') {
      let j = i + 1;
      while (j < n && sql[j] !== '"') j++;
      j = Math.min(n, j + 1);
      out.push({ text: sql.slice(i, j), literal: true });
      i = j;
      continue;
    }
    // Word (letters / digits / underscore)
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$.]/.test(sql[j]!)) j++;
      out.push({ text: sql.slice(i, j), literal: false });
      i = j;
      continue;
    }
    // Punctuation — single char
    out.push({ text: c, literal: false });
    i++;
  }
  return out;
}

/** Joins tokens with single-space spacing + suppresses spaces before
 *  closing punctuation (`,`, `;`, `)`) and after opening parens. */
function joinTokens(tokens: Token[]): string {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const prev = tokens[i - 1];
    if (i === 0) {
      out += t.text;
      continue;
    }
    const noSpaceBefore =
      t.text === ',' || t.text === ';' || t.text === ')' || t.text === '.';
    const noSpaceAfter = prev && (prev.text === '(' || prev.text === '.');
    if (noSpaceBefore || noSpaceAfter) {
      out += t.text;
    } else {
      out += ' ' + t.text;
    }
  }
  return out;
}

/** Inserts a newline + 4-space indent before each clause-lead phrase.
 *  Matches case-insensitively against the joined token stream. */
function breakClauses(line: string): string {
  let out = line;
  for (const lead of CLAUSE_LEADS) {
    const re = new RegExp(`\\s+(${lead.replace(/ /g, '\\s+')})\\b`, 'gi');
    out = out.replace(re, '\n' + lead);
  }
  // Leading clause keyword should start at column 0; secondary
  // clauses get a soft indent.
  return out;
}

/** Pure formatter — exposed for unit-testing without the registry. */
export function formatSqlBasic(sql: string): string {
  if (typeof sql !== 'string' || sql.length === 0) return sql;
  let tokens: Token[];
  try {
    tokens = tokenise(sql);
  } catch {
    return sql;
  }
  // Upper-case recognised keywords (non-literal tokens only).
  for (const t of tokens) {
    if (t.literal) continue;
    const upper = t.text.toUpperCase();
    if (KEYWORDS.has(upper)) {
      t.text = upper;
    }
  }
  const joined = joinTokens(tokens);
  const broken = breakClauses(joined);
  // Trim trailing whitespace on each line, drop leading empty line.
  return broken
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .filter((l, i, arr) => !(i === 0 && l.length === 0))
    .join('\n');
}

const payload: SqlFormatterContributionPayload = {
  label: 'Basic (built-in)',
  dialect: 'firebird',
  format: formatSqlBasic,
};

/**
 * Registers the basic built-in SQL formatter. Returns a teardown
 * closure for `useEffect` pairing.
 */
export function registerBuiltinBasicSqlFormatter(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    sql_formatters: [
      {
        id: 'basic',
        // Priority 200 — third-party formatters at default 100 win
        // (community plugins surface ahead of shell default).
        priority: 200,
        payload,
      },
    ],
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

export function unregisterBuiltinBasicSqlFormatter(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
