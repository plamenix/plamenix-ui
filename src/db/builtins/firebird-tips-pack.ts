/**
 * Built-in Firebird tips pack (I4.7) — extracts the 32 hand-curated
 * tips from `firebird-tips.ts` into a `tip_packs` contribution
 * registered under `@plamenix-builtin/firebird-tips`.
 *
 * Visual + behaviour parity with the legacy static-array import: the
 * WelcomeDashboard's TipsCard continues to consume `FIREBIRD_TIPS`
 * directly until its consumer refactor lands in a later section;
 * this registration is additive — third-party tip packs registering
 * at the same point will surface alongside the built-in once the
 * dashboard reads from the registry. The legacy direct-import path
 * stays as a safety net (same pattern as I4.1's BLOB renderer).
 */

import { registerBuiltin, unregisterBuiltin } from '../../plugin-react/builtin.js';
import { FIREBIRD_TIPS } from '../firebird-tips.js';

const BUILTIN_NAME = 'firebird-tips';

/**
 * Registers the built-in Firebird tip pack with the shared registry.
 * Idempotent at the caller level (returns a teardown closure that
 * unregisters); pair with the cleanup in a `useEffect` if the host
 * needs deterministic mount/unmount lifecycle.
 */
export function registerBuiltinFirebirdTips(): () => void {
  registerBuiltin(BUILTIN_NAME, {
    tip_packs: [
      {
        id: 'firebird-default',
        // Priority 100 (default) — third-party tip packs that ship
        // higher-priority specialised content (vendor-specific
        // troubleshooting tips, locale-specific reminders, etc.)
        // appear ahead of the default pack in the rotation order.
        payload: {
          title: 'Firebird Tips & Tricks',
          tips: FIREBIRD_TIPS,
        },
      },
    ],
  });
  return () => unregisterBuiltin(BUILTIN_NAME);
}

/** Explicit teardown — alternative to the returned closure for
 *  callers that prefer named cleanup over closure capture. */
export function unregisterBuiltinFirebirdTips(): void {
  unregisterBuiltin(BUILTIN_NAME);
}
