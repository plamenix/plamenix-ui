import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  registerBuiltinDefaultDashboardSections,
  unregisterBuiltinDefaultDashboardSections,
} from './default-sections.js';
import {
  pluginContributionsToDashboardSections,
  type DashboardSectionContributionPayload,
} from '../dashboard-section-contract.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry, registerContributions } from '../../plugin-react/registry.js';

function descriptors() {
  return pluginContributionsToDashboardSections(
    registry.getContributions<DashboardSectionContributionPayload>('dashboard_sections'),
  );
}

describe('builtin default dashboard sections (I5.10)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => {
    unregisterBuiltinDefaultDashboardSections();
    registry.__reset();
  });

  it('registers 2 contributions under the built-in namespace at priorities 220-230', () => {
    registerBuiltinDefaultDashboardSections();
    const contributions = registry.getContributions('dashboard_sections');
    expect(contributions).toHaveLength(2);
    expect(
      contributions.every((c) => c.pluginId === '@plamenix-builtin/dashboard-default-sections'),
    ).toBe(true);
    expect(contributions.every((c) => isBuiltinPlugin(c.pluginId))).toBe(true);
    expect(contributions.map((c) => c.contribution.priority).sort()).toEqual([220, 230]);
  });

  it('sections surface in legacy display order: Tips / Recent queries', () => {
    registerBuiltinDefaultDashboardSections();
    expect(descriptors().map((d) => d.title)).toEqual(['Tips', 'Recent queries']);
  });

  it('connection info and entity counts are not registry sections', () => {
    // They render from WelcomeDashboard's own hero + KPI pills, which
    // read the live DatabaseStats feed. Registering them here too would
    // duplicate them on the Welcome surface.
    registerBuiltinDefaultDashboardSections();
    const titles = descriptors().map((d) => d.title);
    expect(titles).not.toContain('Connection');
    expect(titles).not.toContain('Entity counts');
  });

  it('every descriptor carries an icon + a function Component + default span "full"', () => {
    registerBuiltinDefaultDashboardSections();
    for (const d of descriptors()) {
      expect(d.icon).toBeDefined();
      expect(typeof d.Component).toBe('function');
      expect(d.span).toBe('full');
    }
  });

  it('built-in sections do not declare a refreshIntervalSec (Welcome surface is not periodically refreshed)', () => {
    registerBuiltinDefaultDashboardSections();
    expect(descriptors().every((d) => d.refreshIntervalSec === null)).toBe(true);
  });

  it('third-party section at default priority 100 sorts ahead of built-ins (community-extends-shell convention)', () => {
    registerBuiltinDefaultDashboardSections();
    registerContributions('com.example.active-sessions', {
      dashboard_sections: [
        {
          id: 'active',
          payload: { title: 'Active sessions', Component: () => null },
        },
      ],
    });
    expect(descriptors()[0]?.title).toBe('Active sessions');
  });

  it('teardown unregisters cleanly + re-register works', () => {
    const teardown = registerBuiltinDefaultDashboardSections();
    teardown();
    expect(registry.getContributions('dashboard_sections')).toHaveLength(0);
    expect(() => registerBuiltinDefaultDashboardSections()).not.toThrow();
    expect(registry.getContributions('dashboard_sections')).toHaveLength(2);
  });
});
