// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyThemeCssVariables,
  pluginContributionsToThemes,
  resolveThemeAppearance,
  type ThemeContributionPayload,
} from './theme-contract.js';
import { registry, registerContributions } from '../plugin-react/registry.js';

function descriptors() {
  return pluginContributionsToThemes(
    registry.getContributions<ThemeContributionPayload>('themes'),
  );
}

describe('pluginContributionsToThemes (I5.8)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => registry.__reset());

  it('descriptor id namespaces by pluginId + contribution id', () => {
    registerContributions('com.example.dracula', {
      themes: [
        {
          id: 'dracula',
          payload: {
            name: 'Dracula',
            mode: 'dark',
            cssVariables: {},
          } satisfies ThemeContributionPayload,
        },
      ],
    });
    const [d] = descriptors();
    expect(d?.id).toBe('com.example.dracula:dracula');
    expect(d?.pluginId).toBe('com.example.dracula');
    expect(d?.name).toBe('Dracula');
  });

  it('respects registry priority order (lower wins)', () => {
    registerContributions('com.example.late', {
      themes: [
        {
          id: 'late',
          priority: 300,
          payload: { name: 'Late', mode: 'dark', cssVariables: {} },
        },
      ],
    });
    registerContributions('com.example.early', {
      themes: [
        {
          id: 'early',
          priority: 50,
          payload: { name: 'Early', mode: 'light', cssVariables: {} },
        },
      ],
    });
    expect(descriptors().map((d) => d.name)).toEqual(['Early', 'Late']);
  });

  it('descriptor carries cssVariables + accent through, accent default null', () => {
    registerContributions('com.example.acc', {
      themes: [
        {
          id: 'a',
          payload: {
            name: 'A',
            mode: 'dark',
            cssVariables: { '--x': '1' },
            accent: 'orange',
          },
        },
        {
          id: 'b',
          payload: { name: 'B', mode: 'light', cssVariables: {} },
        },
      ],
    });
    const [a, b] = descriptors();
    expect(a?.cssVariables).toEqual({ '--x': '1' });
    expect(a?.accent).toBe('orange');
    expect(b?.accent).toBeNull();
  });
});

describe('resolveThemeAppearance (I5.8)', () => {
  it('explicit light/dark wins over user resolved', () => {
    expect(resolveThemeAppearance('light', 'dark')).toBe('light');
    expect(resolveThemeAppearance('dark', 'light')).toBe('dark');
  });

  it('auto defers to user resolved', () => {
    expect(resolveThemeAppearance('auto', 'dark')).toBe('dark');
    expect(resolveThemeAppearance('auto', 'light')).toBe('light');
  });
});

describe('applyThemeCssVariables (I5.8)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-plamenix-applied-theme-vars');
  });

  it('writes -- prefixed properties to <html> inline style', () => {
    applyThemeCssVariables({
      '--plamenix-theme-canvas-tint': '#000',
      '--plamenix-theme-edge-tint': '#111',
    });
    const html = document.documentElement;
    expect(html.style.getPropertyValue('--plamenix-theme-canvas-tint')).toBe('#000');
    expect(html.style.getPropertyValue('--plamenix-theme-edge-tint')).toBe('#111');
  });

  it('ignores non-CSS-property names', () => {
    applyThemeCssVariables({ 'color-accent': 'red', '--ok': '1' } as Record<string, string>);
    expect(document.documentElement.style.getPropertyValue('--ok')).toBe('1');
    // The bare name was skipped, no 'color-accent' property got set.
    expect(document.documentElement.style.getPropertyValue('color-accent')).toBe('');
  });

  it('sweeps previously-applied properties on subsequent apply (theme switch)', () => {
    applyThemeCssVariables({ '--first': 'a' });
    applyThemeCssVariables({ '--second': 'b' });
    expect(document.documentElement.style.getPropertyValue('--first')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--second')).toBe('b');
  });

  it('empty record clears all previously-applied properties + removes the data attr', () => {
    applyThemeCssVariables({ '--x': 'y' });
    expect(document.documentElement.hasAttribute('data-plamenix-applied-theme-vars')).toBe(true);
    applyThemeCssVariables({});
    expect(document.documentElement.style.getPropertyValue('--x')).toBe('');
    expect(document.documentElement.hasAttribute('data-plamenix-applied-theme-vars')).toBe(false);
  });
});
