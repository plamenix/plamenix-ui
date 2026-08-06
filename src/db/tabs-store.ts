import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ConnectionForm,
  CryptState,
  Schema,
  StatementOutcome,
  TestConnectionResult,
} from './types';

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
  fbclientPath: '',
  charset: 'UTF8',
  embedded: false,
};

/** Per-tab state. Each tab is independent: its own session, SQL
 *  buffer, last result, schema, and connect-dialog form. */
export interface TabState {
  id: string;
  title: string;
  sessionId: string | null;
  sql: string;
  /** SQL text that produced the current `result`. Null until the first
   *  execute. The TabStrip compares this against `sql` to render the
   *  dirty-buffer dot. */
  executedSql: string | null;
  /** Per-statement outcomes from the most recent `db_execute`. The
   *  batch runs sequentially and aborts at the first failure, so the
   *  list may end with an `err` entry. Null before any execute. */
  results: StatementOutcome[] | null;
  cryptState: CryptState | null;
  schema: Schema | null;
  error: string | null;
  busy: boolean;
  form: ConnectionForm;
  selectedProfileId: string | null;
  profileName: string;
  /** Accent-palette id chosen for this profile draft, or `null` for no
   *  tint. Tab strip + status dot honour this when set. */
  profileColor: string | null;
  /** SQL-editor bookmark slots. Keys `'0'`–`'9'`; values are document
   *  offsets. The CodeMirror state field that owns the live positions
   *  bubbles updates here so they survive tab switches and reloads. */
  bookmarks: Record<string, number>;
  /** Persisted per-column pixel widths for the result table. Keyed
   *  by column name; carries across queries within the same tab so a
   *  user-resized `ID` column stays at the same width when re-running
   *  the SELECT. */
  columnWidths: Record<string, number>;
  /** Result of the most recent background liveness ping for this tab.
   *  `'unknown'` until the first probe lands; `'healthy'` while pings
   *  succeed; `'reconnecting'` while a recovery attempt is in flight;
   *  `'dead'` when the last attempt failed. Surfaces in the tab strip
   *  dot and the QueryPanel status row. */
  health: 'unknown' | 'healthy' | 'reconnecting' | 'dead';
  /** Epoch milliseconds of the most recent successful ping, or `null`
   *  when nothing has been observed yet for this session. */
  lastPingAt: number | null;
  /** Epoch milliseconds when the current session was opened. `null`
   *  while disconnected. Surfaced by the welcome dashboard so the user
   *  can see how long the connection has been live. */
  connectedAt: number | null;
  /** Firebird engine version reported by the most recent successful
   *  ping (e.g. `'5.0.1'`). Populated right after connect and refreshed
   *  by the background health probe. `null` while disconnected or
   *  before the first ping lands. */
  engineVersion: string | null;
  /** True while a test-connection request is in flight. */
  testing: boolean;
  /** Most recent test-connection outcome, or `null` if the user hasn't
   *  tested yet (or the form has been changed since). */
  testResult: TestConnectionResult | null;
  /** Name of the table or view the user is "focused" on via the schema
   *  browser. When set, the content pane renders a tabbed
   *  `TableObjectView` (Data / Schema / DDL) instead of the bare
   *  results table. Cleared when the user runs a different query in
   *  the editor or closes the view. `null` outside table-focus mode. */
  focusedObjectName: string | null;
  /** Procedure / trigger / generator / domain (and bare-DDL view) the
   *  user has opened from the schema browser. Drives the in-pane
   *  `RoutineObjectView`; cleared when the user runs anything new in
   *  the editor or closes the view. Holds the kind, name, fetched
   *  source body, and loading / error chrome the view needs. */
  focusedRoutine: {
    kind: 'view' | 'procedure' | 'trigger' | 'generator' | 'domain';
    name: string;
    source: string | null;
    loading: boolean;
    error: string | null;
  } | null;
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
  /** Moves the tab at `from` to position `to` in the strip. No-op if
   *  either index is out of bounds. Used by the TabStrip's drag-to-
   *  reorder handler. */
  reorderTab: (from: number, to: number) => void;
}

export type TabsStore = {
  tabs: TabState[];
  activeTabId: string;
} & TabsStoreActions;

function freshTab(): TabState {
  return {
    id: crypto.randomUUID(),
    title: 'New tab',
    sessionId: null,
    sql: '',
    executedSql: null,
    results: null,
    cryptState: null,
    schema: null,
    error: null,
    busy: false,
    form: { ...DEFAULT_FORM },
    selectedProfileId: null,
    profileName: '',
    profileColor: null,
    bookmarks: {},
    columnWidths: {},
    health: 'unknown',
    lastPingAt: null,
    connectedAt: null,
    engineVersion: null,
    testing: false,
    testResult: null,
    focusedObjectName: null,
    focusedRoutine: null,
  };
}

/** Subset of {@link TabState} that survives a relaunch. Sessions,
 *  schemas, results, and busy/error flags are intentionally dropped —
 *  the backing session dies with the process and the UI starts each tab
 *  in the disconnected state on rehydrate. Secrets (`password`,
 *  `encryptionKey`) are also stripped before serialisation. */
