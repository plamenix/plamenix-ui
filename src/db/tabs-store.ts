import { create } from 'zustand';
import type { ConnectionForm, CryptState, QueryResult, Schema } from './types';

/** Default form values used for every fresh tab. Edition consumers
 *  override before connect through the controlled `form` field. */
export const DEFAULT_FORM: ConnectionForm = {
  host: '127.0.0.1',
  port: 3050,
  database: '/var/lib/firebird/data/test.fdb',
  user: 'SYSDBA',
  password: '',
  pureRust: true,
  encryptionKey: '',
  encryptionRequired: false,
};

/** Per-tab state. Each tab is independent: its own session, SQL
 *  buffer, last result, schema, and connect-dialog form. */
export interface TabState {
  id: string;
  title: string;
  sessionId: string | null;
  sql: string;
  result: QueryResult | null;
  cryptState: CryptState | null;
  schema: Schema | null;
  error: string | null;
  busy: boolean;
  form: ConnectionForm;
  selectedProfileId: string | null;
  profileName: string;
}

/** Tab-store actions. State mutation goes exclusively through these;
 *  callers never reach into `tabs` directly. */
export interface TabsStoreActions {
  /** Adds a fresh, disconnected tab and makes it active. Returns its
   *  id so callers that need to chain follow-up patches can. */
  newTab: () => string;
  /** Removes the tab with the given id. If it was active, focus moves
   *  to a sibling; the store always keeps at least one tab. */
  closeTab: (id: string) => void;
  /** Moves focus to the tab with the given id. No-op when unknown. */
  setActive: (id: string) => void;
  /** Applies a partial update to a tab. */
  patchTab: (id: string, patch: Partial<TabState>) => void;
  /** Convenience wrapper around [`patchTab`] for the active tab. */
  patchActive: (patch: Partial<TabState>) => void;
  /** Overrides the tab's display title. */
  renameTab: (id: string, title: string) => void;
}

export type TabsStore = {
  tabs: TabState[];
  activeTabId: string;
} & TabsStoreActions;

const SQL_PLACEHOLDER = "SELECT 42 AS answer, 'plamenix' AS name FROM RDB$DATABASE";

function freshTab(): TabState {
  return {
    id: crypto.randomUUID(),
    title: 'New tab',
    sessionId: null,
    sql: SQL_PLACEHOLDER,
    result: null,
    cryptState: null,
    schema: null,
    error: null,
    busy: false,
    form: { ...DEFAULT_FORM, password: 'masterkey' },
    selectedProfileId: null,
    profileName: '',
  };
}

/**
 * Process-wide tab store.
 *
 * Both editions consume the same hook; the per-app singleton lives
 * inside @plamenix/ui's bundle, so each edition gets one store
 * instance.
 */
export const useTabsStore = create<TabsStore>((set) => {
  const initial = freshTab();
  return {
    tabs: [initial],
    activeTabId: initial.id,
    newTab: () => {
      const tab = freshTab();
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
      return tab.id;
    },
    closeTab: (id) =>
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === id);
        if (idx < 0) return {};
        const remaining = s.tabs.filter((t) => t.id !== id);
        if (remaining.length === 0) {
          const fresh = freshTab();
          return { tabs: [fresh], activeTabId: fresh.id };
        }
        if (s.activeTabId !== id) return { tabs: remaining };
        const fallback = remaining[Math.min(idx, remaining.length - 1)];
        return { tabs: remaining, activeTabId: fallback?.id ?? remaining[0]!.id };
      }),
    setActive: (id) => set({ activeTabId: id }),
    patchTab: (id, patch) =>
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      })),
    patchActive: (patch) =>
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, ...patch } : t)),
      })),
    renameTab: (id, title) =>
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
      })),
  };
});
