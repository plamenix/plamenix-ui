// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_FORM, useTabsStore } from './tabs-store';

const STORAGE_KEY = 'plamenix.tabs';

// Resets the store + localStorage to a known starting point so tests
// don't bleed into each other.
function resetStore(): void {
  localStorage.clear();
  const fresh = useTabsStore.getState().newTab();
  for (const tab of useTabsStore.getState().tabs) {
    if (tab.id !== fresh) useTabsStore.getState().closeTab(tab.id);
  }
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  localStorage.clear();
});

describe('tabs-store persistence', () => {
  it('writes a sanitised projection to localStorage', () => {
    const id = useTabsStore.getState().activeTabId;
    useTabsStore.getState().patchTab(id, {
      sql: 'SELECT 1 FROM rdb$database',
      executedSql: 'SELECT 1 FROM rdb$database',
      profileName: 'work',
      form: {
        ...DEFAULT_FORM,
        host: 'db.local',
        password: 'secret',
        encryptionKey: 'topsecret',
      },
    });

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { state: { tabs: unknown[] } };
    const tab = parsed.state.tabs[0] as Record<string, unknown>;

    expect(tab.sql).toBe('SELECT 1 FROM rdb$database');
    expect(tab.profileName).toBe('work');
    const form = tab.form as Record<string, unknown>;
    expect(form.host).toBe('db.local');
    expect(form.password).toBe('');
    expect(form.encryptionKey).toBe('');
    expect(tab.sessionId).toBeUndefined();
    expect(tab.results).toBeUndefined();
    expect(tab.schema).toBeUndefined();
  });

  it('rehydrates tabs with disconnected ephemeral state', () => {
    const persisted = {
      state: {
        activeTabId: 'persisted-1',
        tabs: [
          {
            id: 'persisted-1',
            title: 'Restored',
            sql: 'SELECT 2',
            executedSql: 'SELECT 2',
            form: { ...DEFAULT_FORM, host: 'restored.local' },
            selectedProfileId: 'profile-xyz',
            profileName: 'restored',
          },
        ],
      },
      version: 1,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));

    // Force the persist middleware to read from storage and merge.
    useTabsStore.persist.rehydrate();

    const state = useTabsStore.getState();
    expect(state.activeTabId).toBe('persisted-1');
    expect(state.tabs).toHaveLength(1);
    const tab = state.tabs[0]!;
    expect(tab.id).toBe('persisted-1');
    expect(tab.title).toBe('Restored');
    expect(tab.sql).toBe('SELECT 2');
    expect(tab.selectedProfileId).toBe('profile-xyz');
    expect(tab.profileName).toBe('restored');
    expect(tab.sessionId).toBeNull();
    expect(tab.results).toBeNull();
    expect(tab.cryptState).toBeNull();
    expect(tab.schema).toBeNull();
    expect(tab.busy).toBe(false);
    expect(tab.testing).toBe(false);
  });

  it('falls back to the first tab when persisted activeTabId is unknown', () => {
    const persisted = {
      state: {
        activeTabId: 'missing',
        tabs: [
          {
            id: 'tab-a',
            title: 'A',
            sql: '',
            executedSql: null,
            form: DEFAULT_FORM,
            selectedProfileId: null,
            profileName: '',
          },
        ],
      },
      version: 1,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    useTabsStore.persist.rehydrate();

    expect(useTabsStore.getState().activeTabId).toBe('tab-a');
  });

  it('keeps the default fresh tab when storage is empty', () => {
    localStorage.removeItem(STORAGE_KEY);
    useTabsStore.persist.rehydrate();
    const state = useTabsStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(state.tabs[0]!.id);
  });
});
