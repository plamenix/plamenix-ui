// @vitest-environment jsdom

/**
 * The keybinding registration both shells wrote by hand.
 *
 * The ref indirection here is necessary and easy to get wrong: the
 * built-ins register once, so they cannot close over handlers that are
 * recreated every render. If the ref stops being refreshed, every
 * shortcut silently keeps calling whatever existed at mount — which
 * looks like nothing happening rather than like an error.
 */

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDefaultKeybindings } from './use-default-keybindings.js';
import type { DefaultKeybindingHandlers } from './builtins/default-keybindings.js';

afterEach(cleanup);

function handlers(overrides: Partial<DefaultKeybindingHandlers> = {}): DefaultKeybindingHandlers {
  return {
    openCheatSheet: vi.fn(),
    openSearchPalette: vi.fn(),
    openCommandPalette: vi.fn(),
    newTab: vi.fn(),
    closeActiveTab: vi.fn(),
    canSaveProfile: vi.fn().mockReturnValue(true),
    saveActiveProfile: vi.fn(),
    ...overrides,
  };
}

/** Fires a combo at the document, the way the dispatcher sees it. */
function press(key: string, opts: { meta?: boolean; ctrl?: boolean; shift?: boolean } = {}): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      metaKey: opts.meta ?? false,
      ctrlKey: opts.ctrl ?? false,
      shiftKey: opts.shift ?? false,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** Fires a `Mod+` combo both ways.
 *
 *  `Mod` is Cmd on macOS and Ctrl elsewhere, and which one the
 *  dispatcher resolves it to depends on the platform the test happens
 *  to run on. Sending both keeps these tests about the binding rather
 *  than about the host. */
function pressMod(key: string, opts: { shift?: boolean } = {}): void {
  press(key, { meta: true, ...opts });
  press(key, { ctrl: true, ...opts });
}

describe('useDefaultKeybindings', () => {
  it('opens the cheat sheet on ?', () => {
    const h = handlers();
    renderHook(() => useDefaultKeybindings(h));

    press('?', { shift: true });

    expect(h.openCheatSheet).toHaveBeenCalled();
  });

  it('opens the command palette on the mod chord', () => {
    const h = handlers();
    renderHook(() => useDefaultKeybindings(h));

    pressMod('k');

    expect(h.openCommandPalette).toHaveBeenCalled();
  });

  it('calls the current handler after the shell swaps one out', () => {
    // The reason the ref exists. Registration happens once, so a
    // binding that closed over the mount-time handler would keep
    // calling a stale one for the life of the shell — and a shortcut
    // that quietly does the wrong thing reads as a shortcut that does
    // nothing.
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ newTab }: { newTab: () => void }) => useDefaultKeybindings(handlers({ newTab })),
      { initialProps: { newTab: first } },
    );

    rerender({ newTab: second });
    pressMod('t');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it('honours the save predicate', () => {
    // Returning false has to let the event through unclaimed so the
    // browser's own Save gets a turn, rather than swallowing it.
    const h = handlers({ canSaveProfile: vi.fn().mockReturnValue(false) });
    renderHook(() => useDefaultKeybindings(h));

    pressMod('s');

    expect(h.canSaveProfile).toHaveBeenCalled();
    expect(h.saveActiveProfile).not.toHaveBeenCalled();
  });

  it('saves when the predicate allows it', () => {
    const h = handlers();
    renderHook(() => useDefaultKeybindings(h));

    pressMod('s');

    expect(h.saveActiveProfile).toHaveBeenCalled();
  });

  it('stops listening once the shell unmounts', () => {
    // The registration returns a disposer; dropping it would leave a
    // dead shell's handlers firing on every keystroke.
    const h = handlers();
    const { unmount } = renderHook(() => useDefaultKeybindings(h));
    unmount();

    pressMod('t');

    expect(h.newTab).not.toHaveBeenCalled();
  });
});
