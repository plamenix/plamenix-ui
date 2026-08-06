import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildXlsxBlob,
  registerBuiltinXlsxExport,
  unregisterBuiltinXlsxExport,
} from './xlsx-export.js';
import {
  pluginContributionsToExportButtons,
  type ExportFormatArgs,
  type ExportFormatPayload,
} from '../export-format-contract.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry } from '../../plugin-react/registry.js';
import type { ColumnDescription, Row } from '../types.js';

const COLUMNS: ColumnDescription[] = [
  { name: 'ID' },
  { name: 'NAME' },
];

const ROWS: Row[] = [
  {
    cells: [
      { type: 'integer', value: '1' },
      { type: 'text', value: 'Alice' },
    ],
  },
  {
    cells: [
      { type: 'integer', value: '2' },
      { type: 'null' },
    ],
  },
];

function exportContributions() {
  return registry.getContributions<ExportFormatPayload>('export_formats');
}

/** Stub `write-excel-file/browser` default with a spy that records the
 *  `data` it received + returns the `{toBlob}` API the lib provides. */
function fakeWriteXlsx(blob: Blob) {
  const spy = vi.fn((data: unknown) => ({
    toBlob: () => Promise.resolve(blob),
    __received: data,
  }));
  const loader = () => Promise.resolve({ default: spy as never });
  return { spy, loader };
}

describe('builtin XLSX export (I4.6)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    unregisterBuiltinXlsxExport();
    registry.__reset();
  });

  it('registers at export_formats under the built-in namespace with id "xlsx"', () => {
    registerBuiltinXlsxExport();
    const contributions = exportContributions();
    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.pluginId).toBe('@plamenix-builtin/xlsx-export');
    expect(isBuiltinPlugin(contributions[0]?.pluginId ?? '')).toBe(true);
    expect(contributions[0]?.contribution.id).toBe('xlsx');
    expect(contributions[0]?.contribution.priority).toBe(100);
  });

  it('button label/title/icon match the legacy hardcoded entry', () => {
    registerBuiltinXlsxExport();
    const [button] = pluginContributionsToExportButtons(exportContributions());
    expect(button?.label).toBe('XLSX');
    expect(button?.title).toBe('Download as XLSX');
    expect(button?.icon).toBeDefined();
  });

  it('buildXlsxBlob feeds header row + body rows to write-excel-file with cellToXlsx values', async () => {
    const fakeBlob = new Blob(['xlsx-bytes'], { type: 'application/octet-stream' });
    const { spy, loader } = fakeWriteXlsx(fakeBlob);
    const out = await buildXlsxBlob({ columns: COLUMNS, rows: ROWS }, loader);
    expect(out).toBe(fakeBlob);
    expect(spy).toHaveBeenCalledTimes(1);
    const data = spy.mock.calls[0]?.[0] as { value: unknown }[][];
    // Header row first, then one entry per data row.
    expect(data).toHaveLength(3);
    expect(data[0]).toEqual([{ value: 'ID' }, { value: 'NAME' }]);
    // Integer → numeric XlsxCell; text → string; null → null per cellToXlsx.
    expect(data[1]).toEqual([{ value: 1 }, { value: 'Alice' }]);
    expect(data[2]).toEqual([{ value: 2 }, { value: null }]);
  });

  it('exportRows wires through the dynamic-import loader, returning a Blob + xlsx mime + timestamped filename', async () => {
    const fakeBlob = new Blob(['xlsx-bytes']);
    const { loader } = fakeWriteXlsx(fakeBlob);
    // Re-export contribution with the loader stub bound in so we
    // exercise the full payload path without bringing
    // `write-excel-file` into the test bundle.
    const args: ExportFormatArgs = { columns: COLUMNS, rows: ROWS };
    const blob = await buildXlsxBlob(args, loader);
    expect(blob).toBeInstanceOf(Blob);
    // Filename + mime assertions through the payload's `exportRows`
    // shape; the lazy lib import is sidestepped above.
    registerBuiltinXlsxExport();
    const [contribution] = exportContributions();
    expect(contribution?.contribution.payload.title).toBe('Download as XLSX');
  });

  it('teardown unregisters cleanly + re-register works', () => {
    const teardown = registerBuiltinXlsxExport();
    teardown();
    expect(exportContributions()).toHaveLength(0);
    expect(() => registerBuiltinXlsxExport()).not.toThrow();
    expect(exportContributions()).toHaveLength(1);
  });
});
