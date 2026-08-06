/**
 * Diagnostic-provider contribution contract (I5.13).
 *
 * Plugins contribute SQL linter rules through the `diagnostic_providers`
 * extension point. The shell's `SqlEditor` registers a CodeMirror
 * `@codemirror/lint` linter that calls every applicable provider's
 * `lint(sql)` on every buffer change, flattens the returned
 * `PlamenixDiagnostic[]`, and surfaces them through the editor's
 * gutter (margin pips) + the inline underline.
 *
 * Built-in `@plamenix-builtin/diagnostic-basic-syntax` ships a tiny
 * syntax checker (unbalanced parens / single-quote strings / block
 * comments) so the gutter has something to show out of the box.
 * Third-party plugins add real rule sets: missing-WHERE detector,
 * CROSS JOIN warning, deprecated-feature finder, SELECT-without-INTO
 * inside PSQL blocks, ANSI-vs-Firebird dialect drift warnings, etc.
 *
 * **Diagnostic shape** intentionally minimal — `severity` + `line` /
 * `col` + `message` + optional `code` (machine-readable rule id used
 * by future suppress / fix-action UIs). Line + col are 1-based to
 * match what SQL parsers + Firebird's error messages report;
 * `lineColToOffset` (the shell-side helper used by the SqlEditor
 * adapter) converts them to the 0-based document offsets CodeMirror
 * consumes.
 */

import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/** Diagnostic severity — drives the gutter pip colour + the inline
 *  underline tone. */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/** One linter finding. Line + column are 1-based (most SQL parsers
 *  report 1-based positions); the shell maps them to 0-based
 *  CodeMirror offsets at render time. */
export interface PlamenixDiagnostic {
  severity: DiagnosticSeverity;
  /** 1-based line number where the diagnostic starts. */
  line: number;
  /** 1-based column where the diagnostic starts. */
  col: number;
  /** Optional 1-based ending column for the underlined range. When
   *  omitted, the underline extends to end-of-token from `col`. */
  endCol?: number;
  /** Human-readable message shown in the tooltip + the gutter pip
   *  hover. Plain text, no markdown. */
  message: string;
  /** Optional machine-readable rule id (`'unbalanced-paren'`,
   *  `'missing-where'`, `'cross-join'`). Future suppress / fix
   *  actions reference this. */
  code?: string;
}

export interface DiagnosticProviderContributionPayload {
  /** Pure function — takes the current buffer text, returns zero or
   *  more diagnostics. MUST NOT throw — providers that can't parse
   *  should return `[]` rather than crash the editor. */
  lint: (sql: string) => readonly PlamenixDiagnostic[];
}

/** Resolved descriptor ready for the linter aggregator. */
export interface DiagnosticProviderDescriptor {
  id: string;
  pluginId: string;
  lint: (sql: string) => readonly PlamenixDiagnostic[];
}

/** Maps registry contributions into descriptors in registry priority
 *  order (lower = appears first in the gutter's tooltip ordering for
 *  the same source position). */
export function pluginContributionsToDiagnosticProviders(
  contributions: ReadonlyArray<PluginContribution<DiagnosticProviderContributionPayload>>,
): DiagnosticProviderDescriptor[] {
  return contributions.map(({ pluginId, contribution }) => ({
    id: `${pluginId}:${contribution.id}`,
    pluginId,
    lint: contribution.payload.lint,
  }));
}

/** Runs every registered provider against the supplied buffer text,
 *  flattens output. Throwing providers drop out — others still emit. */
export function runDiagnosticProviders(
  descriptors: ReadonlyArray<DiagnosticProviderDescriptor>,
  sql: string,
): PlamenixDiagnostic[] {
  const out: PlamenixDiagnostic[] = [];
  for (const d of descriptors) {
    let results: readonly PlamenixDiagnostic[];
    try {
      results = d.lint(sql);
    } catch {
      continue;
    }
    for (const r of results) out.push(r);
  }
  return out;
}

/** Converts a 1-based `(line, col)` pair into the 0-based document
 *  offset CodeMirror consumes. Out-of-range positions clamp to the
 *  end of the document so a stale diagnostic doesn't blow up render. */
export function lineColToOffset(sql: string, line: number, col: number): number {
  if (line < 1) return 0;
  let pos = 0;
  let currentLine = 1;
  while (currentLine < line && pos < sql.length) {
    const nl = sql.indexOf('\n', pos);
    if (nl < 0) return sql.length;
    pos = nl + 1;
    currentLine++;
  }
  // `col` is 1-based — column 1 = the first character on the line.
  const target = pos + Math.max(0, col - 1);
  return Math.min(target, sql.length);
}
