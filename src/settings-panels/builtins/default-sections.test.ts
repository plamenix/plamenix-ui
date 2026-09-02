import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  registerBuiltinDefaultSettingsSections,
  unregisterBuiltinDefaultSettingsSections,
} from './default-sections.js';
import {
  pluginContributionsToSettingsPanels,
  type SettingsPanelContributionPayload,
} from '../settings-panel-contract.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry, registerContributions } from '../../plugin-react/registry.js';

function descriptors() {
  return pluginContributionsToSettingsPanels(
    registry.getContributions<SettingsPanelContributionPayload>('settings_panels'),
  );
}

describe('builtin default settings sections (I5.9)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => {
    unregisterBuiltinDefaultSettingsSections();
    registry.__reset();
  });

  it('registers 8 contributions under the built-in namespace at priorities 200-270', () => {
    registerBuiltinDefaultSettingsSections();
    const contributions = registry.getContributions('settings_panels');
    expect(contributions).toHaveLength(8);
    expect(
      contributions.every((c) => c.pluginId === '@plamenix-builtin/settings-default-sections'),
    ).toBe(true);
    expect(contributions.every((c) => isBuiltinPlugin(c.pluginId))).toBe(true);
    const priorities = contributions.map((c) => c.contribution.priority).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(priorities).toEqual([200, 210, 220, 230, 240, 250, 260, 270]);
  });

  it('eight sections surface in legacy display order: Theme / Accent / Layout / Connection / History / Editor / Results / Exports', () => {
    registerBuiltinDefaultSettingsSections();
    const titles = descriptors().map((d) => d.title);
    expect(titles).toEqual([
      'Theme',
      'Accent',
      'Layout',
      'Connection',
      'History',
      'Editor',
      'Results',
      'Exports',
    ]);
  });

  it('every descriptor carries an icon + a description (Components defined)', () => {
    registerBuiltinDefaultSettingsSections();
    for (const d of descriptors()) {
      expect(d.icon).toBeDefined();
      expect(d.description.length).toBeGreaterThan(0);
      expect(typeof d.Component).toBe('function');
    }
  });

  it('third-party section at default priority 100 sorts ahead of built-ins (200-range)', () => {
    registerBuiltinDefaultSettingsSections();
    registerContributions('com.example.notifications', {
      settings_panels: [
        {
          id: 'notifications',
          payload: { title: 'Notifications', Component: () => null },
        },
      ],
    });
    expect(descriptors()[0]?.title).toBe('Notifications');
  });

  it('teardown unregisters cleanly + re-register works (re-init safe)', () => {
    const teardown = registerBuiltinDefaultSettingsSections();
    teardown();
    expect(registry.getContributions('settings_panels')).toHaveLength(0);
    expect(() => registerBuiltinDefaultSettingsSections()).not.toThrow();
    expect(registry.getContributions('settings_panels')).toHaveLength(8);
  });
});
