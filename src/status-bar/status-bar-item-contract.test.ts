import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  pluginContributionsToStatusBarItems,
  statusBarItemsByAlignment,
  type StatusBarItemContributionPayload,
} from './status-bar-item-contract.js';
import { registry, registerContributions } from '../plugin-react/registry.js';

const NULL_COMP = () => null;

function descriptors() {
  return pluginContributionsToStatusBarItems(
    registry.getContributions<StatusBarItemContributionPayload>('status_bar_items'),
  );
}

describe('pluginContributionsToStatusBarItems (I5.11)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => registry.__reset());

  it('descriptor id namespaces by pluginId + contribution id', () => {
    registerContributions('com.example.tz', {
      status_bar_items: [
        {
          id: 'server-timezone',
          payload: {
            alignment: 'right',
            Component: NULL_COMP,
          } satisfies StatusBarItemContributionPayload,
        },
      ],
    });
    const [d] = descriptors();
    expect(d?.id).toBe('com.example.tz:server-timezone');
    expect(d?.pluginId).toBe('com.example.tz');
    expect(d?.alignment).toBe('right');
  });

  it('respects registry priority order (lower wins within an alignment group)', () => {
    registerContributions('com.example.late', {
      status_bar_items: [
        {
          id: 'late',
          priority: 300,
          payload: { alignment: 'left', Component: NULL_COMP },
        },
      ],
    });
    registerContributions('com.example.early', {
      status_bar_items: [
        {
          id: 'early',
          priority: 50,
          payload: { alignment: 'left', Component: NULL_COMP },
        },
      ],
    });
    expect(descriptors().map((d) => d.id)).toEqual([
      'com.example.early:early',
      'com.example.late:late',
    ]);
  });
});

describe('statusBarItemsByAlignment (I5.11)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => registry.__reset());

  it('partitions descriptors by alignment field', () => {
    registerContributions('com.example.mixed', {
      status_bar_items: [
        { id: 'L1', payload: { alignment: 'left', Component: NULL_COMP } },
        { id: 'R1', payload: { alignment: 'right', Component: NULL_COMP } },
        { id: 'L2', payload: { alignment: 'left', Component: NULL_COMP } },
      ],
    });
    const all = descriptors();
    const left = statusBarItemsByAlignment(all, 'left');
    const right = statusBarItemsByAlignment(all, 'right');
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(1);
    expect(left.map((d) => d.id.split(':').pop())).toEqual(['L1', 'L2']);
    expect(right[0]?.id.endsWith(':R1')).toBe(true);
  });
});
