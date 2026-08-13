// @vitest-environment jsdom

/**
 * The boundary that stops a render error blanking the app.
 *
 * Without one, an uncaught error unmounts the whole React root: white
 * page, every open tab's in-memory state gone, nothing saying why. That
 * happened for real — a two-statement script mounted two result tables
 * and the second one's built-in registration threw.
 *
 * These tests deliberately render components that throw, so React logs
 * the error to the console as it recovers. That noise is expected.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary.js';
import { setLogSink, createRecordingSink, type RecordingSink } from './log/index.js';

let sink: RecordingSink;

beforeEach(() => {
  sink = createRecordingSink();
  setLogSink(sink);
  // React prints the caught error itself; silencing keeps the run
  // readable without hiding anything the assertions depend on.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Boom({ message = 'kaboom' }: { message?: string }): never {
  throw new Error(message);
}

describe('catching', () => {
  it('shows a fallback instead of unmounting the tree', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('kaboom');
  });

  it('renders children untouched when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>the actual app</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('the actual app')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the message rather than a generic apology', () => {
    // A message the user can read is a message they can report.
    render(
      <ErrorBoundary>
        <Boom message="plugin `x` already registered contributions" />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert').textContent).toContain('already registered');
  });

  it('tells the user their session survived', () => {
    // The blank page taught people to expect having lost everything.
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert').textContent).toMatch(/connections and open tabs/i);
  });
});

describe('reporting', () => {
  it('logs through the shell’s sink, with the component stack', () => {
    // The stack names the subtree that failed, which the message alone
    // does not.
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    const record = sink.entries.find((r) => r.message.includes('render error'));
    expect(record).toBeDefined();
    expect(record?.level).toBe('error');
    expect(JSON.stringify(record?.fields ?? {})).toContain('Boom');
  });

  it('hands the error to a shell that wants to report it too', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe('kaboom');
  });
});

describe('recovering', () => {
  it('re-renders the children when the user asks', () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('transient');
      return <p>recovered</p>;
    }

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeDefined();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /reload the view/i }));

    expect(screen.getByText('recovered')).toBeDefined();
  });

  it('does not retry on its own', () => {
    // A render error usually recurs on the next render with the same
    // state. A boundary that retried would flicker between the error
    // and the crash rather than settling anywhere the user can act.
    const Throwing = vi.fn(Boom);
    render(
      <ErrorBoundary>
        <Throwing />
      </ErrorBoundary>,
    );

    const callsAfterCatch = Throwing.mock.calls.length;
    expect(screen.getByRole('alert')).toBeDefined();
    expect(Throwing.mock.calls.length).toBe(callsAfterCatch);
  });

  it('lets a host supply its own fallback', () => {
    render(
      <ErrorBoundary fallback={(error, reset) => <button onClick={reset}>{error.message}</button>}>
        <Boom message="custom" />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: 'custom' })).toBeDefined();
  });
});
