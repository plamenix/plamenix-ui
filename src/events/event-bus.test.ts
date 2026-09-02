import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EventBus,
  matchesPattern,
  tokenisePattern,
  type EventHandler,
} from './event-bus.js';

describe('tokenisePattern (I6.1)', () => {
  it('splits on slash', () => {
    expect(tokenisePattern('query/executed')).toEqual(['query', 'executed']);
    expect(tokenisePattern('a/b/c/d')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('preserves single-segment patterns', () => {
    expect(tokenisePattern('connection')).toEqual(['connection']);
    expect(tokenisePattern('**')).toEqual(['**']);
  });

  it('throws on empty input', () => {
    expect(() => tokenisePattern('')).toThrow();
  });
});

describe('matchesPattern (I6.1)', () => {
  const segs = (p: string) => tokenisePattern(p);

  it('matches exact topic', () => {
    expect(matchesPattern(segs('query/executed'), 'query/executed')).toBe(true);
    expect(matchesPattern(segs('query/executed'), 'query/failed')).toBe(false);
  });

  it('single * matches one segment', () => {
    expect(matchesPattern(segs('query/*'), 'query/executed')).toBe(true);
    expect(matchesPattern(segs('query/*'), 'query/failed')).toBe(true);
    expect(matchesPattern(segs('query/*'), 'query/executed/extra')).toBe(false);
  });

  it('** matches zero or more trailing segments', () => {
    expect(matchesPattern(segs('**'), 'anything')).toBe(true);
    expect(matchesPattern(segs('**'), 'anything/deeper')).toBe(true);
    expect(matchesPattern(segs('connection/**'), 'connection/opened')).toBe(true);
    expect(matchesPattern(segs('connection/**'), 'connection/health-changed')).toBe(true);
    expect(matchesPattern(segs('connection/**'), 'tab/opened')).toBe(false);
  });

  it('empty topic never matches', () => {
    expect(matchesPattern(segs('**'), '')).toBe(false);
  });

  it('pattern longer than topic does not match', () => {
    expect(matchesPattern(segs('a/b/c'), 'a/b')).toBe(false);
  });
});

describe('EventBus (I6.1)', () => {
  let bus: EventBus;
  beforeEach(() => {
    bus = new EventBus();
  });
  afterEach(() => {
    bus.__reset();
  });

  it('subscribe + emit invokes matching handler', () => {
    const handler = vi.fn();
    bus.subscribe('com.example.a', 'query/executed', handler);
    const count = bus.emit('query/executed', { sql: 'SELECT 1' });
    expect(count).toBe(1);
    expect(handler).toHaveBeenCalledWith('query/executed', { sql: 'SELECT 1' });
  });

  it('wildcard subscription receives multiple topics', () => {
    const handler = vi.fn();
    bus.subscribe('com.example.observability', 'query/*', handler);
    bus.emit('query/executed', null);
    bus.emit('query/failed', null);
    bus.emit('connection/opened', null);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0]?.[0]).toBe('query/executed');
    expect(handler.mock.calls[1]?.[0]).toBe('query/failed');
  });

  it('returns the count of invoked subscribers', () => {
    bus.subscribe('a', 'query/*', () => {});
    bus.subscribe('b', '**', () => {});
    bus.subscribe('c', 'connection/*', () => {});
    expect(bus.emit('query/executed', null)).toBe(2);
    expect(bus.emit('connection/opened', null)).toBe(2);
    expect(bus.emit('settings/changed', null)).toBe(1);
  });

  it('Disposable.dispose unsubscribes; emit no longer calls handler', () => {
    const handler = vi.fn();
    const sub = bus.subscribe('a', 'query/*', handler);
    bus.emit('query/executed', null);
    sub.dispose();
    bus.emit('query/executed', null);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispose is idempotent (double-dispose is a no-op)', () => {
    const handler = vi.fn();
    const sub = bus.subscribe('a', 'query/*', handler);
    sub.dispose();
    sub.dispose();
    bus.emit('query/executed', null);
    expect(handler).not.toHaveBeenCalled();
  });

  it('throwing handler does not break fan-out for other subscribers', () => {
    const thrower = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    bus.subscribe('thrower', 'query/*', thrower);
    bus.subscribe('good', 'query/*', good);
    bus.emit('query/executed', null);
    expect(thrower).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('subscriber that disposes during dispatch does not break fan-out (snapshot semantics)', () => {
    const first = vi.fn();
    let firstSub: { dispose(): void } | null = null;
    firstSub = bus.subscribe('first', '**', () => {
      first();
      firstSub?.dispose();
    });
    const second = vi.fn();
    bus.subscribe('second', '**', second);
    bus.emit('anything', null);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('unsubscribeByPluginId drops every subscription for a plugin', () => {
    bus.subscribe('a', 'query/*', () => {});
    bus.subscribe('a', 'connection/*', () => {});
    bus.subscribe('b', 'query/*', () => {});
    expect(bus.subscriptionCount()).toBe(3);
    const dropped = bus.unsubscribeByPluginId('a');
    expect(dropped).toBe(2);
    expect(bus.subscriptionCount()).toBe(1);
    expect(bus.emit('query/executed', null)).toBe(1);
  });

  it('handlers receive matched topic when subscribing via wildcards', () => {
    const seen: string[] = [];
    const handler: EventHandler = (topic) => seen.push(topic);
    bus.subscribe('a', 'connection/**', handler);
    bus.emit('connection/opened', null);
    bus.emit('connection/health-changed', null);
    expect(seen).toEqual(['connection/opened', 'connection/health-changed']);
  });

  it('throws when subscribing with empty pluginId or pattern', () => {
    expect(() => bus.subscribe('', 'query/*', () => {})).toThrow();
    expect(() => bus.subscribe('a', '', () => {})).toThrow();
  });

  it('throws when emitting empty topic', () => {
    expect(() => bus.emit('', null)).toThrow();
  });
});
