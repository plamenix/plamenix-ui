/**
 * Built-in default keybindings (I5.1) — extracts the six shell-default
 * global combos historically wired by the inline `keydown` switch in
 * both editions' `App.tsx`. After this registration the registry is
 * the single source of truth for those combos; a third-party plugin
 * can register a higher-priority binding to override any of them
 * without forking the shell.
 *
 * Bindings registered under `@plamenix-builtin/default-keybindings`:
 *
 *   | Combo         | Command             | When                    |
 *   |---------------|---------------------|-------------------------|
 *   | `?`           | Open cheat sheet    | `!ctx.isTyping`         |
 *   | `Mod+Shift+F` | Open search palette | always                  |
 *   | `Mod+K`       | Open command palette| always                  |
 *   | `Mod+T`       | New tab             | always                  |
 *   | `Mod+W`       | Close active tab    | always                  |
 *   | `Mod+S`       | Save active profile | `canSaveProfile`        |
 *
 * The shell passes a `DefaultKeybindingHandlers` bundle at register
 * time — the same closures the inline switch used to call directly
 * (`h.setShortcutsOpen`, `h.setPaletteOpen`, etc.). The `Mod+S`
 * binding's `canSaveProfile` is a separate callback because the
 * legacy handler checked three live conditions before saving
 * (`activeTab.sessionId === null` && `profileName !== ''` && `!busy`).
 * Lifting that into a host-supplied predicate keeps the built-in
 * stateless while preserving the original behaviour exactly.
 */

import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import type { KeybindingContributionPayload } from '../keybinding-contract.js';

const BUILTIN_NAME = 'default-keybindings';

/** Closures the shell hands the built-in at register time. Each maps
 *  1:1 onto a method the inline `keydown` switch used to call. */
export interface DefaultKeybindingHandlers {
  /** Opens the keyboard cheat-sheet modal (the `?` binding). */
  openCheatSheet(): void;
  /** Opens the wildcard search palette (`Mod+Shift+F`). */
  openSearchPalette(): void;
  /** Opens the command palette (`Mod+K`). */
  openCommandPalette(): void;
  /** Spawns a new tab (`Mod+T`). */
  newTab(): void;
  /** Closes the active tab (`Mod+W`). */
  closeActiveTab(): void;
  /** `Mod+S` predicate — gates the save binding. Returning `false`
   *  lets the event pass through unclaimed so the browser's default
   *  Save behaviour (or the next matching binding) gets a turn. */
  canSaveProfile(): boolean;
  /** Saves the active profile (`Mod+S` when `canSaveProfile()`). */
  saveActiveProfile(): void;
}

/**
 * Registers the six shell-default keybindings. Call once at App
 * mount with the live handler closures; the returned closure
 * unregisters on unmount.
 */
export function registerBuiltinDefaultKeybindings(
  h: DefaultKeybindingHandlers,
): () => void {
  const bindings: { id: string; payload: KeybindingContributionPayload }[] = [
    {
      id: 'open-cheat-sheet',
      payload: {
        label: 'Open keyboard cheat sheet',
        combo: '?',
        when: (ctx) => !ctx.isTyping,
        run: () => {
          h.openCheatSheet();
          return true;
        },
      },
    },
    {
      id: 'open-search-palette',
      payload: {
        label: 'Search across the active schema',
        combo: 'Mod+Shift+F',
        run: () => {
          h.openSearchPalette();
          return true;
        },
      },
    },
    {
      id: 'open-command-palette',
      payload: {
        label: 'Open command palette',
        combo: 'Mod+K',
        run: () => {
          h.openCommandPalette();
          return true;
        },
      },
    },
    {
      id: 'new-tab',
      payload: {
        label: 'New query tab',
        combo: 'Mod+T',
        run: () => {
          h.newTab();
          return true;
        },
      },
    },
    {
      id: 'close-active-tab',
      payload: {
        label: 'Close active tab',
        combo: 'Mod+W',
        run: () => {
          h.closeActiveTab();
          return true;
        },
      },
    },
    {
      id: 'save-active-profile',
      payload: {
        label: 'Save active connection profile',
        combo: 'Mod+S',
        when: () => h.canSaveProfile(),
        run: () => {
          h.saveActiveProfile();
          return true;
        },
      },
    },
  ];

  registerBuiltin(BUILTIN_NAME, {
    keybindings: bindings.map((b) => ({
      id: b.id,
      // Default priority 100 — third-party plugins at lower numbers
      // win, allowing user-installed shortcut packs (Vim, IBExpert
      // F-keys, etc.) to override individual shell defaults.
      priority: 100,
      payload: b.payload,
    })),
  });

  return () => unregisterBuiltin(BUILTIN_NAME);
}

/** Explicit teardown — alternative to the returned closure. */
export function unregisterBuiltinDefaultKeybindings(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
