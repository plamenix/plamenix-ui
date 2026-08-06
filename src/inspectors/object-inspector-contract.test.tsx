import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  pluginContributionsToInspectorTabs,
  type ObjectInspectorContributionPayload,
} from './object-inspector-contract.js';
import { registry, registerContributions } from '../plugin-react/registry.js';

const NULL_COMP = () => null;

function descriptors(kind: 'table' | 'view' | 'procedure' | 'trigger' | 'generator' | 'domain') {
  return pluginContributionsToInspectorTabs(
    registry.getContributions<ObjectInspectorContributionPayload>('object_inspectors'),
    kind,
  );
}

describe('pluginContributionsToInspectorTabs (I5.4)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    registry.__reset();
  });

  it('filters contributions by applicableKinds', () => {
    registerContributions('com.example.multi', {
      object_inspectors: [
        {
          id: 'table-only',
          payload: {
            label: 'TableOnly',
            applicableKinds: ['table'],
            Component: NULL_COMP,
          } satisfies ObjectInspectorContributionPayload,
        },
        {
          id: 'view-only',
          payload: {
            label: 'ViewOnly',
            applicableKinds: ['view'],
            Component: NULL_COMP,
          },
        },
        {
          id: 'both',
          payload: {
            label: 'Both',
            applicableKinds: ['table', 'view'],
            Component: NULL_COMP,
          },
        },
      ],
    });
    const table = descriptors('table').map((d) => d.label);
    const view = descriptors('view').map((d) => d.label);
    expect(table.sort()).toEqual(['Both', 'TableOnly']);
    expect(view.sort()).toEqual(['Both', 'ViewOnly']);
  });

  it('descriptor id namespaces by pluginId + contribution id', () => {
    registerContributions('com.example.ns', {
      object_inspectors: [
        {
          id: 'stats',
          payload: { label: 'Stats', applicableKinds: ['table'], Component: NULL_COMP },
        },
      ],
    });
    const [d] = descriptors('table');
    expect(d?.id).toBe('com.example.ns:stats');
    expect(d?.pluginId).toBe('com.example.ns');
  });

  it('respects registry priority order — lower number sorts first (leftmost tab)', () => {
    registerContributions('com.example.late', {
      object_inspectors: [
        {
          id: 'late',
          priority: 300,
          payload: { label: 'Late', applicableKinds: ['table'], Component: NULL_COMP },
        },
      ],
    });
    registerContributions('com.example.early', {
      object_inspectors: [
        {
          id: 'early',
          priority: 50,
          payload: { label: 'Early', applicableKinds: ['table'], Component: NULL_COMP },
        },
      ],
    });
    const order = descriptors('table').map((d) => d.label);
    expect(order).toEqual(['Early', 'Late']);
  });

  it('descriptor carries Component + icon through', () => {
    const icon = (() => null) as unknown as React.ComponentType<{ className?: string }>;
    const Body = () => null;
    registerContributions('com.example.shape', {
      object_inspectors: [
        {
          id: 'styled',
          payload: {
            label: 'Styled',
            icon,
            applicableKinds: ['table'],
            Component: Body,
          },
        },
      ],
    });
    const [d] = descriptors('table');
    expect(d?.icon).toBe(icon);
    expect(d?.Component).toBe(Body);
  });

  it('returns empty array when no contributions match the kind', () => {
    registerContributions('com.example.only-procedures', {
      object_inspectors: [
        {
          id: 'proc-only',
          payload: { label: 'P', applicableKinds: ['procedure'], Component: NULL_COMP },
        },
      ],
    });
    expect(descriptors('table')).toEqual([]);
    expect(descriptors('procedure')).toHaveLength(1);
  });
});
