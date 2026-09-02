import { useEffect, useRef } from 'react';
import { eventBus, matchesPattern, tokenisePattern } from './event-bus.js';

/**
 * Carries shell events across to the WASM plugin host.
 *
 * Two buses exist and they are not the same bus. This one — the
 * TypeScript one in `plamenix-ui` — is where the shell's events are
 * emitted, because that is where most of them happen: a tab opens, an
 * editor gains focus, a theme changes. The plugin host's bus lives in
 * Rust, in the desktop backend or the web server, and it is the only
 * one a WASM plugin can subscribe to.
 *
 * Until this existed, exactly one topic ever reached a WASM plugin:
 * `db/query/executed`, dispatched by the shells directly. Everything
 * else in the catalogue was documented, emitted, and invisible to
 * plugins — a subscription would load, activate, appear in the plugins
 * panel, and never fire.
 *
 * ## Why it forwards selectively
 *
 * Reaching the host means a round trip per event: a Tauri command on
 * desktop, an HTTP request on web. `editor/changed` fires as the user
 * types. Forwarding unconditionally would put a request on the wire per
 * keystroke whether or not anything reads it.
 *
 * So the host is asked which patterns are actually subscribed, and only
 * matching topics are sent. With no plugins subscribed — the common
 * case — this costs one query at mount and nothing after.
 */

export interface PluginEventForwardingOptions {
  /** Patterns any plugin is currently subscribed to. Re-read when the
   *  set can have changed — a plugin activating, deactivating, or being
   *  granted a capability. */
  subscribedPatterns: readonly string[];
  /** Hands one event to the plugin host. Failures are the host's to
   *  report; this returns void because nothing in the UI should stall
   *  on a plugin.
   *
   *  `sessionId` is the session the event is about, lifted from the
   *  payload. It is what makes a subscribing plugin's `db` capability
   *  usable while it handles the event: the host answers "the session I
   *  called you for", and without one every `db` import refuses. */
  forward: (topic: string, payload: string, sessionId: string | undefined) => void;
  /** Cap on a serialised payload. The host refuses oversized ones
   *  anyway; refusing here saves the round trip and keeps the reason
   *  legible. Defaults to 64 KiB. */
  maxPayloadBytes?: number;
  /** Reports a payload that could not be sent. */
  onSkipped?: (topic: string, reason: string) => void;
}

const DEFAULT_MAX_PAYLOAD = 64 * 1024;

/** Whether any subscribed pattern wants this topic. */
/**
 * Reads the session a payload is about, when it names one.
 *
 * Most shell payloads carry `sessionId` because most shell events are
 * about a session. Lifted here rather than threaded separately so the
 * two cannot disagree — the event and the session it is delivered under
 * come from the same object.
 */
export function sessionOf(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object') return undefined;
  const value = (payload as { sessionId?: unknown }).sessionId;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function isForwardable(topic: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    try {
      return matchesPattern(tokenisePattern(pattern), topic);
    } catch {
      // A pattern the tokeniser rejects cannot match anything. It came
      // from a manifest the host already accepted, so this is defensive
      // rather than expected.
      return false;
    }
  });
}

/**
 * Serialises a payload for the host, or explains why it cannot.
 *
 * The host takes a string, so anything with a cycle or a `BigInt` in it
 * has to be caught here rather than thrown into an event handler where
 * it would take out every later subscriber on the same emit.
 */
export function serialiseForHost(
  payload: unknown,
  maxBytes: number,
): { ok: true; json: string } | { ok: false; reason: string } {
  let json: string;
  try {
    json = JSON.stringify(payload ?? null);
  } catch (err) {
    return { ok: false, reason: `payload is not serialisable: ${String(err)}` };
  }
  if (json === undefined) {
    return { ok: false, reason: 'payload serialised to undefined' };
  }
  const size = new TextEncoder().encode(json).length;
  if (size > maxBytes) {
    return { ok: false, reason: `payload is ${size} bytes, over the ${maxBytes} limit` };
  }
  return { ok: true, json };
}

export function usePluginEventForwarding({
  subscribedPatterns,
  forward,
  maxPayloadBytes = DEFAULT_MAX_PAYLOAD,
  onSkipped,
}: PluginEventForwardingOptions): void {
  const latest = useRef({ subscribedPatterns, forward, maxPayloadBytes, onSkipped });
  useEffect(() => {
    latest.current = { subscribedPatterns, forward, maxPayloadBytes, onSkipped };
  });

  useEffect(() => {
    // One subscription for everything, filtered per event, rather than
    // one per pattern. The pattern set changes as plugins come and go,
    // and re-subscribing on every change would drop events in the gap.
    const subscription = eventBus.subscribe(
      '@plamenix-builtin/plugin-event-bridge',
      '**',
      (topic, payload) => {
        const current = latest.current;
        if (!isForwardable(topic, current.subscribedPatterns)) return;

        const serialised = serialiseForHost(payload, current.maxPayloadBytes);
        if (!serialised.ok) {
          current.onSkipped?.(topic, serialised.reason);
          return;
        }
        current.forward(topic, serialised.json, sessionOf(payload));
      },
    );
    return () => subscription.dispose();
  }, []);
}
