import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  pluginContributionsToSettingsPanels,
  type SettingsPanelContributionPayload,
} from './settings-panel-contract.js';
import { registry, registerContributions } from '../plugin-react/registry.js';

const NULL_COMP = () => null;

function descriptors() {
  return pluginContributionsToSettingsPanels(
    registry.getContributions<SettingsPanelContributionPayload>('settings_panels'),
  );
}

describe('pluginContributionsToSettingsPanels (I5.9)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => registry.__reset());

  it('descriptor id namespaces by pluginId + contribution id', () => {
    registerContributions('com.example.notifications', {
      settings_panels: [
        {
          id: 'slack',
          payload: {
            title: 'Notifications',
            Component: NULL_COMP,
          } satisfies SettingsPanelContributionPayload,
        },
      ],
    });
    const [d] = descriptors();
    expect(d?.id).toBe('com.example.notifications:slack');
    expect(d?.pluginId).toBe('com.example.notifications');
    expect(d?.title).toBe('Notifications');
  });

  it('respects registry priority order (lower wins; leftmost in nav)', () => {
    registerContributions('com.example.late', {
      settings_panels: [
        {
          id: 'late',
          priority: 300,
          payload: { title: 'Late', Component: NULL_COMP },
        },
      ],
    });
    registerContributions('com.example.early', {
      settings_panels: [
        {
          id: 'early',
          priority: 50,
          payload: { title: 'Early', Component: NULL_COMP },
        },
      ],
    });
    expect(descriptors().map((d) => d.title)).toEqual(['Early', 'Late']);
  });

  it('descriptor carries description + icon + Component through; description defaults to empty string', () => {
    const icon = (() => null) as unknown as React.ComponentType<{ className?: string }>;
    const Body = () => null;
    registerContributions('com.example.shape', {
      settings_panels: [
        {
          id: 'with',
          payload: {
            title: 'With',
            description: 'A description',
            icon,
            Component: Body,
          },
        },
        {
          id: 'without',
          payload: { title: 'Without', Component: NULL_COMP },
        },
      ],
    });
    const [a, b] = descriptors();
    expect(a?.description).toBe('A description');
    expect(a?.icon).toBe(icon);
    expect(a?.Component).toBe(Body);
    expect(b?.description).toBe('');
  });
});
