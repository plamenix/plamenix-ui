import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Discrete sizes the user can pick from for the history retention cap.
 *  `'unlimited'` disables trimming on the backend. */
export type QueryHistoryLimit = 100 | 500 | 2000 | 'unlimited';

const HISTORY_LIMIT_VALUES = new Set<QueryHistoryLimit>([100, 500, 2000, 'unlimited']);

function isQueryHistoryLimit(value: unknown): value is QueryHistoryLimit {
  return HISTORY_LIMIT_VALUES.has(value as QueryHistoryLimit);
}

/**
 * Connection-behaviour preferences. Distinct from `display-store`
 * (cell rendering) and `editor-store` (CodeMirror) because the
 * concerns are orthogonal — a user can prefer auto-reconnect while
 * keeping every other knob at default. Owned per-edition, applied
 * inside the host's tab loop.
 */
export interface ConnectionPrefsState {
  /** When `true`, the host attempts a single reconnect each time a
   *  health-probe failure transitions a tab to `health: 'dead'`. The
   *  health probe itself never auto-retries; only the host loop. */
  autoReconnect: boolean;
  setAutoReconnect: (value: boolean) => void;

  /** Per-profile retention cap for the persisted query history. The
   *  host passes this value (as `null` when `'unlimited'`) to the
   *  execute API so the backend can trim older rows on insert. */
  queryHistoryLimit: QueryHistoryLimit;
  setQueryHistoryLimit: (value: QueryHistoryLimit) => void;
}

export const useConnectionPrefs = create<ConnectionPrefsState>()(
  persist(
    (set) => ({
      autoReconnect: true,
      setAutoReconnect: (autoReconnect) => set({ autoReconnect }),
      queryHistoryLimit: 500,
      setQueryHistoryLimit: (queryHistoryLimit) => set({ queryHistoryLimit }),
    }),
    {
      name: 'plamenix.connection-prefs',
      version: 2,
      // Additive bump: pre-v2 state lacked `queryHistoryLimit`. Hand
      // the persisted state back unchanged and let the rehydrate guard
      // below default any missing field.
      migrate: (persistedState) => persistedState as ConnectionPrefsState,
      partialize: (s) => ({
        autoReconnect: s.autoReconnect,
        queryHistoryLimit: s.queryHistoryLimit,
      }),
      onRehydrateStorage: () => (rehydrated) => {
        if (!rehydrated) return;
        if (typeof rehydrated.autoReconnect !== 'boolean') {
          rehydrated.autoReconnect = true;
        }
        if (!isQueryHistoryLimit(rehydrated.queryHistoryLimit)) {
          rehydrated.queryHistoryLimit = 500;
        }
      },
    },
  ),
);

/** Resolve a {@link QueryHistoryLimit} to the wire shape passed to the
 *  backend: a positive integer for finite limits, `null` for unlimited. */
export function resolveHistoryLimit(value: QueryHistoryLimit): number | null {
  return value === 'unlimited' ? null : value;
}
