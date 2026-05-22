import { create } from 'zustand';

/** A single executed statement captured for the welcome-dashboard
 *  snippet. Distinct from the desktop's persisted {@link HistoryEntry}
 *  on purpose: this store is in-memory only, keyed by a free-form
 *  profile label, and resets when the app reloads. */
export interface RecentQuery {
  id: string;
  sql: string;
  executedAt: number;
  durationMs: number;
  status: 'ok' | 'err';
  rowCount: number | null;
  error: string | null;
  /** Free-form label propagated from the persisted history entry. The
   *  in-memory store has no label of its own; the host calls
   *  {@link RecentQueriesStore.setLabel} when the user renames an
   *  entry in the history panel so the welcome snippet stays in sync.
   *  `null` (the default) renders without a chip. */
  label?: string | null;
}

/** Hard cap on entries kept per profile-label bucket. The dashboard
 *  surfaces the most recent five; this margin lets near-future
 *  consumers (e.g. a Command Palette "recent" group) read more without
 *  reshaping the store. */
export const RECENT_MAX = 20;

export interface RecentQueriesStore {
  byKey: Record<string, RecentQuery[]>;
  record: (key: string, entry: Omit<RecentQuery, 'id'>) => void;
  clear: (key: string) => void;
  /** Attach (or clear) a label on every bucket entry that matches both
   *  `sql` and `executedAt`. Pass `null` to clear. Called by the host
   *  after a successful `history_set_label` round-trip so the welcome
   *  dashboard reflects the rename without a full re-fetch. */
  setLabel: (
    key: string,
    match: { sql: string; executedAt: number },
    label: string | null,
  ) => void;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `r${Date.now().toString(36)}-${counter}`;
}

export const useRecentQueries = create<RecentQueriesStore>()((set) => ({
  byKey: {},
  record: (key, entry) =>
    set((s) => {
      const existing = s.byKey[key] ?? [];
      const next: RecentQuery = { id: nextId(), ...entry };
      const merged = [next, ...existing].slice(0, RECENT_MAX);
      return { byKey: { ...s.byKey, [key]: merged } };
    }),
  clear: (key) =>
    set((s) => {
      const copy = { ...s.byKey };
      delete copy[key];
      return { byKey: copy };
    }),
  setLabel: (key, match, label) =>
    set((s) => {
      const bucket = s.byKey[key];
      if (!bucket) return s;
      const trimmed = typeof label === 'string' ? label.trim() : null;
      const stored = trimmed && trimmed.length > 0 ? trimmed : null;
      let changed = false;
      const next = bucket.map((entry) => {
        if (entry.sql !== match.sql || entry.executedAt !== match.executedAt) {
          return entry;
        }
        if ((entry.label ?? null) === stored) return entry;
        changed = true;
        return { ...entry, label: stored };
      });
      if (!changed) return s;
      return { byKey: { ...s.byKey, [key]: next } };
    }),
}));

/** Pulls the recent-query list for `key`. Returns an empty array when
 *  the key is absent — callers don't need to null-check.
 *
 *  The fallback intentionally points at a frozen module-scope array so
 *  Zustand's snapshot-equality check stays stable when the bucket is
 *  missing. A fresh `[]` would survive `Object.is` once and then cause
 *  every subsequent render to look like a state change, which React 19
 *  surfaces as "Maximum update depth exceeded". */
const EMPTY_RECENT: readonly RecentQuery[] = Object.freeze([]);

export function selectRecent(state: RecentQueriesStore, key: string): RecentQuery[] {
  return (state.byKey[key] ?? (EMPTY_RECENT as readonly RecentQuery[])) as RecentQuery[];
}
