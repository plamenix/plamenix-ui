import { describe, expect, it } from 'vitest';
import {
  pluginContributionsToSidebarPanels,
  type SidebarPanelContributionPayload,
} from './sidebar-panel-contract.js';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';
import type { SidebarPanelInfo } from './types.js';

function entry(
  id: string,
  payload: SidebarPanelContributionPayload,
  pluginId = `plg.${id}`,
): PluginContribution<SidebarPanelContributionPayload> {
  return { pluginId, contribution: { id, payload } };
}

describe('pluginContributionsToSidebarPanels', () => {
  it('maps an empty list to an empty array', () => {
    expect(pluginContributionsToSidebarPanels([])).toEqual([]);
  });

  it('produces SidebarPanelInfo entries that match the existing PluginsSidebar contract', () => {
    const out: SidebarPanelInfo[] = pluginContributionsToSidebarPanels([
      entry('inbox', { label: 'Inbox', icon: 'inbox' }),
    ]);
    expect(out).toEqual([{ id: 'inbox', label: 'Inbox', icon: 'inbox' }]);
  });

  it('keeps the bare contribution id (no pluginId prefix) — PluginsSidebar groups by plugin separately', () => {
    const out = pluginContributionsToSidebarPanels([
      entry('p', { label: 'P' }, 'com.acme.x'),
    ]);
    expect(out[0]?.id).toBe('p');
  });

  it('omits icon when payload does not define one (exactOptionalPropertyTypes-safe)', () => {
    const out = pluginContributionsToSidebarPanels([
      entry('no-icon', { label: 'No icon' }),
    ]);
    expect('icon' in out[0]!).toBe(false);
  });

  it('threads icon through when present', () => {
    const out = pluginContributionsToSidebarPanels([
      entry('iconed', { label: 'Iconed', icon: 'sparkles' }),
    ]);
    expect(out[0]?.icon).toBe('sparkles');
  });

  it('preserves array order — registry already priority-sorts upstream', () => {
    const out = pluginContributionsToSidebarPanels([
      entry('first', { label: 'First' }),
      entry('second', { label: 'Second' }),
      entry('third', { label: 'Third' }),
    ]);
    expect(out.map((p) => p.id)).toEqual(['first', 'second', 'third']);
  });
});
