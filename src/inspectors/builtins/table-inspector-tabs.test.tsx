// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  registerBuiltinTableInspectorTabs,
  unregisterBuiltinTableInspectorTabs,
} from './table-inspector-tabs.js';
import {
  pluginContributionsToInspectorTabs,
  type ObjectInspectorContext,
  type ObjectInspectorContributionPayload,
} from '../object-inspector-contract.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry } from '../../plugin-react/registry.js';
import type { TableInfo } from '../../db/types.js';

const TABLE: TableInfo = {
  name: 'CUSTOMERS',
  kind: 'table',
  columns: [
    { name: 'ID', position: 0, sqlType: 'INTEGER', nullable: false },
    { name: 'EMAIL', position: 1, sqlType: 'VARCHAR(255)', nullable: true },
  ],
  primaryKey: ['ID'],
};

function ctxFor(table: TableInfo = TABLE): ObjectInspectorContext {
  return {
    kind: 'table',
    target: table,
    host: { results: null, schema: null, sessionId: null },
  };
}

function descriptors() {
  return pluginContributionsToInspectorTabs(
    registry.getContributions<ObjectInspectorContributionPayload>('object_inspectors'),
    'table',
  );
}

describe('builtin table inspector tabs (I5.4)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    cleanup();
    unregisterBuiltinTableInspectorTabs();
    registry.__reset();
  });

  it('registers three contributions under the built-in namespace at priorities 200/210/220', () => {
    registerBuiltinTableInspectorTabs();
    const contributions = registry.getContributions('object_inspectors');
    expect(contributions).toHaveLength(3);
    expect(contributions.every((c) => c.pluginId === '@plamenix-builtin/table-inspector-tabs')).toBe(true);
    expect(contributions.every((c) => isBuiltinPlugin(c.pluginId))).toBe(true);
    const priorities = contributions.map((c) => c.contribution.priority);
    expect(priorities.sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([200, 210, 220]);
  });

  it('all three tabs (Data, Schema, DDL) surface in left-to-right priority order', () => {
    registerBuiltinTableInspectorTabs();
    const labels = descriptors().map((d) => d.label);
    expect(labels).toEqual(['Data', 'Schema', 'DDL']);
  });

  it('none of the three tabs surface on non-table kinds', () => {
    registerBuiltinTableInspectorTabs();
    for (const kind of ['view', 'procedure', 'trigger', 'generator', 'domain'] as const) {
      const tabs = pluginContributionsToInspectorTabs(
        registry.getContributions<ObjectInspectorContributionPayload>('object_inspectors'),
        kind,
      );
      expect(tabs).toEqual([]);
    }
  });

  it('Schema tab renders the column rows with PK badge on primary-key columns', () => {
    registerBuiltinTableInspectorTabs();
    const schema = descriptors().find((d) => d.label === 'Schema')!;
    render(<schema.Component ctx={ctxFor()} />);
    expect(screen.getByText('ID')).toBeDefined();
    expect(screen.getByText('EMAIL')).toBeDefined();
    expect(screen.getByText('INTEGER')).toBeDefined();
    expect(screen.getByText('VARCHAR(255)')).toBeDefined();
    // PK badge only on the ID column. Two "PK" texts in the DOM:
    // the column header (`<th>`) and the badge (`<span>`) on the
    // ID row; the badge has the accent-color class so filter to it.
    const pkMatches = screen.getAllByText('PK');
    const badges = pkMatches.filter((el) => el.className.includes('text-accent'));
    expect(badges).toHaveLength(1);
  });

  it('DDL tab renders the synthesised CREATE TABLE', () => {
    registerBuiltinTableInspectorTabs();
    const ddl = descriptors().find((d) => d.label === 'DDL')!;
    const { container } = render(<ddl.Component ctx={ctxFor()} />);
    const text = container.textContent ?? '';
    expect(text).toContain('CREATE TABLE CUSTOMERS');
    expect(text).toContain('PRIMARY KEY');
  });

  it('Data tab renders Loading… placeholder when host.results is null/empty', () => {
    registerBuiltinTableInspectorTabs();
    const data = descriptors().find((d) => d.label === 'Data')!;
    const { container } = render(<data.Component ctx={ctxFor()} />);
    expect(container.textContent).toContain('Loading rows…');
  });

  it('teardown unregisters cleanly + re-register works (re-init safe)', () => {
    const teardown = registerBuiltinTableInspectorTabs();
    teardown();
    expect(registry.getContributions('object_inspectors')).toHaveLength(0);
    expect(() => registerBuiltinTableInspectorTabs()).not.toThrow();
    expect(registry.getContributions('object_inspectors')).toHaveLength(3);
  });
});
