import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  pluginContributionsToImportSources,
  type ImportSourceContributionPayload,
} from './import-source-contract.js';
import { registry, registerContributions } from '../plugin-react/registry.js';

const NULL_FORM = () => null;
const NULL_IMPORT = async function* () {};

function descriptors() {
  return pluginContributionsToImportSources(
    registry.getContributions<ImportSourceContributionPayload>('import_sources'),
  );
}

describe('pluginContributionsToImportSources (I5.14)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => registry.__reset());

  it('descriptor id namespaces by pluginId + contribution id', () => {
    registerContributions('com.example.json', {
      import_sources: [
        {
          id: 'json-file',
          payload: {
            label: 'JSON file',
            initialState: {},
            FormComponent: NULL_FORM,
            importRows: NULL_IMPORT,
          } satisfies ImportSourceContributionPayload,
        },
      ],
    });
    const [d] = descriptors();
    expect(d?.id).toBe('com.example.json:json-file');
    expect(d?.pluginId).toBe('com.example.json');
    expect(d?.label).toBe('JSON file');
  });

  it('respects registry priority order (lower wins; leftmost tab)', () => {
    registerContributions('com.example.late', {
      import_sources: [
        {
          id: 'late',
          priority: 300,
          payload: {
            label: 'Late',
            initialState: {},
            FormComponent: NULL_FORM,
            importRows: NULL_IMPORT,
          },
        },
      ],
    });
    registerContributions('com.example.early', {
      import_sources: [
        {
          id: 'early',
          priority: 50,
          payload: {
            label: 'Early',
            initialState: {},
            FormComponent: NULL_FORM,
            importRows: NULL_IMPORT,
          },
        },
      ],
    });
    expect(descriptors().map((d) => d.label)).toEqual(['Early', 'Late']);
  });

  it('descriptor description defaults to empty string when omitted; carries icon + initialState + FormComponent + importRows through', () => {
    const icon = (() => null) as unknown as React.ComponentType<{ className?: string }>;
    registerContributions('com.example.shape', {
      import_sources: [
        {
          id: 'with',
          payload: {
            label: 'With',
            description: 'A description',
            icon,
            initialState: { foo: 'bar' },
            FormComponent: NULL_FORM,
            importRows: NULL_IMPORT,
          },
        },
        {
          id: 'without',
          payload: {
            label: 'Without',
            initialState: {},
            FormComponent: NULL_FORM,
            importRows: NULL_IMPORT,
          },
        },
      ],
    });
    const [a, b] = descriptors();
    expect(a?.description).toBe('A description');
    expect(a?.icon).toBe(icon);
    expect(a?.initialState).toEqual({ foo: 'bar' });
    expect(b?.description).toBe('');
  });
});
