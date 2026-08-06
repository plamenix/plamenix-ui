/**
 * Theme contribution contract (I5.8).
 *
 * Plugins contribute named themes through the `themes` extension
 * point. A theme is a `mode` flag (`'light' | 'dark' | 'auto'`) plus
 * an optional palette override expressed as a `Record<string, string>`
 * of CSS custom properties applied to the `<html>` element's inline
 * style. The shell's Settings panel reads the registry to render a
 * Theme dropdown alongside the existing Mode (System/Light/Dark) +
 * Accent controls.
 *
 * Built-in `@plamenix-builtin/themes-default` registers three themes:
 *
 *   - **Light** — `mode: 'light'`, no overrides; identical to the
 *     pre-I5.8 Light mode.
 *   - **Dark** — `mode: 'dark'`, no overrides; identical to the
 *     pre-I5.8 Dark mode.
 *   - **Lavafire** — `mode: 'dark'`, ships a palette override that
 *     warms the accent + background to a fire/lava tone matching the
 *     Plamenix branding (orange accent, slightly warmer canvas tint).
 *
 * Third-party themes register with their own `id` + palette. Common
 * targets: Dracula, Solarized, GitHub Light/Dark, Nord, One Dark,
 * IBExpert-style, Monokai. The registered overrides cascade over
 * the shell's Tailwind defaults via inline `<html style="…">`, which
 * always wins over class-based `@theme` rules.
 *
 * Mode semantics:
 *   - `'light'` / `'dark'` — force the resolved mode regardless of
 *     the user's existing Mode setting (the theme is opinionated).
 *   - `'auto'` — respects the user's existing Mode (System / Light /
 *     Dark from the legacy mode picker); useful for "accent-only"
 *     themes that work in both modes.
 *
 * `activeThemeId` in `useThemeStore` defaults to `null` — when null,
 * the shell behaves exactly as it did pre-I5.8 (Mode buttons drive
 * resolved mode, no palette overrides). Picking a theme sets the id
 * and starts applying its overrides; clearing returns to the default
 * behaviour.
 */

import type { ResolvedThemeMode } from './theme-store.js';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

/** Theme appearance polarity. `'auto'` means "respects user's Mode
 *  pick"; the other two force the resolved mode regardless. */
export type ThemeMode = 'light' | 'dark' | 'auto';

export interface ThemeContributionPayload {
  /** Display name shown in the Settings panel dropdown. Concise
   *  (`'Lavafire'`, `'Dracula'`, `'GitHub Dark'`). */
  name: string;
  /** Polarity — see `ThemeMode`. */
  mode: ThemeMode;
  /** CSS custom properties to apply to the `<html>` element when
   *  this theme is active. Names must start with `--` (CSS custom-
   *  property requirement); values are pasted verbatim into the
   *  inline style. Empty record = no palette override (the theme
   *  changes only `mode`). */
  cssVariables: Record<string, string>;
  /** Optional accent id the theme prefers — when set, picking this
   *  theme also nudges the existing `useThemeStore.accent` state.
   *  Plugins can omit to leave the user's accent choice untouched. */
  accent?: string;
}

/** Resolved theme descriptor ready for the dropdown + apply path. */
export interface ThemeDescriptor {
  /** `<pluginId>:<contributionId>` so two plugins claiming the same
   *  local id never collide. Used as the dropdown key + the stored
   *  `activeThemeId`. */
  id: string;
  pluginId: string;
  name: string;
  mode: ThemeMode;
  cssVariables: Record<string, string>;
  accent: string | null;
}

/** Maps registry contributions into descriptors in registry priority
 *  order (lower number = first in the dropdown). */
export function pluginContributionsToThemes(
  contributions: ReadonlyArray<PluginContribution<ThemeContributionPayload>>,
): ThemeDescriptor[] {
  const out: ThemeDescriptor[] = [];
  for (const { pluginId, contribution } of contributions) {
    const p = contribution.payload;
    out.push({
      id: `${pluginId}:${contribution.id}`,
      pluginId,
      name: p.name,
      mode: p.mode,
      cssVariables: p.cssVariables,
      accent: p.accent ?? null,
    });
  }
  return out;
}

/** Resolves a theme's mode to the concrete light/dark state given the
 *  current user-mode preference. `'auto'` themes defer to the
 *  user-supplied resolved mode. */
export function resolveThemeAppearance(
  themeMode: ThemeMode,
  userResolved: ResolvedThemeMode,
): ResolvedThemeMode {
  if (themeMode === 'light') return 'light';
  if (themeMode === 'dark') return 'dark';
  return userResolved;
}

/** Marker prefix used on the `<html>` inline style so the apply
 *  function can sweep its own previously-set properties on theme
 *  switch without clobbering inline styles set by other code. Only
 *  custom-property names matching this prefix are removed on sweep;
 *  themes that need to override non-prefixed properties (raw CSS vars
 *  like `--color-accent`) carry those names through verbatim — the
 *  sweeper tracks them on a separate set held in the apply state. */
const APPLIED_VARS_DATA_ATTR = 'data-plamenix-applied-theme-vars';

/**
 * Applies a theme's CSS variables to the `<html>` element's inline
 * style. No-op in non-DOM contexts (SSR, jsdom-less tests). Sweeps
 * any previously-applied variables (tracked on a data attribute) so
 * switching from theme A → B drops A's overrides cleanly.
 */
export function applyThemeCssVariables(vars: Record<string, string>): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  // Sweep previously-applied variables (recorded on the data attr).
  const prev = html.getAttribute(APPLIED_VARS_DATA_ATTR);
  if (prev) {
    for (const name of prev.split(' ').filter(Boolean)) {
      html.style.removeProperty(name);
    }
  }
  const applied: string[] = [];
  for (const [name, value] of Object.entries(vars)) {
    if (!name.startsWith('--')) continue;
    html.style.setProperty(name, value);
    applied.push(name);
  }
  if (applied.length > 0) {
    html.setAttribute(APPLIED_VARS_DATA_ATTR, applied.join(' '));
  } else {
    html.removeAttribute(APPLIED_VARS_DATA_ATTR);
  }
}
