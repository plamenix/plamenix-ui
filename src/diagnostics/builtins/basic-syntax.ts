/**
 * Built-in basic syntax checker (I5.13) — minimum-viable linter so
 * the SqlEditor gutter has something to show out of the box.
 * Registered under `@plamenix-builtin/diagnostic-basic-syntax`.
 *
 * Three rules, all severity `'error'`:
 *
 *   - **`unbalanced-paren`** — count of `(` vs `)` mismatch. Reports
 *     the offending position (the unmatched opener, or the closer
 *     without a matching opener).
 *   - **`unterminated-string`** — a `'`-quoted string literal that
 *     reaches end-of-buffer without its closing quote. Firebird
 *     doubles internal single quotes (`'O''Brien'`) — the checker
 *     respects that escape rule.
 *   - **`unterminated-block-comment`** — a `/* …` that reaches EOF
 *     without a matching `*\/`.
 *
 * Real linters (sql-formatter / pgFormatter / IBExpert-style rule
 * sets) plug in via third-party `diagnostics_providers` contributions;
 * this built-in stays intentionally tiny so it never produces false
 * positives that would erode user trust in the gutter.
 */

import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import type {
  DiagnosticProviderContributionPayload,
  PlamenixDiagnostic,
} from '../diagnostic-provider-contract.js';

const BUILTIN_NAME = 'diagnostic-basic-syntax';

/** Pure linter — exposed for direct unit-testing. Returns an array of
 *  diagnostics in document order; never throws. */
export function basicSyntaxLint(sql: string): PlamenixDiagnostic[] {
  if (typeof sql !== 'string' || sql.length === 0) return [];
  const out: PlamenixDiagnostic[] = [];

  // Walk character-by-character tracking line/col positions, with
  // state machine for strings + block comments + line comments.
  let line = 1;
  let col = 1;
  let inLineComment = false;
  let inBlockComment = false;
  let blockCommentStart: { line: number; col: number } | null = null;
  let inString = false;
  let stringStart: { line: number; col: number } | null = null;
  const parenStack: { line: number; col: number }[] = [];

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    const next = sql[i + 1];

    if (c === '\n') {
      // Line comments end at newline; strings + block comments don't.
      inLineComment = false;
      line++;
      col = 1;
      continue;
    }

    if (inLineComment) {
      col++;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        blockCommentStart = null;
        i++; // consume the `/`
        col += 2;
        continue;
      }
      col++;
      continue;
    }
    if (inString) {
      if (c === "'") {
        if (next === "'") {
          // Doubled single quote — escape, stay in string.
          i++;
          col += 2;
          continue;
        }
        inString = false;
        stringStart = null;
        col++;
        continue;
      }
      col++;
      continue;
    }

    // Not inside a string/comment — scan for token starts.
    if (c === '-' && next === '-') {
      inLineComment = true;
      i++;
      col += 2;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlockComment = true;
      blockCommentStart = { line, col };
      i++;
      col += 2;
      continue;
    }
    if (c === "'") {
      inString = true;
      stringStart = { line, col };
      col++;
      continue;
    }
    if (c === '(') {
      parenStack.push({ line, col });
      col++;
      continue;
    }
    if (c === ')') {
      if (parenStack.length === 0) {
        out.push({
          severity: 'error',
          line,
          col,
          message: "Unmatched ')' — no opening parenthesis.",
          code: 'unbalanced-paren',
        });
      } else {
        parenStack.pop();
      }
      col++;
      continue;
    }
    col++;
  }

  if (parenStack.length > 0) {
    for (const p of parenStack) {
      out.push({
        severity: 'error',
        line: p.line,
        col: p.col,
        message: "Unmatched '(' — no closing parenthesis.",
        code: 'unbalanced-paren',
      });
    }
  }
  if (inString && stringStart) {
    out.push({
      severity: 'error',
      line: stringStart.line,
      col: stringStart.col,
      message: "Unterminated string literal — missing closing quote.",
      code: 'unterminated-string',
    });
  }
  if (inBlockComment && blockCommentStart) {
    out.push({
      severity: 'error',
      line: blockCommentStart.line,
      col: blockCommentStart.col,
      message: "Unterminated block comment — missing '*/'.",
      code: 'unterminated-block-comment',
    });
  }

  return out;
}

const payload: DiagnosticProviderContributionPayload = {
  lint: basicSyntaxLint,
};

/** Registers the built-in basic syntax checker. Returns a teardown
 *  closure for `useEffect` pairing. Priority 200 — third-party
 *  linters at default 100 run before the built-in; the linter
 *  aggregator flattens all output, so order only matters for
 *  tooltip rendering when two diagnostics share a position. */
export function registerBuiltinBasicSyntaxDiagnostic(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    diagnostics_providers: [
      {
        id: 'basic-syntax',
        priority: 200,
        payload,
      },
    ],
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

export function unregisterBuiltinBasicSyntaxDiagnostic(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
