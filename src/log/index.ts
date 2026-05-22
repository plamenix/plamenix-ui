/**
 * Logger primitive shared by every Plamenix React surface.
 *
 * The library is transport-agnostic, so the logger is too: it defers
 * actual writing to a {@link LogSink} installed by the host edition.
 * `plamenix-desktop` bridges to Rust `tracing`; `plamenix-web` writes
 * to the browser console. Tests install a recording sink and assert on
 * the buffer.
 *
 * Call sites use the {@link log} root logger or a scoped child:
 *
 * ```ts
 * import { getLogger } from '@plamenix/ui';
 * const log = getLogger('tabs.store');
 * log.warn('failed to restore tab', { id, cause });
 * ```
 *
 * The default sink writes to `globalThis.console` so library code
 * remains useful in development without any host wiring. The `no-console`
 * lint rule stays in force everywhere else: this module is the single
 * authorised escape hatch.
 */

/** Severity levels in ascending order of urgency. */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

/** One structured log entry handed to a {@link LogSink}. */
export interface LogRecord {
  level: LogLevel;
  /** Dot-separated namespace; `""` at the root. */
  scope: string;
  message: string;
  /** Optional structured payload. Sinks may stringify or forward as-is. */
  fields?: Record<string, unknown>;
  /** Wall-clock epoch milliseconds at emit time. */
  time: number;
}

/** Implementations route {@link LogRecord}s to a backend (console, IPC,
 *  HTTP, memory buffer). Sinks must not throw — they are called from hot
 *  paths and from inside React render. */
export interface LogSink {
  write(record: LogRecord): void;
}

/** Public logger surface used by all call sites. */
export interface Logger {
  trace(message: string, fields?: Record<string, unknown>): void;
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  /** Returns a child whose records carry `<parent>.<name>` as their
   *  scope. Child loggers share the global sink and threshold. */
  child(name: string): Logger;
}

interface LoggerState {
  sink: LogSink;
  threshold: number;
}

const state: LoggerState = {
  sink: createConsoleSink(),
  threshold: LEVEL_ORDER.info,
};

/** Installs a new sink for the entire library. Returns the previous
 *  sink so tests can stack/restore. */
export function setLogSink(sink: LogSink): LogSink {
  const previous = state.sink;
  state.sink = sink;
  return previous;
}

/** Sets the minimum level. Records below the threshold are dropped
 *  before any sink call. Defaults to `info`. */
export function setLogLevel(level: LogLevel): void {
  state.threshold = LEVEL_ORDER[level];
}

function joinScope(parent: string, name: string): string {
  if (parent === '') return name;
  if (name === '') return parent;
  return `${parent}.${name}`;
}

function makeLogger(scope: string): Logger {
  const emit = (level: LogLevel, message: string, fields?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < state.threshold) return;
    const record: LogRecord = { level, scope, message, time: Date.now() };
    if (fields !== undefined) record.fields = fields;
    state.sink.write(record);
  };
  return {
    trace: (message, fields) => emit('trace', message, fields),
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    child: (name) => makeLogger(joinScope(scope, name)),
  };
}

/** Root logger. Prefer {@link getLogger} for module-level call sites. */
export const log: Logger = makeLogger('');

/** Returns a scoped logger. `scope` is a dot-separated namespace like
 *  `'db.session'` or `'plugins.host'`. */
export function getLogger(scope: string): Logger {
  return makeLogger(scope);
}

/** Console-backed sink. Maps each {@link LogLevel} onto the matching
 *  `console` method and formats records as
 *  `<ISO time> <LEVEL> [<scope>] <message>` followed by the optional
 *  fields object. This is the only place in the library that touches
 *  `globalThis.console`. */
export function createConsoleSink(): LogSink {
  return {
    write(record) {
      const prefix = `${new Date(record.time).toISOString()} ${record.level.toUpperCase()}`;
      const scoped = record.scope === '' ? prefix : `${prefix} [${record.scope}]`;
      const args: unknown[] = [`${scoped} ${record.message}`];
      if (record.fields !== undefined) args.push(record.fields);
      const out: Console = globalThis.console;
      switch (record.level) {
        case 'trace':
        case 'debug':
          out.debug(...args);
          return;
        case 'info':
          out.info(...args);
          return;
        case 'warn':
          out.warn(...args);
          return;
        case 'error':
          out.error(...args);
      }
    },
  };
}

/** In-memory sink useful for tests. Records are pushed to `entries` in
 *  emit order; tests assert on the buffer and call `clear()` between
 *  cases. */
export interface RecordingSink extends LogSink {
  readonly entries: ReadonlyArray<LogRecord>;
  clear(): void;
}

/** Builds a fresh {@link RecordingSink}. */
export function createRecordingSink(): RecordingSink {
  const entries: LogRecord[] = [];
  return {
    entries,
    write(record) {
      entries.push(record);
    },
    clear() {
      entries.length = 0;
    },
  };
}
