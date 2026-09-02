import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  registerBuiltinDefaultStatusBarItems,
  unregisterBuiltinDefaultStatusBarItems,
} from './default-items.js';
import {
  pluginContributionsToStatusBarItems,
  statusBarItemsByAlignment,
  type StatusBarItemContributionPayload,
} from '../status-bar-item-contract.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry, registerContributions } from '../../plugin-react/registry.js';

function descriptors() {
  return pluginContributionsToStatusBarItems(
    registry.getContributions<StatusBarItemContributionPayload>('status_bar_items'),
  );
}

describe('builtin default status-bar items (I5.11)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => {
    unregisterBuiltinDefaultStatusBarItems();
    registry.__reset();
  });

  it('registers 5 contributions under the built-in namespace at priorities 200-240', () => {
    registerBuiltinDefaultStatusBarItems();
    const contributions = registry.getContributions('status_bar_items');
    expect(contributions).toHaveLength(5);
    expect(
      contributions.every((c) => c.pluginId === '@plamenix-builtin/status-bar-default-items'),
    ).toBe(true);
    expect(contributions.every((c) => isBuiltinPlugin(c.pluginId))).toBe(true);
    expect(contributions.map((c) => c.contribution.priority).sort()).toEqual([
      200, 210, 220, 230, 240,
    ]);
  });

  it('all five built-in items are left-aligned (right side reserved for I5.3 buttons + brand)', () => {
    registerBuiltinDefaultStatusBarItems();
    const left = statusBarItemsByAlignment(descriptors(), 'left');
    const right = statusBarItemsByAlignment(descriptors(), 'right');
    expect(left).toHaveLength(5);
    expect(right).toHaveLength(0);
  });

  it('items surface in legacy left-to-right order: health-dot / dsn-and-copy / table-from-sql / row-count / last-duration', () => {
    registerBuiltinDefaultStatusBarItems();
    const localIds = descriptors().map((d) => d.id.split(':').pop());
    expect(localIds).toEqual([
      'health-dot',
      'dsn-and-copy',
      'table-from-sql',
      'row-count',
      'last-duration',
    ]);
  });

  it('third-party left item at default priority 100 sorts ahead of built-ins (community-extends-shell)', () => {
    registerBuiltinDefaultStatusBarItems();
    registerContributions('com.example.slow', {
      status_bar_items: [
        {
          id: 'slow-query-badge',
          payload: { alignment: 'left', Component: () => null },
        },
      ],
    });
    const left = statusBarItemsByAlignment(descriptors(), 'left');
    expect(left[0]?.id).toBe('com.example.slow:slow-query-badge');
  });

  it('teardown unregisters cleanly + re-register works', () => {
    const teardown = registerBuiltinDefaultStatusBarItems();
    teardown();
    expect(registry.getContributions('status_bar_items')).toHaveLength(0);
    expect(() => registerBuiltinDefaultStatusBarItems()).not.toThrow();
    expect(registry.getContributions('status_bar_items')).toHaveLength(5);
  });
});
