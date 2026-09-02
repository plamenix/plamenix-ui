/**
 * Settings-panel contribution contract (I5.9).
 *
 * The detailed `SettingsPage` historically rendered eight hardcoded
 * sections (Theme / Accent / Layout / Connection / History / Editor /
 * Results / Exports) as an inline `sections` array. This contract
 * lifts each section into a registry contribution so the page is now
 * a registry iterator; built-in `@plamenix-builtin/settings-default-sections`
 * registers the eight legacy sections and third-party plugins add
 * their own ("Notifications" from a Slack plugin, "Diff against
 * backup" from a backup plugin, "Migrations" from an Atlas-style
 * tooling plugin, etc.).
 *
 * Section Components are self-contained — they receive no props and
 * read whatever stores they need directly. Each Component owns its
 * own subscription, so plugin-contributed sections work the same way
 * built-ins do without the host having to prop-drill state slices.
 */

import type { ComponentType } from 'react';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

export interface SettingsPanelContributionPayload {
  /** Section title shown at the top of the rendered card AND as the
   *  nav label in the left rail. */
  title: string;
  /** Optional one-line description rendered under the title. */
  description?: string;
  /** Optional Lucide-style icon used in the nav rail + section
   *  header card. */
  icon?: ComponentType<{ className?: string }>;
  /** Section body component. No props — the Component owns its own
   *  store subscriptions. */
  Component: ComponentType;
  /** Optional group label. Future enhancement — current `SettingsPage`
   *  renders descriptors flat in registry priority order; `group`
   *  is reserved for a future collapsed-groups variant. */
  group?: string;
}

/** Resolved descriptor ready for the SettingsPage iterator. */
export interface SettingsPanelDescriptor {
  /** `<pluginId>:<contributionId>` so two plugins claiming the same
   *  local id never collide. Used as the React key + the nav anchor. */
  id: string;
  pluginId: string;
  title: string;
  description: string;
  icon?: ComponentType<{ className?: string }>;
  Component: ComponentType;
  group: string | null;
}

/** Maps registry contributions into descriptors in registry priority
 *  order (lower number = earlier in the list = appears first in the
 *  nav rail + the body). */
export function pluginContributionsToSettingsPanels(
  contributions: ReadonlyArray<PluginContribution<SettingsPanelContributionPayload>>,
): SettingsPanelDescriptor[] {
  const out: SettingsPanelDescriptor[] = [];
  for (const { pluginId, contribution } of contributions) {
    const p = contribution.payload;
    const desc: SettingsPanelDescriptor = {
      id: `${pluginId}:${contribution.id}`,
      pluginId,
      title: p.title,
      description: p.description ?? '',
      Component: p.Component,
      group: p.group ?? null,
    };
    if (p.icon !== undefined) desc.icon = p.icon;
    out.push(desc);
  }
  return out;
}
