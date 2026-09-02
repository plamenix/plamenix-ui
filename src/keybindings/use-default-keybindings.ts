import { useEffect, useRef } from 'react';
import {
  registerBuiltinDefaultKeybindings,
  type DefaultKeybindingHandlers,
} from './builtins/default-keybindings.js';
import { useGlobalKeybindings } from './useGlobalKeybindings.js';

/**
 * Starts the keybinding dispatcher and registers the shell defaults.
 *
 * Both shells did this by hand and identically: a ref holding every
 * handler, rewritten on each render, and a `useEffect` that registered
 * the built-ins once and read them back through that ref. The
 * indirection is necessary — the registration happens once, so it
 * cannot close over handlers that are recreated every render — and it
 * is exactly the kind of necessary indirection that is easy to get
 * subtly wrong in two places.
 *
 * It was wrong in one respect in both: the ref was written *during*
 * render, which is visible to a render React may then discard, so under
 * concurrent rendering a keystroke could act on props from a render that
 * never committed. It is refreshed in an effect here.
 */
export function useDefaultKeybindings(handlers: DefaultKeybindingHandlers): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useGlobalKeybindings();

  useEffect(() => {
    // Registered once, for the life of the shell. Every binding reads
    // through the ref so it runs the current handler rather than the
    // one that existed at mount — which is the whole reason the ref is
    // here, and the reason this cannot simply depend on `handlers`.
    return registerBuiltinDefaultKeybindings({
      openCheatSheet: () => latest.current.openCheatSheet(),
      openSearchPalette: () => latest.current.openSearchPalette(),
      openCommandPalette: () => latest.current.openCommandPalette(),
      newTab: () => latest.current.newTab(),
      closeActiveTab: () => latest.current.closeActiveTab(),
      canSaveProfile: () => latest.current.canSaveProfile(),
      saveActiveProfile: () => latest.current.saveActiveProfile(),
    });
  }, []);
}
