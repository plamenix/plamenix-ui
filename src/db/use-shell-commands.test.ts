// @vitest-environment jsdom

/**
 * The command palette's entries.
 *
 * These were 127 byte-identical lines in each shell and had no tests in
 * either. What is worth pinning is which entries appear when — the
 * palette is how a keyboard user reaches everything, so a command that
 * silently stops being offered is a feature that silently disappears,
 * and one offered on a screen where it cannot work is a dead end.
 */

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useShellCommands, type ShellCommandOptions } from './use-shell-commands.js';

afterEach(cleanup);

const handlerNames = [
  'newTab',
  'closeTab',
  'toggleTheme',
  'toggleSidebar',
  'showShortcuts',
  'saveProfile',
  'connect',
  'execute',
  'refreshSchema',
  'disconnect',
  'openHistory',
] as const;

function options(overrides: Partial<ShellCommandOptions> = {}): ShellCommandOptions {
  const handlers = Object.fromEntries(handlerNames.map((n) => [n, vi.fn()]));
  return {
    mod: '⌘',
    themeMode: 'dark',
    hasSession: false,
    hasProfile: false,
    ...handlers,
    ...overrides,
  } as ShellCommandOptions;
}

function idsFor(overrides: Partial<ShellCommandOptions> = {}): string[] {
  const { result } = renderHook(() => useShellCommands(options(overrides)));
  return result.current.map((c) => c.id);
}

describe('entries that are always offered', () => {
  it('offers tabs, appearance and help on every screen', () => {
    const disconnected = idsFor({ hasSession: false });
    const connected = idsFor({ hasSession: true });
    for (const id of ['new-tab', 'close-tab', 'toggle-theme', 'toggle-sidebar', 'show-shortcuts']) {
      expect(disconnected, `${id} missing while disconnected`).toContain(id);
      expect(connected, `${id} missing while connected`).toContain(id);
    }
  });

  it('gives every entry a unique id', () => {
    // The palette keys its list on these, and a duplicate would drop a
    // command from the rendered list rather than fail loudly.
    const ids = idsFor({ hasSession: true, hasProfile: true });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry a label, a group and something to run', () => {
    const { result } = renderHook(() =>
      useShellCommands(options({ hasSession: true, hasProfile: true })),
    );
    for (const c of result.current) {
      expect(c.label.length, `${c.id} has no label`).toBeGreaterThan(0);
      expect(c.group, `${c.id} has no group`).toBeTruthy();
      expect(typeof c.run, `${c.id} has nothing to run`).toBe('function');
    }
  });
});

describe('connected versus disconnected', () => {
  it('offers connection commands only when there is no session', () => {
    expect(idsFor({ hasSession: false })).toEqual(
      expect.arrayContaining(['connect', 'save-profile']),
    );
    // Offering "Connect" on a tab that already holds a session would
    // open a second one and orphan the first.
    expect(idsFor({ hasSession: true })).not.toContain('connect');
    expect(idsFor({ hasSession: true })).not.toContain('save-profile');
  });

  it('offers session commands only when there is a session', () => {
    const connected = idsFor({ hasSession: true });
    expect(connected).toEqual(expect.arrayContaining(['execute', 'refresh-schema', 'disconnect']));

    const disconnected = idsFor({ hasSession: false });
    for (const id of ['execute', 'refresh-schema', 'disconnect']) {
      expect(disconnected, `${id} offered with nothing to run it against`).not.toContain(id);
    }
  });

  it('offers history only for a session opened from a profile', () => {
    // History is recorded per profile, so a profile-less session has
    // none — the entry would open an empty panel.
    expect(idsFor({ hasSession: true, hasProfile: true })).toContain('history');
    expect(idsFor({ hasSession: true, hasProfile: false })).not.toContain('history');
    expect(idsFor({ hasSession: false, hasProfile: true })).not.toContain('history');
  });
});

describe('labels and shortcuts', () => {
  it('names the theme the toggle switches to, not the current one', () => {
    // Read as an instruction, not a status: the user picks the entry
    // for the theme they want.
    const dark = renderHook(() => useShellCommands(options({ themeMode: 'dark' })));
    expect(dark.result.current.find((c) => c.id === 'toggle-theme')?.label).toContain('light');

    cleanup();
    const light = renderHook(() => useShellCommands(options({ themeMode: 'light' })));
    expect(light.result.current.find((c) => c.id === 'toggle-theme')?.label).toContain('dark');
  });

  it('renders shortcut hints with the host’s modifier', () => {
    // The library cannot know the platform; a hard-coded ⌘ would be
    // wrong on every Windows and Linux install.
    const { result } = renderHook(() => useShellCommands(options({ mod: 'Ctrl+' })));
    expect(result.current.find((c) => c.id === 'new-tab')?.shortcut).toBe('Ctrl+T');
    expect(result.current.find((c) => c.id === 'close-tab')?.shortcut).toBe('Ctrl+W');
  });

  it('gives Connect and Execute the same chord, since they never coexist', () => {
    const disconnected = renderHook(() => useShellCommands(options({ hasSession: false })));
    const connectChord = disconnected.result.current.find((c) => c.id === 'connect')?.shortcut;
    cleanup();
    const connected = renderHook(() => useShellCommands(options({ hasSession: true })));
    const executeChord = connected.result.current.find((c) => c.id === 'execute')?.shortcut;

    expect(connectChord).toBe('⌘↵');
    expect(executeChord).toBe(connectChord);
  });
});

describe('running an entry', () => {
  it('calls the handler the host supplied, and only that one', () => {
    const opts = options({ hasSession: true, hasProfile: true });
    const { result } = renderHook(() => useShellCommands(opts));

    const cases: [string, keyof ShellCommandOptions][] = [
      ['new-tab', 'newTab'],
      ['close-tab', 'closeTab'],
      ['toggle-theme', 'toggleTheme'],
      ['toggle-sidebar', 'toggleSidebar'],
      ['show-shortcuts', 'showShortcuts'],
      ['execute', 'execute'],
      ['refresh-schema', 'refreshSchema'],
      ['disconnect', 'disconnect'],
      ['history', 'openHistory'],
    ];

    for (const [id, handler] of cases) {
      const command = result.current.find((c) => c.id === id);
      expect(command, `${id} not offered`).toBeDefined();
      command?.run();
      expect(opts[handler], `${id} ran the wrong handler`).toHaveBeenCalledTimes(1);
    }
  });

  it('wires the connection commands too', () => {
    const opts = options({ hasSession: false });
    const { result } = renderHook(() => useShellCommands(opts));

    result.current.find((c) => c.id === 'connect')?.run();
    result.current.find((c) => c.id === 'save-profile')?.run();

    expect(opts.connect).toHaveBeenCalledTimes(1);
    expect(opts.saveProfile).toHaveBeenCalledTimes(1);
  });

  it('calls the current handler after the host swaps one out', () => {
    // The shells rebuild these every render. An entry closing over the
    // first render's handler would keep calling a stale one.
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ execute }: { execute: () => void }) =>
        useShellCommands(options({ hasSession: true, execute })),
      { initialProps: { execute: first } },
    );

    rerender({ execute: second });
    result.current.find((c) => c.id === 'execute')?.run();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
