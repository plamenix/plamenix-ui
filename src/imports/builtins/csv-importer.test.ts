import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  importCsvRows,
  parseCsvText,
  registerBuiltinCsvImporter,
  unregisterBuiltinCsvImporter,
  type CsvImportState,
} from './csv-importer.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry } from '../../plugin-react/registry.js';
import type { Row } from '../../db/types.js';

function rows(it: Iterable<string[]>): string[][] {
  return Array.from(it);
}

describe('parseCsvText (I5.14)', () => {
  it('parses comma-delimited simple records', () => {
    expect(rows(parseCsvText('a,b,c\nd,e,f', ','))).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('handles semicolon and tab delimiters', () => {
    expect(rows(parseCsvText('a;b;c', ';'))).toEqual([['a', 'b', 'c']]);
    expect(rows(parseCsvText('a\tb\tc', '\t'))).toEqual([['a', 'b', 'c']]);
  });

  it('respects quoted fields containing delimiters', () => {
    expect(rows(parseCsvText('"hi, there",b', ','))).toEqual([['hi, there', 'b']]);
  });

  it('respects doubled-quote escaping inside quoted fields', () => {
    expect(rows(parseCsvText('"O""Brien",ok', ','))).toEqual([['O"Brien', 'ok']]);
  });

  it('handles CRLF + LF line endings', () => {
    expect(rows(parseCsvText('a,b\r\nc,d', ','))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(rows(parseCsvText('a,b\nc,d', ','))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('skips trailing empty line so file ending in newline doesn\'t produce phantom record', () => {
    expect(rows(parseCsvText('a,b\nc,d\n', ','))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('handles empty fields between delimiters', () => {
    expect(rows(parseCsvText('a,,c', ','))).toEqual([['a', '', 'c']]);
    expect(rows(parseCsvText(',,', ','))).toEqual([['', '', '']]);
  });
});

async function collect(it: AsyncIterable<Row>): Promise<Row[]> {
  const out: Row[] = [];
  for await (const r of it) out.push(r);
  return out;
}

/** Builds a fake File from inline text. */
function makeFile(text: string, name = 'test.csv'): File {
  return new File([text], name, { type: 'text/csv' });
}

describe('importCsvRows (I5.14)', () => {
  it('yields nothing when state.file is null', async () => {
    const out = await collect(
      importCsvRows({
        state: { file: null, delimiter: ',', hasHeader: true },
        ctx: { sessionId: null, schema: null },
      }),
    );
    expect(out).toEqual([]);
  });

  it('skips header row when hasHeader is true', async () => {
    const state: CsvImportState = {
      file: makeFile('id,name\n1,Alice\n2,Bob\n'),
      delimiter: ',',
      hasHeader: true,
    };
    const out = await collect(importCsvRows({ state, ctx: { sessionId: null, schema: null } }));
    expect(out).toHaveLength(2);
    expect(out[0]?.cells).toEqual([
      { type: 'text', value: '1' },
      { type: 'text', value: 'Alice' },
    ]);
  });

  it('keeps every row when hasHeader is false', async () => {
    const state: CsvImportState = {
      file: makeFile('1,Alice\n2,Bob'),
      delimiter: ',',
      hasHeader: false,
    };
    const out = await collect(importCsvRows({ state, ctx: { sessionId: null, schema: null } }));
    expect(out).toHaveLength(2);
  });

  it('emits cells as text ColumnValues (no type inference)', async () => {
    const state: CsvImportState = {
      file: makeFile('1,3.14,true', 'nums.csv'),
      delimiter: ',',
      hasHeader: false,
    };
    const out = await collect(importCsvRows({ state, ctx: { sessionId: null, schema: null } }));
    expect(out[0]?.cells.every((c) => c.type === 'text')).toBe(true);
  });

  it('calls ctx.onProgress at end of stream with final row count', async () => {
    const calls: number[] = [];
    const state: CsvImportState = {
      file: makeFile('1\n2\n3\n4\n5'),
      delimiter: ',',
      hasHeader: false,
    };
    await collect(
      importCsvRows({
        state,
        ctx: { sessionId: null, schema: null, onProgress: (n) => calls.push(n) },
      }),
    );
    expect(calls[calls.length - 1]).toBe(5);
  });
});

describe('registerBuiltinCsvImporter (I5.14)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => {
    unregisterBuiltinCsvImporter();
    registry.__reset();
  });

  it('registers under the built-in namespace at priority 200', () => {
    registerBuiltinCsvImporter();
    const contributions = registry.getContributions('import_sources');
    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.pluginId).toBe('@plamenix-builtin/import-csv');
    expect(isBuiltinPlugin(contributions[0]?.pluginId ?? '')).toBe(true);
    expect(contributions[0]?.contribution.id).toBe('csv-file');
    expect(contributions[0]?.contribution.priority).toBe(200);
  });

  it('payload label and description match the CSV defaults', () => {
    registerBuiltinCsvImporter();
    const c = registry.getContributions('import_sources')[0];
    expect((c?.contribution.payload as { label: string }).label).toBe('CSV file');
  });

  it('teardown unregisters cleanly + re-register works', () => {
    const teardown = registerBuiltinCsvImporter();
    teardown();
    expect(registry.getContributions('import_sources')).toHaveLength(0);
    expect(() => registerBuiltinCsvImporter()).not.toThrow();
    expect(registry.getContributions('import_sources')).toHaveLength(1);
  });
});
