/**
 * Sidebar-panel contribution-point contract.
 *
 * `sidebar_panels` was the first (and originally only) contribution
 * point consumed by the shell — the [`PluginsSidebar`] component reads
 * panels from each loaded plugin's `ActivePlugin.sidebarPanels` array
 * (delivered through the napi binding / Tauri command pipeline) and
 * renders them grouped by plugin with lifecycle chrome (logs,
 * activation status, permission state).
 *
 * I3.7 confirms that contract stays consistent with the new
 * registry-based pattern from I3.1 onward. Two paths can serve
 * sidebar_panels simultaneously:
 *
 * 1. **Per-plugin grouped view** — `PluginsSidebar`'s existing path.
 *    Reads `ActivePlugin[]` props that carry per-plugin lifecycle +
 *    permissions metadata. Used for the dedicated plugin-manager
 *    panel in the shell. **Not changing.**
 *
 * 2. **Flat registry view** — any future consumer that wants a flat
 *    list of contributed panels regardless of which plugin supplied
 *    them (e.g. a global activity overlay, status-bar quick-picker)
 *    reads via `usePluginContributions<SidebarPanelContributionPayload>('sidebar_panels')`.
 *
 * Both are first-class. The host wrapper in I4 dual-publishes: keeps
 * feeding `ActivePlugin.sidebarPanels` for path 1, AND fuses
 * manifest-declared `[[contributions.sidebar_panels]]` into the
 * registry via the `extraContributions` LoadOptions from I3.2 for
 * path 2.
 *
 * `SidebarPanelContributionPayload` mirrors the existing
 * [`SidebarPanelInfo`] structurally (minus the structural `id` that
 * the registry already tracks per-contribution), so plugin authors
 * write one shape that satisfies both paths.
 */

import type { PluginContribution } from '../plugin-react/usePluginContributions.js';
import type { SidebarPanelInfo } from './types.js';

export interface SidebarPanelContributionPayload {
  /** Human-readable label shown in the sidebar. */
  label: string;
  /** Optional Lucide icon name (string token resolved by the host). */
  icon?: string;
}

/**
 * Maps registry contributions to the [`SidebarPanelInfo`] shape
 * `PluginsSidebar` and downstream consumers expect. Mirror of
 * `pluginContributionsToExportButtons` / `pluginContributionsToCommands`
 * from I3.5 / I3.6. Plugin id is NOT prefixed in the resulting `id`
 * (existing `SidebarPanelInfo` uses bare contribution id since the
 * `ActivePlugin` wrapper already supplies the per-plugin grouping
 * context); flat-list consumers that need disambiguation across
 * plugins read the corresponding `PluginContribution.pluginId`.
 */
export function pluginContributionsToSidebarPanels(
  contributions: ReadonlyArray<PluginContribution<SidebarPanelContributionPayload>>,
): SidebarPanelInfo[] {
  return contributions.map(({ contribution }) => {
    const info: SidebarPanelInfo = {
      id: contribution.id,
      label: contribution.payload.label,
    };
    if (contribution.payload.icon !== undefined) {
      info.icon = contribution.payload.icon;
    }
    return info;
  });
}
