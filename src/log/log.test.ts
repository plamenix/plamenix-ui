import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createRecordingSink,
  getLogger,
  setLogLevel,
  setLogSink,
  type LogSink,
} from './index';

describe('logger', () => {
  let previous: LogSink;
  const sink = createRecordingSink();

  beforeEach(() => {
    previous = setLogSink(sink);
    setLogLevel('trace');
    sink.clear();
  });

  afterEach(() => {
    setLogSink(previous);
    setLogLevel('info');
  });

  it('records scope and message', () => {
    const log = getLogger('db.session');
    log.warn('attach failed', { sessionId: 'abc' });
    expect(sink.entries).toHaveLength(1);
    const entry = sink.entries[0]!;
    expect(entry.level).toBe('warn');
    expect(entry.scope).toBe('db.session');
    expect(entry.message).toBe('attach failed');
    expect(entry.fields).toEqual({ sessionId: 'abc' });
  });

  it('drops records below the threshold', () => {
    setLogLevel('warn');
    const log = getLogger('plugins');
    log.info('skipped');
    log.warn('kept');
    expect(sink.entries.map((e) => e.message)).toEqual(['kept']);
  });

  it('child loggers concatenate scopes with dots', () => {
    const parent = getLogger('host');
    const child = parent.child('boot');
    child.info('ready');
    expect(sink.entries[0]?.scope).toBe('host.boot');
  });

  it('omits fields when none are supplied', () => {
    const log = getLogger('root');
    log.info('no payload');
    expect(sink.entries[0]?.fields).toBeUndefined();
  });
});
