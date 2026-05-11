import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ACCENT_COLORS, type AccentId } from './accent-colors';

export type ThemeMode = 'dark' | 'light';

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

/**
 * Theme + sidebar-collapse store. Persists to `localStorage` so the
 * picked theme survives reloads. Applies the `.dark` + `.accent-*`
 * classes to `<html>` on every mutation via the subscriber set up at
 * module load below.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark',
      accent: 'amber',
      sidebarCollapsed: false,
      setMode: (mode) => set({ mode }),
      toggleMode: () => set((s) => ({ mode: s.mode === 'dark' ? 'light' : 'dark' })),
      setAccent: (accent) => set({ accent }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: 'plamenix.theme',
      version: 1,
      partialize: (s) => ({ mode: s.mode, accent: s.accent, sidebarCollapsed: s.sidebarCollapsed }),
      onRehydrateStorage: () => (rehydrated) => {
        if (rehydrated && !ACCENT_IDS.has(rehydrated.accent)) {
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
  html.classList.toggle('dark', state.mode === 'dark');
  for (const accent of ACCENT_COLORS) {
    html.classList.toggle(`accent-${accent.id}`, accent.id === state.accent);
  }
}

if (typeof window !== 'undefined') {
  // Apply once on initial load.
  applyThemeToDocument(useThemeStore.getState());
  useThemeStore.subscribe((state) => applyThemeToDocument(state));
}
