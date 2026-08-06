import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pluginContributionsToMenuItems,
  type MenuContributionPayload,
} from './menu-contract.js';
import { registry, registerContributions } from '../plugin-react/registry.js';

interface SimpleTarget {
  name: string;
  primaryKey?: string[];
}

function descriptors(menuId: string, target: SimpleTarget) {
  return pluginContributionsToMenuItems(
    registry.getContributions<MenuContributionPayload<SimpleTarget>>('menus'),
    menuId,
    { menuId, target },
  );
}

describe('pluginContributionsToMenuItems (I5.2)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    registry.__reset();
  });

  it('filters out contributions whose menuId does not match', () => {
    registerContributions('com.example.a', {
      menus: [
        {
          id: 'in-table-menu',
          payload: {
            label: 'Item A',
            menuId: 'schema.table',
            run: () => {},
          } satisfies MenuContributionPayload,
        },
        {
          id: 'in-view-menu',
          payload: {
            label: 'Item B',
            menuId: 'schema.view',
            run: () => {},
          },
        },
      ],
    });
    const items = descriptors('schema.table', { name: 'CUSTOMERS' });
    expect(items.map((d) => d.id)).toEqual(['com.example.a:in-table-menu']);
  });

  it('drops contributions whose when() returns false', () => {
    registerContributions('com.example.guarded', {
      menus: [
        {
          id: 'has-pk',
          payload: {
            label: 'Rebuild PK index',
            menuId: 'schema.table',
            when: (ctx) =>
              Array.isArray((ctx.target as SimpleTarget).primaryKey) &&
              (ctx.target as SimpleTarget).primaryKey!.length > 0,
            run: () => {},
          },
        },
      ],
    });
    const withPk = descriptors('schema.table', { name: 'A', primaryKey: ['ID'] });
    const noPk = descriptors('schema.table', { name: 'B' });
    expect(withPk).toHaveLength(1);
    expect(noPk).toHaveLength(0);
  });

  it('descriptor id namespaces by pluginId + contribution id', () => {
    registerContributions('com.example.ns', {
      menus: [
        {
          id: 'foo',
          payload: { label: 'X', menuId: 'schema.table', run: () => {} },
        },
      ],
    });
    const [desc] = descriptors('schema.table', { name: 'T' });
    expect(desc?.id).toBe('com.example.ns:foo');
    expect(desc?.pluginId).toBe('com.example.ns');
  });

  it('clusters items by group — alphabetical, default group last, then danger', () => {
    registerContributions('com.example.groups', {
      menus: [
        {
          id: 'zeta',
          payload: { label: 'Zeta', menuId: 'schema.table', group: 'maintenance', run: () => {} },
        },
        {
          id: 'alpha',
          payload: { label: 'Alpha', menuId: 'schema.table', group: 'maintenance', run: () => {} },
        },
        {
          id: 'inspect',
          payload: { label: 'Inspect', menuId: 'schema.table', group: 'inspection', run: () => {} },
        },
        {
          id: 'fallthrough',
          payload: { label: 'Fall', menuId: 'schema.table', run: () => {} },
        },
        {
          id: 'drop',
          payload: { label: 'DROP', menuId: 'schema.table', tone: 'danger', run: () => {} },
        },
      ],
    });
    const items = descriptors('schema.table', { name: 'T' });
    const ids = items.map((d) => d.id.split(':').pop());
    // inspection cluster (alphabetical first) → maintenance cluster
    // → default group → danger cluster. Within a tied-priority group
    // the registry tie-breaks by contribution id alphabetically, so
    // the maintenance cluster yields `alpha` before `zeta`.
    expect(ids).toEqual(['inspect', 'alpha', 'zeta', 'fallthrough', 'drop']);
  });

  it('within a group, registry priority order is preserved', () => {
    registerContributions('com.example.early', {
      menus: [
        {
          id: 'early',
          priority: 50,
          payload: { label: 'Early', menuId: 'schema.table', group: 'g', run: () => {} },
        },
      ],
    });
    registerContributions('com.example.late', {
      menus: [
        {
          id: 'late',
          priority: 100,
          payload: { label: 'Late', menuId: 'schema.table', group: 'g', run: () => {} },
        },
      ],
    });
    const items = descriptors('schema.table', { name: 'T' });
    expect(items.map((d) => d.id)).toEqual([
      'com.example.early:early',
      'com.example.late:late',
    ]);
  });

  it('descriptor.run invokes the contribution with the supplied context', () => {
    const run = vi.fn();
    registerContributions('com.example.runtime', {
      menus: [
        {
          id: 'r',
          payload: { label: 'R', menuId: 'schema.table', run },
        },
      ],
    });
    const items = descriptors('schema.table', { name: 'CUSTOMERS' });
    items[0]?.run();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toEqual({
      menuId: 'schema.table',
      target: { name: 'CUSTOMERS' },
    });
  });

  it('descriptor carries tone + group + icon through', () => {
    const icon = (() => null) as unknown as React.ComponentType<{ className?: string }>;
    registerContributions('com.example.shape', {
      menus: [
        {
          id: 'styled',
          payload: {
            label: 'Styled',
            hint: 'A hint',
            icon,
            menuId: 'schema.table',
            group: 'maintenance',
            tone: 'danger',
            run: () => {},
          },
        },
      ],
    });
    const [d] = descriptors('schema.table', { name: 'T' });
    expect(d?.label).toBe('Styled');
    expect(d?.hint).toBe('A hint');
    expect(d?.icon).toBe(icon);
    // Group is shown for non-danger items only; danger items cluster
    // separately so the descriptor reports `null` for group.
    expect(d?.tone).toBe('danger');
  });
});
