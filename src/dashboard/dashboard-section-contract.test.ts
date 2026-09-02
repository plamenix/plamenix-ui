import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  pluginContributionsToDashboardSections,
  type DashboardSectionContributionPayload,
} from './dashboard-section-contract.js';
import { registry, registerContributions } from '../plugin-react/registry.js';

const NULL_COMP = () => null;

function descriptors() {
  return pluginContributionsToDashboardSections(
    registry.getContributions<DashboardSectionContributionPayload>('dashboard_sections'),
  );
}

describe('pluginContributionsToDashboardSections (I5.10)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => registry.__reset());

  it('descriptor id namespaces by pluginId + contribution id', () => {
    registerContributions('com.example.sessions', {
      dashboard_sections: [
        {
          id: 'active',
          payload: {
            title: 'Active sessions',
            Component: NULL_COMP,
          } satisfies DashboardSectionContributionPayload,
        },
      ],
    });
    const [d] = descriptors();
    expect(d?.id).toBe('com.example.sessions:active');
    expect(d?.pluginId).toBe('com.example.sessions');
    expect(d?.title).toBe('Active sessions');
  });

  it('respects registry priority order (lower wins)', () => {
    registerContributions('com.example.late', {
      dashboard_sections: [
        {
          id: 'late',
          priority: 300,
          payload: { title: 'Late', Component: NULL_COMP },
        },
      ],
    });
    registerContributions('com.example.early', {
      dashboard_sections: [
        {
          id: 'early',
          priority: 50,
          payload: { title: 'Early', Component: NULL_COMP },
        },
      ],
    });
    expect(descriptors().map((d) => d.title)).toEqual(['Early', 'Late']);
  });

  it('defaults title to empty string, refreshIntervalSec to null, span to "full"', () => {
    registerContributions('com.example.defaults', {
      dashboard_sections: [
        { id: 'd', payload: { Component: NULL_COMP } },
      ],
    });
    const [d] = descriptors();
    expect(d?.title).toBe('');
    expect(d?.refreshIntervalSec).toBeNull();
    expect(d?.span).toBe('full');
  });

  it('carries refreshIntervalSec + span overrides through', () => {
    registerContributions('com.example.live', {
      dashboard_sections: [
        {
          id: 'half-live',
          payload: {
            title: 'Live',
            Component: NULL_COMP,
            refreshIntervalSec: 5,
            span: 'half',
          },
        },
      ],
    });
    const [d] = descriptors();
    expect(d?.refreshIntervalSec).toBe(5);
    expect(d?.span).toBe('half');
  });
});
