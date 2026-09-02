import { describe, expect, it } from 'vitest';
import {
  pluginContributionsToExportButtons,
  type ExportFormatArgs,
  type ExportFormatPayload,
  type ExportFormatResult,
} from './export-format-contract.js';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

function entry(
  id: string,
  payload: ExportFormatPayload,
  pluginId = `plg.${id}`,
): PluginContribution<ExportFormatPayload> {
  return {
    pluginId,
    contribution: { id, payload },
  };
}

function silentPayload(label: string): ExportFormatPayload {
  return {
    label,
    title: `Export as ${label}`,
    exportRows: async () =>
      ({
        filename: `out.${label.toLowerCase()}`,
        mimeType: 'application/octet-stream',
        body: new Blob([]),
      }) satisfies ExportFormatResult,
  };
}

describe('pluginContributionsToExportButtons', () => {
  it('maps an empty contribution list to an empty button list', () => {
    expect(pluginContributionsToExportButtons([])).toEqual([]);
  });

  it('prefixes the button id with pluginId so two plugins with the same local id do not collide', () => {
    const buttons = pluginContributionsToExportButtons([
      entry('parquet', silentPayload('Parquet'), 'com.acme.exports'),
      entry('parquet', silentPayload('Parquet (alt)'), 'com.other.exports'),
    ]);
    expect(buttons.map((b) => b.id)).toEqual([
      'com.acme.exports:parquet',
      'com.other.exports:parquet',
    ]);
  });

  it('threads label + title + pluginId through unchanged', () => {
    const buttons = pluginContributionsToExportButtons([
      entry('avro', { ...silentPayload('Avro'), title: 'Apache Avro export' }),
    ]);
    expect(buttons[0]).toMatchObject({
      pluginId: 'plg.avro',
      label: 'Avro',
      title: 'Apache Avro export',
    });
  });

  it('omits icon when the payload does not define one (exactOptionalPropertyTypes-safe)', () => {
    const buttons = pluginContributionsToExportButtons([
      entry('plain', silentPayload('Plain')),
    ]);
    expect('icon' in buttons[0]!).toBe(false);
  });

  it('threads icon when present', () => {
    const Icon = () => null;
    const buttons = pluginContributionsToExportButtons([
      entry('iconed', { ...silentPayload('Iconed'), icon: Icon }),
    ]);
    expect(buttons[0]?.icon).toBe(Icon);
  });

  it('onSelect delegates to the contribution payload exportRows', async () => {
    let receivedArgs: ExportFormatArgs | null = null;
    const buttons = pluginContributionsToExportButtons([
      entry('echo', {
        label: 'Echo',
        title: 'Echo args back',
        exportRows: async (args) => {
          receivedArgs = args;
          return {
            filename: 'echo.txt',
            mimeType: 'text/plain',
            body: `cols=${args.columns.length} rows=${args.rows.length}`,
          };
        },
      }),
    ]);
    const result = await buttons[0]!.onSelect({
      columns: [{ name: 'id', sqlType: 'INT', nullable: false }],
      rows: [{ cells: [{ type: 'integer', value: '1' }] }],
      tableName: 'users',
    });
    expect(receivedArgs?.tableName).toBe('users');
    expect(result.body).toBe('cols=1 rows=1');
    expect(result.mimeType).toBe('text/plain');
  });
});
