import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerBuiltinDefaultKeybindings,
  unregisterBuiltinDefaultKeybindings,
  type DefaultKeybindingHandlers,
} from './default-keybindings.js';
import {
  matchesCombo,
  pluginContributionsToKeybindings,
  type KeybindingContext,
  type KeybindingContributionPayload,
} from '../keybinding-contract.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry, registerContributions } from '../../plugin-react/registry.js';

function stubHandlers(canSave = true): DefaultKeybindingHandlers {
  return {
    openCheatSheet: vi.fn(),
    openSearchPalette: vi.fn(),
    openCommandPalette: vi.fn(),
    newTab: vi.fn(),
    closeActiveTab: vi.fn(),
    canSaveProfile: vi.fn(() => canSave),
    saveActiveProfile: vi.fn(),
  };
}

function ctx(overrides: Partial<KeybindingContext> = {}): KeybindingContext {
  return {
    event: {} as KeyboardEvent,
    target: null,
    isTyping: false,
    isMac: true,
    ...overrides,
  };
}

function descriptors() {
  return pluginContributionsToKeybindings(
    registry.getContributions<KeybindingContributionPayload>('keybindings'),
  );
}

describe('builtin default keybindings (I5.1)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    unregisterBuiltinDefaultKeybindings();
    registry.__reset();
  });

  it('registers six bindings under the built-in namespace at priority 100', () => {
    registerBuiltinDefaultKeybindings(stubHandlers());
    const contributions = registry.getContributions('keybindings');
    expect(contributions).toHaveLength(6);
    expect(contributions.every((c) => c.pluginId === '@plamenix-builtin/default-keybindings')).toBe(true);
    expect(contributions.every((c) => isBuiltinPlugin(c.pluginId))).toBe(true);
    expect(contributions.every((c) => c.contribution.priority === 100)).toBe(true);
  });

  it('all six known commands surface (cheat-sheet, search, palette, new-tab, close-tab, save-profile)', () => {
    registerBuiltinDefaultKeybindings(stubHandlers());
    const ids = descriptors()
      .map((d) => d.id.split(':').pop())
      .sort();
    expect(ids).toEqual([
      'close-active-tab',
      'new-tab',
      'open-cheat-sheet',
      'open-command-palette',
      'open-search-palette',
      'save-active-profile',
    ]);
  });

  it('binds the shell handlers — pressing Mod+K calls openCommandPalette and claims the event', () => {
    const handlers = stubHandlers();
    registerBuiltinDefaultKeybindings(handlers);
    const desc = descriptors().find((d) => d.id.endsWith(':open-command-palette'))!;
    const claimed = desc.run(ctx());
    expect(claimed).toBe(true);
    expect(handlers.openCommandPalette).toHaveBeenCalledTimes(1);
  });

  it('? binding only fires when !isTyping (when predicate gates it)', () => {
    registerBuiltinDefaultKeybindings(stubHandlers());
    const desc = descriptors().find((d) => d.id.endsWith(':open-cheat-sheet'))!;
    expect(desc.when?.(ctx({ isTyping: false }))).toBe(true);
    expect(desc.when?.(ctx({ isTyping: true }))).toBe(false);
  });

  it('Mod+S binding gates on canSaveProfile() — does not save when predicate is false', () => {
    const handlers = stubHandlers(false);
    registerBuiltinDefaultKeybindings(handlers);
    const desc = descriptors().find((d) => d.id.endsWith(':save-active-profile'))!;
    expect(desc.when?.(ctx())).toBe(false);
    expect(handlers.saveActiveProfile).not.toHaveBeenCalled();
  });

  it('Mod+S binding fires when canSaveProfile() returns true', () => {
    const handlers = stubHandlers(true);
    registerBuiltinDefaultKeybindings(handlers);
    const desc = descriptors().find((d) => d.id.endsWith(':save-active-profile'))!;
    expect(desc.when?.(ctx())).toBe(true);
    const claimed = desc.run(ctx());
    expect(claimed).toBe(true);
    expect(handlers.saveActiveProfile).toHaveBeenCalledTimes(1);
  });

  it('parsed combos match expected events (Mod+K, Mod+Shift+F, Mod+T, Mod+W, Mod+S, ?)', () => {
    registerBuiltinDefaultKeybindings(stubHandlers());
    const all = descriptors();
    const expected: Record<string, KeyboardEvent> = {
      'open-command-palette': { key: 'k', metaKey: true } as KeyboardEvent,
      'open-search-palette': { key: 'f', metaKey: true, shiftKey: true } as KeyboardEvent,
      'new-tab': { key: 't', metaKey: true } as KeyboardEvent,
      'close-active-tab': { key: 'w', metaKey: true } as KeyboardEvent,
      'save-active-profile': { key: 's', metaKey: true } as KeyboardEvent,
      'open-cheat-sheet': { key: '?', shiftKey: true } as KeyboardEvent,
    };
    for (const [localId, event] of Object.entries(expected)) {
      const desc = all.find((d) => d.id.endsWith(`:${localId}`))!;
      expect(matchesCombo(desc.parsed, event, true)).toBe(true);
    }
  });

  it('third-party binding registered at lower priority (50) sorts ahead of the built-in for the same combo', () => {
    registerBuiltinDefaultKeybindings(stubHandlers());
    const customRun = vi.fn(() => true);
    registerContributions('com.example.vim', {
      keybindings: [
        {
          id: 'palette-override',
          priority: 50,
          payload: {
            label: 'Vim palette override',
            combo: 'Mod+K',
            run: customRun,
          },
        },
      ],
    });
    // Priority-sorted descriptor list — the third-party binding for
    // Mod+K precedes the built-in's open-command-palette.
    const all = descriptors();
    const indexes = all.map((d) => d.id);
    expect(indexes.indexOf('com.example.vim:palette-override')).toBeLessThan(
      indexes.indexOf('@plamenix-builtin/default-keybindings:open-command-palette'),
    );
  });

  it('teardown unregisters cleanly + re-register works (re-init safe)', () => {
    const teardown = registerBuiltinDefaultKeybindings(stubHandlers());
    teardown();
    expect(registry.getContributions('keybindings')).toHaveLength(0);
    expect(() => registerBuiltinDefaultKeybindings(stubHandlers())).not.toThrow();
    expect(registry.getContributions('keybindings')).toHaveLength(6);
  });
});
