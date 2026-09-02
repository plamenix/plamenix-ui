// @vitest-environment jsdom

/**
 * Carrying shell events across to the WASM plugin host.
 *
 * Before this, exactly one topic reached a WASM plugin. Everything else
 * in the catalogue was emitted and invisible to plugins — a
 * subscription would load, activate, appear in the plugins panel, and
 * never fire.
 *
 * The interesting behaviour is what it declines to send. Reaching the
 * host costs a round trip per event and `editor/changed` fires as the
 * user types.
 */

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eventBus } from './event-bus.js';
import {
  isForwardable,
  serialiseForHost,
  sessionOf,
  usePluginEventForwarding,
} from './use-plugin-event-forwarding.js';

afterEach(cleanup);

function setup(patterns: string[]) {
  const forwarded: [string, string, string | undefined][] = [];
  const skipped: [string, string][] = [];
  const rendered = renderHook(() =>
    usePluginEventForwarding({
      subscribedPatterns: patterns,
      forward: (topic, payload, sessionId) => forwarded.push([topic, payload, sessionId]),
      onSkipped: (topic, reason) => skipped.push([topic, reason]),
    }),
  );
  return { forwarded, skipped, rendered };
}

describe('isForwardable', () => {
  it('matches an exact subscription', () => {
    expect(isForwardable('query/executed', ['query/executed'])).toBe(true);
    expect(isForwardable('query/failed', ['query/executed'])).toBe(false);
  });

  it('honours single- and multi-segment globs', () => {
    expect(isForwardable('editor/focused', ['editor/*'])).toBe(true);
    expect(isForwardable('schema/action-applied', ['schema/**'])).toBe(true);
    expect(isForwardable('query/executed', ['**'])).toBe(true);
  });

  it('wants nothing when nothing is subscribed', () => {
    // The common case, and the one that has to cost nothing: no plugin
    // subscribed means no round trips at all.
    expect(isForwardable('editor/changed', [])).toBe(false);
  });

  it('ignores a pattern the tokeniser rejects', () => {
    // Defensive: it came from a manifest the host already accepted. A
    // throw here would take out every later pattern in the same check.
    expect(isForwardable('query/executed', ['', 'query/executed'])).toBe(true);
  });
});

describe('serialiseForHost', () => {
  it('serialises an ordinary payload', () => {
    const result = serialiseForHost({ rows: 3 }, 1024);
    expect(result).toEqual({ ok: true, json: '{"rows":3}' });
  });

  it('turns an absent payload into null rather than undefined', () => {
    // `JSON.stringify(undefined)` is `undefined`, not a string, and the
    // host takes a string.
    expect(serialiseForHost(undefined, 1024)).toEqual({ ok: true, json: 'null' });
  });

  it('refuses a payload with a cycle instead of throwing', () => {
    // Thrown inside an event handler this would take out every later
    // subscriber on the same emit.
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const result = serialiseForHost(cyclic, 1024);
    expect(result.ok).toBe(false);
  });

  it('refuses an oversized payload before the round trip', () => {
    const result = serialiseForHost({ blob: 'x'.repeat(200) }, 64);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain('over the 64 limit');
  });

  it('measures bytes rather than characters', () => {
    // A multi-byte string is longer on the wire than `length` suggests,
    // and the host's cap is in bytes.
    const emoji = { s: '🔥'.repeat(20) };
    const asChars = JSON.stringify(emoji).length;
    const result = serialiseForHost(emoji, asChars);
    expect(result.ok).toBe(false);
  });
});

describe('usePluginEventForwarding', () => {
  it('forwards an event some plugin subscribed to', () => {
    const h = setup(['query/executed']);
    eventBus.emit('query/executed', { rows: 3 });

    expect(h.forwarded).toEqual([['query/executed', '{"rows":3}', undefined]]);
  });

  it('sends nothing when no plugin is subscribed', () => {
    // `editor/changed` fires as the user types. Unconditional
    // forwarding would put a request on the wire per keystroke for no
    // reader.
    const h = setup([]);
    eventBus.emit('editor/changed', { sql: 'SELECT 1' });

    expect(h.forwarded).toEqual([]);
  });

  it('sends only the topics that match', () => {
    const h = setup(['schema/**']);
    eventBus.emit('schema/described', { tables: 2 });
    eventBus.emit('editor/changed', { sql: 'x' });
    eventBus.emit('schema/action-applied', { kind: 'table' });

    expect(h.forwarded.map(([topic]) => topic)).toEqual([
      'schema/described',
      'schema/action-applied',
    ]);
  });

  it('reports a payload it could not send, and keeps going', () => {
    const h = setup(['**']);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    eventBus.emit('query/executed', cyclic);
    eventBus.emit('query/failed', { error: 'boom' });

    expect(h.skipped.map(([topic]) => topic)).toEqual(['query/executed']);
    expect(h.forwarded.map(([topic]) => topic)).toEqual(['query/failed']);
  });

  it('stops forwarding once the shell unmounts', () => {
    // The subscription outliving the shell would keep firing round
    // trips for a UI nobody is looking at.
    const h = setup(['**']);
    h.rendered.unmount();
    eventBus.emit('query/executed', { rows: 1 });

    expect(h.forwarded).toEqual([]);
  });

  it('picks up a pattern set that changed without dropping events', () => {
    // Plugins come and go. Re-subscribing on every change would leave a
    // gap; the subscription is permanent and the filter is per event.
    const patterns: string[] = [];
    const forwarded: string[] = [];
    const { rerender } = renderHook(
      ({ subscribed }: { subscribed: string[] }) =>
        usePluginEventForwarding({
          subscribedPatterns: subscribed,
          forward: (topic) => forwarded.push(topic),
        }),
      { initialProps: { subscribed: patterns } },
    );

    eventBus.emit('query/executed', {});
    expect(forwarded).toEqual([]);

    rerender({ subscribed: ['query/executed'] });
    eventBus.emit('query/executed', {});
    expect(forwarded).toEqual(['query/executed']);
  });
});

describe('the session an event is about', () => {
  it('carries it alongside the event', () => {
    // This is what makes a subscribing plugin's `db` capability usable
    // while it handles the event. Without a session the host has
    // nothing to answer "the one I called you for" with, and every `db`
    // import refuses — so a plugin the install dialog said had database
    // access would be denied it exactly when it tried to use it.
    const h = setup(['query/executed']);
    eventBus.emit('query/executed', { sessionId: 'sess-1', sql: 'SELECT 1' });

    expect(h.forwarded[0]?.[2]).toBe('sess-1');
  });

  it('sends none for an event that is not about a session', () => {
    const h = setup(['**']);
    eventBus.emit('theme/changed', { mode: 'dark' });

    expect(h.forwarded[0]?.[2]).toBeUndefined();
  });

  it('ignores a sessionId that is not a usable string', () => {
    // `null` is the shape a disconnected tab's payload carries, and it
    // is not a session.
    const h = setup(['**']);
    eventBus.emit('query/failed', { sessionId: null, error: 'x' });
    eventBus.emit('query/failed', { sessionId: '', error: 'x' });

    expect(h.forwarded.map((f) => f[2])).toEqual([undefined, undefined]);
  });
});

describe('sessionOf', () => {
  it('reads a session out of a payload', () => {
    expect(sessionOf({ sessionId: 'abc' })).toBe('abc');
  });

  it('reports none for anything that does not name one', () => {
    expect(sessionOf(null)).toBeUndefined();
    expect(sessionOf('a string')).toBeUndefined();
    expect(sessionOf({})).toBeUndefined();
    expect(sessionOf({ sessionId: 42 })).toBeUndefined();
  });
});
