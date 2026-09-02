import { describe, expect, it } from 'vitest';
import {
  matchesCombo,
  parseCombo,
  pluginContributionsToKeybindings,
  type KeybindingContributionPayload,
} from './keybinding-contract.js';
import { registry, registerContributions } from '../plugin-react/registry.js';

function key(opts: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    key: opts.key,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    altKey: opts.altKey ?? false,
  } as KeyboardEvent;
}

describe('parseCombo (I5.1)', () => {
  it('parses bare letter as lower-cased key with no modifiers', () => {
    const p = parseCombo('K');
    expect(p.key).toBe('k');
    expect(p.mod || p.cmd || p.ctrl || p.shift || p.alt).toBe(false);
  });

  it('parses named keys verbatim (F5, Escape, ArrowDown, ?)', () => {
    expect(parseCombo('F5').key).toBe('F5');
    expect(parseCombo('Escape').key).toBe('Escape');
    expect(parseCombo('ArrowDown').key).toBe('ArrowDown');
    expect(parseCombo('?').key).toBe('?');
  });

  it('parses modifier+key combos with Mod / Cmd / Ctrl / Shift / Alt / Meta', () => {
    expect(parseCombo('Mod+K').mod).toBe(true);
    expect(parseCombo('Cmd+K').cmd).toBe(true);
    expect(parseCombo('Ctrl+K').ctrl).toBe(true);
    expect(parseCombo('Shift+K').shift).toBe(true);
    expect(parseCombo('Alt+K').alt).toBe(true);
    expect(parseCombo('Meta+K').meta).toBe(true);
  });

  it('parses chained modifiers (Mod+Shift+F)', () => {
    const p = parseCombo('Mod+Shift+F');
    expect(p.mod).toBe(true);
    expect(p.shift).toBe(true);
    expect(p.key).toBe('f');
  });

  it('throws on empty / malformed combos', () => {
    expect(() => parseCombo('')).toThrow();
    expect(() => parseCombo('+K')).toThrow();
    expect(() => parseCombo('Foo+K')).toThrow();
  });

  it('throws when Mod is mixed with Cmd or Ctrl', () => {
    expect(() => parseCombo('Mod+Cmd+K')).toThrow();
    expect(() => parseCombo('Mod+Ctrl+K')).toThrow();
  });
});

describe('matchesCombo (I5.1)', () => {
  it('Mod+K resolves to Cmd on macOS and Ctrl elsewhere', () => {
    const mac = parseCombo('Mod+K');
    expect(matchesCombo(mac, key({ key: 'k', metaKey: true }), true)).toBe(true);
    expect(matchesCombo(mac, key({ key: 'k', ctrlKey: true }), true)).toBe(false);
    expect(matchesCombo(mac, key({ key: 'k', ctrlKey: true }), false)).toBe(true);
    expect(matchesCombo(mac, key({ key: 'k', metaKey: true }), false)).toBe(false);
  });

  it('explicit Cmd+K only matches metaKey regardless of OS', () => {
    const combo = parseCombo('Cmd+K');
    expect(matchesCombo(combo, key({ key: 'k', metaKey: true }), false)).toBe(true);
    expect(matchesCombo(combo, key({ key: 'k', ctrlKey: true }), false)).toBe(false);
  });

  it('letter combos are case-insensitive on the event side', () => {
    const combo = parseCombo('Mod+K');
    expect(matchesCombo(combo, key({ key: 'K', metaKey: true }), true)).toBe(true);
    expect(matchesCombo(combo, key({ key: 'k', metaKey: true }), true)).toBe(true);
  });

  it('Mod+Shift+F requires both modifiers', () => {
    const combo = parseCombo('Mod+Shift+F');
    expect(matchesCombo(combo, key({ key: 'f', metaKey: true, shiftKey: true }), true)).toBe(true);
    expect(matchesCombo(combo, key({ key: 'f', metaKey: true }), true)).toBe(false);
    expect(matchesCombo(combo, key({ key: 'f', shiftKey: true }), true)).toBe(false);
  });

  it('bare ? matches Shift-/ event (Shift is needed to produce the character)', () => {
    const combo = parseCombo('?');
    expect(matchesCombo(combo, key({ key: '?', shiftKey: true }), false)).toBe(true);
    expect(matchesCombo(combo, key({ key: '?' }), false)).toBe(true);
  });

  it('bare letter combos do NOT fire when a modifier is held', () => {
    const combo = parseCombo('K');
    expect(matchesCombo(combo, key({ key: 'k' }), true)).toBe(true);
    expect(matchesCombo(combo, key({ key: 'k', metaKey: true }), true)).toBe(false);
    expect(matchesCombo(combo, key({ key: 'k', ctrlKey: true }), true)).toBe(false);
  });

  it('named keys match exactly (F5 not f5, Escape not escape)', () => {
    const combo = parseCombo('F5');
    expect(matchesCombo(combo, key({ key: 'F5' }), false)).toBe(true);
    expect(matchesCombo(combo, key({ key: 'f5' }), false)).toBe(false);
  });
});

describe('pluginContributionsToKeybindings (I5.1)', () => {
  it('drops contributions with malformed combos but routes the error through onError', () => {
    registry.__reset();
    registerContributions('com.example.broken', {
      keybindings: [
        {
          id: 'busted',
          payload: {
            label: 'Broken',
            combo: 'Foo+K',
            run: () => true,
          } satisfies KeybindingContributionPayload,
        },
        {
          id: 'good',
          payload: {
            label: 'Good',
            combo: 'Mod+K',
            run: () => true,
          },
        },
      ],
    });
    const errors: { pluginId: string; contribId: string; err: unknown }[] = [];
    const out = pluginContributionsToKeybindings(
      registry.getContributions('keybindings'),
      (pluginId, contribId, err) => errors.push({ pluginId, contribId, err }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('com.example.broken:good');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.contribId).toBe('busted');
    registry.__reset();
  });

  it('descriptor id namespaces by pluginId + contribution id', () => {
    registry.__reset();
    registerContributions('com.example.bind', {
      keybindings: [
        {
          id: 'open-thing',
          payload: { label: 'X', combo: 'Mod+J', run: () => true },
        },
      ],
    });
    const [desc] = pluginContributionsToKeybindings(
      registry.getContributions('keybindings'),
    );
    expect(desc?.id).toBe('com.example.bind:open-thing');
    expect(desc?.pluginId).toBe('com.example.bind');
    registry.__reset();
  });
});
