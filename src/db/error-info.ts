/** Structured render of a Firebird / driver error string.
 *
 *  Backend currently sends errors as opaque strings (the wire shape
 *  for `Result::Err` from Tauri commands). This module parses common
 *  Firebird error formats out of those strings so the UI can show:
 *  GDS / SQLCODE / SQLSTATE codes, a friendly hint, and the raw text
 *  on demand. Once the driver exposes typed errors over the wire, the
 *  parser becomes a fallback for legacy callers. */
export interface FirebirdErrorInfo {
  /** Coarse origin tag derived from the `DbError` variant prefix. */
  kind: 'connection' | 'sql' | 'driver' | 'cancelled' | 'unknown';
  /** Cleaned, user-facing message (codes stripped). */
  message: string;
  /** Firebird GDS code (e.g. `335544569`), when present. */
  gdsCode?: number;
  /** Legacy SQLCODE (e.g. `-204`), when present. */
  sqlCode?: number;
  /** 5-char SQLSTATE (e.g. `42S02`), when present. */
  sqlState?: string;
  /** Human-friendly hint derived from `gdsCode`. */
  hint?: string;
  /** Original input, untouched. */
  raw: string;
}

const PREFIXES: { match: string; kind: FirebirdErrorInfo['kind'] }[] = [
  { match: 'connect failed:', kind: 'connection' },
  { match: 'query failed:', kind: 'sql' },
  { match: 'driver error:', kind: 'driver' },
  { match: 'operation cancelled', kind: 'cancelled' },
];

/** Curated hints for the GDS codes users hit most often. The list
 *  intentionally stays small — adding hundreds of strings here is
 *  better solved by exposing typed errors from the driver. */
const HINTS: Record<number, string> = {
  335544344: 'I/O error — check the database path is accessible to the Firebird server.',
  335544345: 'Lock conflict — another session is updating the same rows.',
  335544472: 'Bad credentials — verify the username and password.',
  335544569: 'SQL error — check the statement, table names, and column references.',
  335544577: 'Identifier too long — Firebird identifiers max out at 31 chars (or 63 with newer dialects).',
  335544581: 'Lock timeout — increase the WAIT timeout or commit holding transactions sooner.',
  335544645: 'Object already exists — pick a different name or DROP the existing one.',
  335544665: 'Index has no segments — your CREATE INDEX is missing a column list.',
  335544721: 'Network error — check host, port, and firewall between client and server.',
  335544726: 'Host lookup failed — verify the hostname or use the IP.',
  335544733: 'Lost connection to the Firebird server.',
  335544762: 'Connection rejected by the server — server may be shutting down.',
  335544835: 'Login conflicts with a role name — pick a different login.',
};

/** Parses a Tauri-string error into a {@link FirebirdErrorInfo}. */
export function parseFirebirdError(raw: string): FirebirdErrorInfo {
  let kind: FirebirdErrorInfo['kind'] = 'unknown';
  let body = raw;
  for (const p of PREFIXES) {
    if (raw.toLowerCase().startsWith(p.match)) {
      kind = p.kind;
      body = raw.slice(p.match.length).trim();
      break;
    }
  }
  if (kind === 'cancelled') {
    return { kind, message: 'Operation cancelled', raw };
  }

  const gdsMatch = body.match(/\b(?:gds[_ ]?code|code)[:\s=]+(\d{5,})/i);
  const sqlCodeMatch = body.match(/\bSQLCODE[:\s=]+(-?\d+)/i);
  const sqlStateMatch = body.match(/\bSQLSTATE[:\s=]+([0-9A-Z]{5})/i);

  let message = body
    .replace(/\bgds[_ ]?code\s*[:=]\s*\d+,?\s*/gi, '')
    .replace(/\bcode\s*[:=]\s*\d+,?\s*/gi, '')
    .replace(/\bSQLCODE\s*[:=]\s*-?\d+,?\s*/gi, '')
    .replace(/\bSQLSTATE\s*[:=]\s*[0-9A-Z]{5},?\s*/gi, '')
    .replace(/^\[[^\]]*\]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (message.length === 0) message = body.trim();

  const info: FirebirdErrorInfo = { kind, message, raw };
  if (gdsMatch?.[1]) info.gdsCode = Number(gdsMatch[1]);
  if (sqlCodeMatch?.[1]) info.sqlCode = Number(sqlCodeMatch[1]);
  if (sqlStateMatch?.[1]) info.sqlState = sqlStateMatch[1];
  if (info.gdsCode !== undefined) {
    const hint = HINTS[info.gdsCode];
    if (hint !== undefined) info.hint = hint;
  }

  return info;
}

/** Short label for the error tag chip shown in the banner header. */
export function errorKindLabel(kind: FirebirdErrorInfo['kind']): string {
  switch (kind) {
    case 'connection':
      return 'Connection error';
    case 'sql':
      return 'SQL error';
    case 'driver':
      return 'Driver error';
    case 'cancelled':
      return 'Cancelled';
    case 'unknown':
      return 'Error';
  }
}
