/**
 * Built-in themes (I5.8) — Light, Dark, and the Plamenix-branded
 * Lavafire preset. Registered under `@plamenix-builtin/themes-default`.
 *
 * **Light** and **Dark** ship as `mode`-only descriptors (empty
 * `cssVariables`). They round-trip the pre-I5.8 Light / Dark mode
 * behaviour through the registry so the Settings panel dropdown can
 * surface them as discoverable options without changing the visual
 * output for users who don't pick a theme.
 *
 * **Lavafire** is the headline Plamenix-branded preset — `mode: 'dark'`
 * + orange accent + a small palette override that warms the canvas
 * tint to a fire-glow tone. The CSS variables target a few specific
 * shell-wide custom properties (`--plamenix-theme-canvas-tint`,
 * `--plamenix-theme-accent-glow`) plus an accent push that the shell
 * absorbs via the existing `accent: 'orange'` field. Future shell
 * stylesheet updates can subscribe to the `--plamenix-theme-*`
 * variables for tint-aware borders / glows; for now the variables
 * are scaffolding that third-party theme plugins can target verbatim.
 *
 * Priority spacing: 200 / 210 / 220 — Light first, Dark second,
 * Lavafire last. Registry default is 100, so user-installed theme
 * plugins (Dracula, GitHub, etc.) sort above the built-ins in the
 * Theme dropdown — community plugins surface ahead of shell defaults
 * (same convention as I5.2 menus / I5.3 toolbar buttons / etc.).
 */

import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import type { ThemeContributionPayload } from '../theme-contract.js';

const BUILTIN_NAME = 'themes-default';

const lightPayload: ThemeContributionPayload = {
  name: 'Light',
  mode: 'light',
  cssVariables: {},
};

const darkPayload: ThemeContributionPayload = {
  name: 'Dark',
  mode: 'dark',
  cssVariables: {},
};

/** Lavafire — Plamenix-branded warm-dark preset. Palette nods to the
 *  firebird flame: orange accent + amber glow tints + slightly warmer
 *  canvas. The CSS variables are namespaced `--plamenix-theme-*` so
 *  they don't collide with Tailwind 4's `@theme` properties (which
 *  start with `--color-*` etc.); shell stylesheets that want to opt
 *  into theme-aware tinting reference these explicitly via `var()`. */
const lavafirePayload: ThemeContributionPayload = {
  name: 'Lavafire',
  mode: 'dark',
  accent: 'orange',
  cssVariables: {
    '--plamenix-theme-canvas-tint': '#1a0e08',
    '--plamenix-theme-accent-glow': 'rgba(251, 146, 60, 0.18)',
    '--plamenix-theme-edge-tint': '#3b1f10',
  },
};

/**
 * Registers the three built-in themes. Returns a teardown closure
 * for `useEffect` pairing.
 */
export function registerBuiltinDefaultThemes(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    themes: [
      { id: 'light', priority: 200, payload: lightPayload },
      { id: 'dark', priority: 210, payload: darkPayload },
      { id: 'lavafire', priority: 220, payload: lavafirePayload },
    ],
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

export function unregisterBuiltinDefaultThemes(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
