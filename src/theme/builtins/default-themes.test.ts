import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  registerBuiltinDefaultThemes,
  unregisterBuiltinDefaultThemes,
} from './default-themes.js';
import {
  pluginContributionsToThemes,
  type ThemeContributionPayload,
} from '../theme-contract.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { registry } from '../../plugin-react/registry.js';

function descriptors() {
  return pluginContributionsToThemes(
    registry.getContributions<ThemeContributionPayload>('themes'),
  );
}

describe('builtin default themes (I5.8)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => {
    unregisterBuiltinDefaultThemes();
    registry.__reset();
  });

  it('registers three themes under the built-in namespace at priorities 200/210/220', () => {
    registerBuiltinDefaultThemes();
    const contributions = registry.getContributions('themes');
    expect(contributions).toHaveLength(3);
    expect(contributions.every((c) => c.pluginId === '@plamenix-builtin/themes-default')).toBe(true);
    expect(contributions.every((c) => isBuiltinPlugin(c.pluginId))).toBe(true);
    expect(contributions.map((c) => c.contribution.priority).sort()).toEqual([200, 210, 220]);
  });

  it('Light/Dark/Lavafire appear in dropdown order with right modes', () => {
    registerBuiltinDefaultThemes();
    const all = descriptors();
    expect(all.map((d) => d.name)).toEqual(['Light', 'Dark', 'Lavafire']);
    expect(all[0]?.mode).toBe('light');
    expect(all[1]?.mode).toBe('dark');
    expect(all[2]?.mode).toBe('dark');
  });

  it('Light + Dark have no cssVariables; Lavafire has the fire-tint set', () => {
    registerBuiltinDefaultThemes();
    const [light, dark, lava] = descriptors();
    expect(light?.cssVariables).toEqual({});
    expect(dark?.cssVariables).toEqual({});
    expect(lava?.cssVariables['--plamenix-theme-canvas-tint']).toBeDefined();
    expect(lava?.cssVariables['--plamenix-theme-accent-glow']).toBeDefined();
  });

  it('Lavafire prefers the orange accent; Light + Dark leave accent untouched (null)', () => {
    registerBuiltinDefaultThemes();
    const [light, dark, lava] = descriptors();
    expect(light?.accent).toBeNull();
    expect(dark?.accent).toBeNull();
    expect(lava?.accent).toBe('orange');
  });

  it('teardown unregisters cleanly + re-register works', () => {
    const teardown = registerBuiltinDefaultThemes();
    teardown();
    expect(registry.getContributions('themes')).toHaveLength(0);
    expect(() => registerBuiltinDefaultThemes()).not.toThrow();
    expect(registry.getContributions('themes')).toHaveLength(3);
  });
});