interface PersistedTab {
  id: string;
  title: string;
  sql: string;
  executedSql: string | null;
  form: ConnectionForm;
  selectedProfileId: string | null;
  profileName: string;
  profileColor: string | null;
  bookmarks: Record<string, number>;
  columnWidths: Record<string, number>;
}

interface PersistedTabsState {
  tabs: PersistedTab[];
  activeTabId: string;
}

/** Strips secrets from a form before persistence. */
function sanitiseForm(form: ConnectionForm): ConnectionForm {
  return { ...form, password: '', encryptionKey: '' };
}

/** Rebuilds a live `TabState` from a persisted projection, resetting
 *  every ephemeral field to its disconnected default. */
function inflateTab(saved: PersistedTab): TabState {
  return {
    id: saved.id,
    title: saved.title,
    // sessionId is intentionally NOT pulled from `saved`. It's the
    // only field whose lifetime must match the webview lifetime, not
    // the localStorage lifetime — see the `plamenix.session.<tabId>`
    // sessionStorage layer the host maintains.
    sessionId: null,
    sql: saved.sql,
    executedSql: saved.executedSql,
    results: null,
    cryptState: null,
    schema: null,
    error: null,
    busy: false,
    // Merge against DEFAULT_FORM so older persisted shapes pick up
    // newer fields (e.g. `fbclientPath`) with controlled defaults.
    // Secrets are re-cleared after the merge: a build shipped between
    // 2026-05 and 2026-08 persisted a literal password, so entries
    // already in localStorage cannot be trusted to be sanitised.
    form: { ...DEFAULT_FORM, ...saved.form, password: '', encryptionKey: '' },
    selectedProfileId: saved.selectedProfileId,
    profileName: saved.profileName,
    profileColor: saved.profileColor ?? null,
    bookmarks: saved.bookmarks ?? {},
    columnWidths: saved.columnWidths ?? {},
    health: 'unknown',
    lastPingAt: null,
    connectedAt: null,
    engineVersion: null,
    testing: false,
    testResult: null,
    focusedObjectName: null,
    focusedRoutine: null,
  };
}

/**
 * Process-wide tab store.
 *
 * Both editions consume the same hook; the per-app singleton lives
 * inside @plamenix/ui's bundle, so each edition gets one store
 * instance.
 *
 * Persists to `localStorage` under `plamenix.tabs` so the tab strip,
 * SQL buffers, selected profiles, and form fields survive a relaunch.
 * Live state (sessionId, results, schema, cryptState, busy flags, test
 * outcome) and secrets (password, encryptionKey) are filtered out
 * before write.
 */
export const useTabsStore = create<TabsStore>()(
  persist(
    (set) => {
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
        reorderTab: (from, to) =>
          set((s) => {
            if (from === to || from < 0 || from >= s.tabs.length || to < 0 || to >= s.tabs.length) {
              return {};
            }
            const next = s.tabs.slice();
            const [moved] = next.splice(from, 1);
            if (!moved) return {};
            next.splice(to, 0, moved);
            return { tabs: next };
          }),
      };
    },
    {
      name: 'plamenix.tabs',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState, fromVersion) => {
        // v1 → v2: pre-1.0.0-beta tabs shipped with a demo SQL
        // placeholder (`SELECT 42 AS answer, …`) baked into every
        // fresh tab. Drop it so already-persisted tabs land empty
        // for users coming from the test build.
        const PRE_BETA_PLACEHOLDER = "SELECT 42 AS answer, 'plamenix' AS name FROM RDB$DATABASE";
        if (fromVersion < 2 && persistedState && typeof persistedState === 'object') {
          const state = persistedState as PersistedTabsState;
          if (Array.isArray(state.tabs)) {
            state.tabs = state.tabs.map((t) =>
              t.sql === PRE_BETA_PLACEHOLDER ? { ...t, sql: '' } : t,
            );
          }
        }
        return persistedState as PersistedTabsState;
      },
      partialize: (s): PersistedTabsState => ({
        activeTabId: s.activeTabId,
        tabs: s.tabs.map(
          (t): PersistedTab => ({
            id: t.id,
            title: t.title,
            sql: t.sql,
            executedSql: t.executedSql,
            form: sanitiseForm(t.form),
            selectedProfileId: t.selectedProfileId,
            profileName: t.profileName,
            profileColor: t.profileColor,
            bookmarks: t.bookmarks,
            columnWidths: t.columnWidths,
          }),
        ),
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as PersistedTabsState | undefined;
        if (!persisted || !Array.isArray(persisted.tabs) || persisted.tabs.length === 0) {
          return currentState;
        }
        const tabs = persisted.tabs.map(inflateTab);
        const activeTabId = tabs.find((t) => t.id === persisted.activeTabId)?.id ?? tabs[0]!.id;
        return { ...currentState, tabs, activeTabId };
      },
    },
  ),
);
