/**
 * Built-in CSV file importer (I5.14) — first import source. Registered
 * under `@plamenix-builtin/import-csv`. Reads a user-picked file from
 * the browser's `File` API, parses it RFC 4180-ish (comma / semicolon
 * / tab delimited, doubled-quote escaping), and yields rows lazily
 * via an `AsyncIterable<Row>`.
 *
 * Form state: `{ file: File | null, delimiter: ',' | ';' | '\t',
 * hasHeader: boolean }`. The wizard hands these via `state` +
 * `setState`. `importRows` validates `file !== null` (the wizard's
 * Import button stays disabled when null, but defensive check
 * remains) then streams the file via `File.text()` + the inline
 * tokeniser.
 *
 * Parser is intentionally tiny — handles RFC 4180 doubled-quote
 * escaping + CRLF/LF line endings + the three delimiter shapes the
 * shell historically supports. Doesn't handle:
 *   - Multi-line quoted fields (`"hello\nworld"`) — keeps to single-
 *     line records for the M1 cut. Plugin authors needing richer
 *     parsing ship their own builtin or wrap papaparse.
 *   - Encoding detection — assumes UTF-8 (which `File.text()`
 *     gives us by default).
 *
 * Type inference: every cell yields as `{type: 'text'}` for now —
 * the host's INSERT pipeline (when wired) handles SQL-side type
 * coercion at INSERT time. A future "type-aware import" pass could
 * sniff numbers / dates / nulls and emit richer ColumnValues.
 */

import { useEffect, useRef } from 'react';
import { FileSpreadsheet, FileUp } from 'lucide-react';
import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import type { Row } from '../../db/types.js';
import type {
  ImportRowsArgs,
  ImportSourceContributionPayload,
  ImportSourceFormProps,
} from '../import-source-contract.js';

const BUILTIN_NAME = 'import-csv';

export interface CsvImportState {
  file: File | null;
  delimiter: ',' | ';' | '\t';
  hasHeader: boolean;
}

/** Tokeniser — yields field strings for one line at a time. Handles
 *  doubled-quote escaping inside `"…"` quoted fields. Doesn't
 *  cross-line-merge multi-line quoted fields (per the docstring at
 *  the top of this file). */
function* parseCsvLine(line: string, delimiter: string): Iterable<string> {
  let i = 0;
  const n = line.length;
  while (i <= n) {
    if (i === n) {
      // Empty trailing field (line ending in delimiter).
      yield '';
      return;
    }
    if (line[i] === '"') {
      // Quoted field — read until unescaped closing quote.
      let out = '';
      i++; // consume opening quote
      while (i < n) {
        if (line[i] === '"' && line[i + 1] === '"') {
          out += '"';
          i += 2;
          continue;
        }
        if (line[i] === '"') {
          i++; // consume closing quote
          break;
        }
        out += line[i];
        i++;
      }
      yield out;
      // Consume delimiter or EOL.
      if (line[i] === delimiter) i++;
      else if (i >= n) return;
      continue;
    }
    // Unquoted field — read to next delimiter or EOL.
    let start = i;
    while (i < n && line[i] !== delimiter) i++;
    yield line.slice(start, i);
    if (line[i] === delimiter) i++;
    else if (i >= n) return;
  }
}

/** Splits the document into lines (CRLF + LF), then tokenises each
 *  line. Skips empty trailing line so a file ending in `\n` doesn't
 *  produce a phantom blank record. */
export function* parseCsvText(text: string, delimiter: string): Iterable<string[]> {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.length === 0 && i === lines.length - 1) continue;
    yield Array.from(parseCsvLine(line, delimiter));
  }
}

/** Form component — file input + delimiter pill + header checkbox. */
function CsvImportForm({ state, setState }: ImportSourceFormProps<CsvImportState>) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    // Reset native input value when state.file is cleared programmatically.
    if (inputRef.current && state.file === null) inputRef.current.value = '';
  }, [state.file]);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-fg-muted">
          CSV file
        </label>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setState({ ...state, file: f });
          }}
          className="block w-full text-xs text-fg-muted file:mr-3 file:rounded-md file:border file:border-edge file:bg-canvas file:px-2 file:py-1 file:text-xs file:font-medium file:text-fg-muted file:transition-colors hover:file:bg-elevated hover:file:text-fg"
        />
        {state.file && (
          <p className="mt-1 text-[10px] text-fg-subtle">
            <FileSpreadsheet className="mr-1 inline h-3 w-3" />
            {state.file.name} · {state.file.size.toLocaleString()} bytes
          </p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-fg-muted">
          Delimiter
        </label>
        <div className="flex shrink-0 items-center gap-1 rounded-md border border-edge bg-canvas p-0.5">
          {([
            { id: ',' as const, label: ',', hint: 'comma' },
            { id: ';' as const, label: ';', hint: 'semicolon' },
            { id: '\t' as const, label: 'TAB', hint: 'tab' },
          ]).map((opt) => {
            const active = opt.id === state.delimiter;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setState({ ...state, delimiter: opt.id })}
                title={opt.hint}
                aria-pressed={active}
                className={`min-w-[2.25rem] rounded px-2 py-0.5 text-[11px] font-mono font-medium transition-colors ${
                  active
                    ? 'bg-accent text-fg-inverted shadow-sm'
                    : 'text-fg-muted hover:bg-elevated hover:text-fg'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs text-fg-muted">
        <input
          type="checkbox"
          checked={state.hasHeader}
          onChange={(e) => setState({ ...state, hasHeader: e.target.checked })}
          className="h-3.5 w-3.5 cursor-pointer accent-accent"
        />
        First row contains column names
      </label>
    </div>
  );
}

/** Pure importer — async-iterates rows from the form state. Exposed
 *  for direct unit-testing without the React form. */
export async function* importCsvRows({
  state,
  ctx,
}: ImportRowsArgs<CsvImportState>): AsyncIterable<Row> {
  if (state.file === null) return;
  const text = await state.file.text();
  let count = 0;
  let first = true;
  for (const tokens of parseCsvText(text, state.delimiter)) {
    if (first && state.hasHeader) {
      first = false;
      continue;
    }
    first = false;
    yield { cells: tokens.map((t) => ({ type: 'text' as const, value: t })) };
    count++;
    if (count % 100 === 0) ctx.onProgress?.(count);
  }
  ctx.onProgress?.(count);
}

const payload: ImportSourceContributionPayload<CsvImportState> = {
  label: 'CSV file',
  icon: FileUp,
  description: 'Import a comma / semicolon / tab delimited file from disk.',
  initialState: { file: null, delimiter: ',', hasHeader: true },
  FormComponent: CsvImportForm,
  importRows: importCsvRows,
};

/** Registers the built-in CSV importer. Returns a teardown closure
 *  for `useEffect` pairing. Priority 200 → third-party import sources
 *  at default priority 100 surface ahead of the built-in in the
 *  wizard's tab strip. */
export function registerBuiltinCsvImporter(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    import_sources: [
      {
        id: 'csv-file',
        priority: 200,
        payload: payload as ImportSourceContributionPayload<unknown>,
      },
    ],
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

export function unregisterBuiltinCsvImporter(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
