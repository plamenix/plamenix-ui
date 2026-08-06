/**
 * Commands contribution-point contract.
 *
 * Plugins contribute palette + future menu/keybinding entries by
 * registering at the `commands` extension point with this payload.
 * The shell's CommandPalette merges built-in commands with the
 * registry's contributions; click / Enter invokes the payload's
 * `run` closure directly.
 *
 * **Keybindings + menus deferred**: I3.6 ships the `commands`
 * contract alone. `keybindings` + `menus` extension points are
 * documented in `plamenix/docs/contribution-points.md` and will
 * land in I5 (alongside their consumers — the keydown dispatcher
 * and context-menu builders that don't exist as plugin surfaces
 * yet). Plugin commands without an associated keybinding still
 * surface in the palette today.
 *
 * Built-in extracts (the existing palette entries the desktop / web
 * apps assemble inline in App.tsx becoming
 * `@plamenix-builtin/<feature>-commands` registrations) land in I4.
 */

import type { ComponentType } from 'react';
import type { Command } from './CommandPalette.js';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/**
 * Plugin-side command contribution. Same shape as the shell's
 * `Command` (so plugin authors don't have to translate when reading
 * existing palette docs) minus the structural `id` (which the
 * registry already tracks per-contribution): the plugin id +
 * contribution id together form the final `Command.id`.
 */
export interface CommandContributionPayload {
  /** Display label shown in the palette and any future menu entry. */
  label: string;
  /** Optional secondary text under the label. */
  description?: string;
  /** Optional keyboard shortcut hint (e.g. "⌘K"). Renders as `<kbd>`
   *  in the palette. Note: this is a HINT only — the actual keydown
   *  handler is wired via a future `keybindings` contribution. */
  shortcut?: string;
  /** Optional Lucide icon component (Plamenix UI ships
   *  `lucide-react` as an externalised peer dep). */
  icon?: ComponentType<{ className?: string }>;
  /** Section heading; consecutive entries with the same group
   *  cluster in the palette. Plugin commands typically group under
   *  the plugin's display name. */
  group?: string;
  /** Fired when the user picks this command. The palette closes
   *  after; the plugin handles any async side effects internally. */
  run: () => void;
}

/**
 * Pure mapper: registry contributions → `Command[]` ready to spread
 * into the shell's existing `CommandPalette commands` prop. Built-in
 * commands assembled inline in the host App.tsx stay alongside until
 * I4 extracts them; this helper appends plugin contributions.
 */
export function pluginContributionsToCommands(
  contributions: ReadonlyArray<PluginContribution<CommandContributionPayload>>,
): Command[] {
  return contributions.map(({ pluginId, contribution }) => {
    const cmd: Command = {
      // `<pluginId>:<localId>` so two plugins claiming the same local
      // command id do not collide on React keys + palette dispatch.
      id: `${pluginId}:${contribution.id}`,
      label: contribution.payload.label,
      run: contribution.payload.run,
    };
    if (contribution.payload.description !== undefined) {
      cmd.description = contribution.payload.description;
    }
    if (contribution.payload.shortcut !== undefined) {
      cmd.shortcut = contribution.payload.shortcut;
    }
    if (contribution.payload.icon !== undefined) {
      cmd.icon = contribution.payload.icon;
    }
    if (contribution.payload.group !== undefined) {
      cmd.group = contribution.payload.group;
    }
    return cmd;
  });
}
