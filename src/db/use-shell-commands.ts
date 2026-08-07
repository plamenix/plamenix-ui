import { useMemo } from 'react';
import {
  History,
  Keyboard,
  LogOut,
  Moon,
  PanelLeftClose,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Save,
  Sun,
  X,
} from 'lucide-react';
import type { Command } from './CommandPalette.js';

/**
 * The command-palette entries both editions offer.
 *
 * This was 127 byte-identical lines in each shell's `App.tsx` — not
 * near-identical, identical, down to the memo's dependency array. Which
 * is unsurprising: the palette is a description of what the product can
 * do, and the product is the same product on both editions. Only the
 * functions behind the entries differ, and those are already the
 * shells' own.
 *
 * Plugin-contributed commands are not assembled here. The host merges
 * them with this list, because a plugin's commands depend on which
 * plugins that edition has activated.
 */

/** Everything an entry needs to decide whether to appear and what to do. */
export interface ShellCommandOptions {
  /** Platform modifier prefix for shortcut hints — `⌘` or `Ctrl+`.
   *  Supplied by the host because it is the host that knows the
   *  platform; `getModKeyLabel()` is the usual source. */
  mod: string;
  /** Current theme, for the toggle's label and icon. The entry names
   *  the theme it switches *to*, which is the one the user is asking
   *  for when they read it. */
  themeMode: 'light' | 'dark';
  /** Whether the active tab holds a session. Connection commands and
   *  session commands are mutually exclusive: offering "Disconnect" on a
   *  tab with nothing to disconnect is a dead entry in the palette. */
  hasSession: boolean;
  /** Whether the active tab was opened from a saved profile. History is
   *  recorded per profile, so a profile-less session has none to show. */
  hasProfile: boolean;

  newTab: () => void;
  closeTab: () => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  showShortcuts: () => void;
  saveProfile: () => void;
  connect: () => void;
  execute: () => void;
  refreshSchema: () => void;
  disconnect: () => void;
  openHistory: () => void;
}

/**
 * Builds the palette entries for the current tab.
 *
 * Memoised on everything it reads, handlers included — which is what
 * both shells already did, and what keeps the entries honest when a
 * host swaps a handler out.
 */
export function useShellCommands(options: ShellCommandOptions): Command[] {
  const {
    mod,
    themeMode,
    hasSession,
    hasProfile,
    newTab,
    closeTab,
    toggleTheme,
    toggleSidebar,
    showShortcuts,
    saveProfile,
    connect,
    execute,
    refreshSchema,
    disconnect,
    openHistory,
  } = options;

  return useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: 'new-tab',
        label: 'New tab',
        description: 'Open a fresh disconnected session',
        icon: Plus,
        shortcut: `${mod}T`,
        group: 'Tabs',
        run: () => newTab(),
      },
      {
        id: 'close-tab',
        label: 'Close tab',
        description: 'Close the active session and tab',
        icon: X,
        shortcut: `${mod}W`,
        group: 'Tabs',
        run: () => closeTab(),
      },
      {
        id: 'toggle-theme',
        label: `Switch to ${themeMode === 'dark' ? 'light' : 'dark'} theme`,
        description: 'Flip the Plamenix theme',
        icon: themeMode === 'dark' ? Sun : Moon,
        group: 'Appearance',
        run: () => toggleTheme(),
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle schema sidebar',
        description: 'Collapse or expand the schema browser',
        icon: PanelLeftClose,
        group: 'Appearance',
        run: () => toggleSidebar(),
      },
      {
        id: 'show-shortcuts',
        label: 'Show keyboard shortcuts',
        description: 'Cheat sheet of every shortcut Plamenix exposes',
        icon: Keyboard,
        shortcut: '?',
        group: 'Help',
        run: () => showShortcuts(),
      },
    ];

    if (!hasSession) {
      list.push(
        {
          id: 'save-profile',
          label: 'Save connection profile',
          description: 'Persist the current form values',
          icon: Save,
          shortcut: `${mod}S`,
          group: 'Connection',
          run: () => saveProfile(),
        },
        {
          id: 'connect',
          label: 'Connect',
          description: 'Open a session against the current form',
          icon: Plug,
          shortcut: `${mod}↵`,
          group: 'Connection',
          run: () => connect(),
        },
      );
      return list;
    }

    list.push(
      {
        id: 'execute',
        label: 'Execute SQL',
        description: 'Run the current editor buffer',
        icon: Play,
        // Deliberately the same chord as Connect above: the two never
        // coexist, and one muscle memory for "do the thing this screen
        // is for" beats two.
        shortcut: `${mod}↵`,
        group: 'Session',
        run: () => execute(),
      },
      {
        id: 'refresh-schema',
        label: 'Refresh schema',
        description: 'Reload the table / view list',
        icon: RefreshCw,
        group: 'Session',
        run: () => refreshSchema(),
      },
      {
        id: 'disconnect',
        label: 'Disconnect',
        description: 'Close the active session',
        icon: LogOut,
        group: 'Session',
        run: () => disconnect(),
      },
    );

    if (hasProfile) {
      list.push({
        id: 'history',
        label: 'Show query history',
        description: 'Browse and replay statements run under this profile',
        icon: History,
        group: 'Session',
        run: () => openHistory(),
      });
    }
    return list;
  }, [
    mod,
    themeMode,
    hasSession,
    hasProfile,
    newTab,
    closeTab,
    toggleTheme,
    toggleSidebar,
    showShortcuts,
    saveProfile,
    connect,
    execute,
    refreshSchema,
    disconnect,
    openHistory,
  ]);
}
