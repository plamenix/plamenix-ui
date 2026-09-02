/**
 * Global keybinding dispatcher (I5.1).
 *
 * Mount this hook ONCE at the top-level shell component (App.tsx in
 * both editions). It subscribes to `document.keydown`, reads the
 * current `keybindings` contributions from the registry, walks them
 * in priority order, and dispatches the first matching binding whose
 * `when` predicate (if any) returns `true`. When the binding's `run`
 * returns truthy the dispatcher calls `event.preventDefault()` and
 * stops trying further bindings.
 *
 * Subscription is live: registering / unregistering a contribution
 * re-renders the hook (it consumes `usePluginContributions`) so newly
 * installed plugins start firing immediately without an App
 * remount. The keydown listener is reattached only when the host
 * environment changes (which it doesn't post-mount), so adding a
 * binding doesn't cost an `addEventListener` cycle.
 *
 * Combine with `registerBuiltinDefaultKeybindings(handlers)` at App
 * mount to ship the six shell-default combos through the registry.
 */

import { useEffect, useMemo, useRef } from 'react';
import { isMac as isMacPlatform, isTypingTarget } from '../platform.js';
import { getLogger } from '../log/index.js';
import { usePluginContributions } from '../plugin-react/usePluginContributions.js';
import {
  matchesCombo,
  pluginContributionsToKeybindings,
  type KeybindingContext,
  type KeybindingContributionPayload,
  type KeybindingDescriptor,
} from './keybinding-contract.js';

const log = getLogger('keybindings');

/** Hook attaching the registry-backed `keydown` dispatcher to the
 *  document. Pass `enabled: false` to disable dispatch globally (the
 *  hook still subscribes so re-enabling doesn't lose contributions). */
export function useGlobalKeybindings(opts: { enabled?: boolean } = {}): void {
  const enabled = opts.enabled ?? true;
  const contributions =
    usePluginContributions<KeybindingContributionPayload>('keybindings');

  // Cache parsed combos across renders — only re-compute when the
  // contributions array reference changes (registry guarantees a new
  // reference on register/unregister, but not on every snapshot read).
  const descriptors = useMemo<KeybindingDescriptor[]>(
    () =>
      pluginContributionsToKeybindings(contributions, (pluginId, contribId, err) => {
        log.warn(
          `failed to parse keybinding ${pluginId}:${contribId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }),
    [contributions],
  );

  // Keep a ref pointing at the current descriptors so the keydown
  // listener — installed once — sees the live list without re-binding
  // the document listener on every contribution change.
  const descriptorsRef = useRef<KeybindingDescriptor[]>(descriptors);
  descriptorsRef.current = descriptors;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const isMac = isMacPlatform();
    const onKey = (event: KeyboardEvent) => {
      if (!enabledRef.current) return;
      const ctx: KeybindingContext = {
        event,
        target: event.target,
        isTyping: isTypingTarget(event.target),
        isMac,
      };
      for (const desc of descriptorsRef.current) {
        if (!matchesCombo(desc.parsed, event, isMac)) continue;
        if (desc.when && !desc.when(ctx)) continue;
        let claimed = false;
        try {
          claimed = desc.run(ctx) === true;
        } catch (err) {
          log.error(
            `keybinding ${desc.id} (${desc.combo}) threw: ${err instanceof Error ? err.message : String(err)}`,
          );
          // Treat a thrown handler as "did not claim" so the next
          // binding still gets a turn — host stays responsive.
          continue;
        }
        if (claimed) {
          event.preventDefault();
          return;
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
