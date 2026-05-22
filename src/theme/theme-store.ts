import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ACCENT_COLORS, type AccentId } from './accent-colors';

/** User-selectable theme mode. `'system'` defers to the OS
 *  `prefers-color-scheme` media query; the applied class still resolves
 *  to either `dark` or `light` so all downstream Tailwind rules see the
 *  same two-state world. */
export type ThemeMode = 'system' | 'dark' | 'light';

/** The concrete two-state mode after resolving `'system'`. */
export type ResolvedThemeMode = 'dark' | 'light';

const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';
const THEME_MODE_VALUES = new Set<ThemeMode>(['system', 'dark', 'light']);

export interface ThemeState {
  mode: ThemeMode;
  accent: AccentId;
  sidebarCollapsed: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setAccent: (accent: AccentId) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

const ACCENT_IDS = new Set(ACCENT_COLORS.map((c) => c.id));

/** Resolve a {@link ThemeMode} to its concrete two-state form. Reads
 *  `window.matchMedia` for `'system'`; falls back to `'dark'` in
 *  non-DOM contexts (SSR, tests). */
export function resolveThemeMode(mode: ThemeMode): ResolvedThemeMode {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia(SYSTEM_DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * Theme + sidebar-collapse store. Persists to `localStorage` so the
 * picked theme survives reloads. Applies the `.dark` + `.accent-*`
 * classes to `<html>` on every mutation via the subscriber set up at
 * module load below.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      accent: 'amber',
      sidebarCollapsed: false,
      setMode: (mode) => set({ mode }),
      // When the user toggles from `'system'`, snap to the opposite of
      // whatever the system currently shows so the click flips the
      // visible theme rather than silently re-resolving to the same
      // value.
      toggleMode: () => {
        const current = get().mode;
        if (current === 'dark') return set({ mode: 'light' });
        if (current === 'light') return set({ mode: 'dark' });
        const resolved = resolveThemeMode('system');
        return set({ mode: resolved === 'dark' ? 'light' : 'dark' });
      },
      setAccent: (accent) => set({ accent }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: 'plamenix.theme',
      version: 2,
      partialize: (s) => ({ mode: s.mode, accent: s.accent, sidebarCollapsed: s.sidebarCollapsed }),
      // Additive bump: every prior shape is a subset of the current
      // one. Hand the persisted state back unchanged and let the
      // rehydrate guard below fill in any missing fields with defaults.
      migrate: (persistedState) => persistedState as ThemeState,
      onRehydrateStorage: () => (rehydrated) => {
        if (!rehydrated) return;
        if (!THEME_MODE_VALUES.has(rehydrated.mode)) {
          rehydrated.mode = 'system';
        }
        if (!ACCENT_IDS.has(rehydrated.accent)) {
          // Drop unknown accents from older schemas; fall back to amber.
          rehydrated.accent = 'amber';
        }
      },
    },
  ),
);

/**
 * Reflects the current store state onto `<html>` (the `.dark` mode
 * class + an `.accent-<id>` class). Safe to call multiple times — it
 * only adds/removes the two managed classes and never touches others.
 */
export function applyThemeToDocument(state: Pick<ThemeState, 'mode' | 'accent'>): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.classList.toggle('dark', resolveThemeMode(state.mode) === 'dark');
  for (const accent of ACCENT_COLORS) {
    html.classList.toggle(`accent-${accent.id}`, accent.id === state.accent);
  }
}

if (typeof window !== 'undefined') {
  // Apply once on initial load.
  applyThemeToDocument(useThemeStore.getState());
  useThemeStore.subscribe((state) => applyThemeToDocument(state));
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia(SYSTEM_DARK_QUERY);
    const onSystemChange = () => {
      const state = useThemeStore.getState();
      if (state.mode === 'system') applyThemeToDocument(state);
    };
    // Safari < 14 only exposes the deprecated `addListener`; both
    // signatures are kept here so the store stays usable on the older
    // WebView surfaces Tauri may still attach to.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onSystemChange);
    } else if (typeof (mq as MediaQueryList).addListener === 'function') {
      (mq as MediaQueryList).addListener(onSystemChange);
    }
  }
}

/** React hook returning the *applied* theme as `'dark' | 'light'`. When
 *  `mode === 'system'` the value tracks the OS `prefers-color-scheme`
 *  media query live. Use this anywhere rendering depends on the visible
 *  theme (swatches, CodeMirror highlight) — comparing the literal
 *  `mode` to `'dark'` mis-renders for system-mode users. */
export function useResolvedThemeMode(): ResolvedThemeMode {
  const mode = useThemeStore((s) => s.mode);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true;
    }
    return window.matchMedia(SYSTEM_DARK_QUERY).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(SYSTEM_DARK_QUERY);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setSystemPrefersDark(e.matches);
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    if (typeof (mq as MediaQueryList).addListener === 'function') {
      (mq as MediaQueryList).addListener(onChange);
      return () => (mq as MediaQueryList).removeListener(onChange);
    }
    return undefined;
  }, []);
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return systemPrefersDark ? 'dark' : 'light';
}
