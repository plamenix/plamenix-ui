// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TransactionBar } from './TransactionBar.js';
import type { TxStatus } from './types.js';

function status(overrides: Partial<TxStatus> = {}): TxStatus {
  return {
    mode: 'autocommit',
    config: { isolation: 'readCommitted', locking: { kind: 'noWait' } },
    open: false,
    pendingStatements: 0,
    ageMs: 0,
    ...overrides,
  };
}

function setup(overrides: Partial<TxStatus> = {}, busy = false) {
  const onSetMode = vi.fn();
  const onCommit = vi.fn();
  const onRollback = vi.fn();
  render(
    <TransactionBar
      status={status(overrides)}
      busy={busy}
      onSetMode={onSetMode}
      onCommit={onCommit}
      onRollback={onRollback}
    />,
  );
  return { onSetMode, onCommit, onRollback };
}

afterEach(cleanup);

describe('TransactionBar', () => {
  it('renders nothing without a session', () => {
    const { container } = render(
      <TransactionBar status={null} onSetMode={vi.fn()} onCommit={vi.fn()} onRollback={vi.fn()} />,
    );
    // jest-dom matchers are not installed here; check the DOM directly.
    expect(container.innerHTML).toBe('');
  });

  it('starts in autocommit and hides the transaction controls', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Autocommit' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Commit$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rollback/ })).toBeNull();
  });

  it('toggles into manual mode, carrying the current settings', () => {
    const { onSetMode } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Autocommit' }));
    expect(onSetMode).toHaveBeenCalledWith('manual', {
      isolation: 'readCommitted',
      locking: { kind: 'noWait' },
    });
  });

  it('offers commit and rollback in manual mode, disabled until something is open', () => {
    setup({ mode: 'manual', open: false });
    expect(screen.getByRole('button', { name: /Commit/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /Rollback/ }).hasAttribute('disabled')).toBe(true);
  });

  it('enables them once a transaction is open', () => {
    const { onCommit, onRollback } = setup({ mode: 'manual', open: true, pendingStatements: 2 });
    fireEvent.click(screen.getByRole('button', { name: /Commit/ }));
    fireEvent.click(screen.getByRole('button', { name: /Rollback/ }));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onRollback).toHaveBeenCalledOnce();
  });

  it('locks the mode toggle while a transaction is open', () => {
    // Switching here would have to silently commit or discard the work.
    setup({ mode: 'manual', open: true, pendingStatements: 1 });
    const toggle = screen.getByRole('button', { name: 'Manual commit' });
    expect(toggle.hasAttribute('disabled')).toBe(true);
    expect(toggle.getAttribute('title')).toContain('Commit or roll back');
  });

  it('reports what a rollback would discard', () => {
    setup({ mode: 'manual', open: true, pendingStatements: 3, ageMs: 12_000 });
    expect(screen.getByTestId('transaction-summary').textContent).toContain('3 statements');
  });

  it('warns about the real consequence once a transaction lingers', () => {
    setup({ mode: 'manual', open: true, pendingStatements: 1, ageMs: 6 * 60_000 });
    const summary = screen.getByTestId('transaction-summary');
    expect(summary.getAttribute('title')).toContain('garbage collection');
    expect(summary.className).toContain('text-danger');
  });

  it('changes isolation without changing mode', () => {
    const { onSetMode } = setup({ mode: 'manual', open: false });
    fireEvent.change(screen.getByLabelText('Isolation level'), { target: { value: 'snapshot' } });
    expect(onSetMode).toHaveBeenCalledWith('manual', {
      isolation: 'snapshot',
      locking: { kind: 'noWait' },
    });
  });

  it('switches lock resolution to a bounded wait', () => {
    const { onSetMode } = setup({ mode: 'manual', open: false });
    fireEvent.change(screen.getByLabelText('Lock resolution'), { target: { value: 'wait' } });
    expect(onSetMode).toHaveBeenCalledWith('manual', {
      isolation: 'readCommitted',
      locking: { kind: 'wait', timeoutSecs: 10 },
    });
  });

  it('disables everything while a call is in flight', () => {
    setup({ mode: 'manual', open: true, pendingStatements: 1 }, true);
    expect(screen.getByRole('button', { name: /Commit/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /Rollback/ }).hasAttribute('disabled')).toBe(true);
  });
});

/**
 * The bar under width pressure.
 *
 * Switching to manual mounts four more controls — two selects, Commit,
 * Rollback — into a toolbar that already holds Format, Stats,
 * Disconnect and Execute. At a narrow window that no longer fits, and a
 * flex row does not clip what it cannot fit: every child is squeezed
 * below its own text, and the text spills across whatever is beside it.
 * The result was a toolbar with three labels drawn on top of each other.
 *
 * jsdom does not lay out, so these assert the properties that stop a
 * child being squeezed rather than measured widths.
 */
describe('under width pressure', () => {
  const MANUAL: TxStatus = {
    mode: 'manual',
    config: { isolation: 'readCommitted', locking: { kind: 'noWait' } },
    open: false,
    pendingStatements: 0,
    startedAt: null,
  } as TxStatus;

  function renderManual() {
    return render(
      <TransactionBar
        status={MANUAL}
        onSetMode={vi.fn()}
        onCommit={vi.fn()}
        onRollback={vi.fn()}
      />,
    );
  }

  it('refuses to be squeezed by the cluster around it', () => {
    // Its wrapper is `shrink-0`, but the bar is itself a flex item and
    // would otherwise inherit the default `shrink: 1`.
    renderManual();
    expect(screen.getByTestId('transaction-bar').className).toContain('shrink-0');
  });

  it('wraps rather than letting its controls collide', () => {
    renderManual();
    expect(screen.getByTestId('transaction-bar').className).toContain('flex-wrap');
  });

  it.each([
    ['Manual commit', /manual commit/i],
    ['Commit', /^commit$/i],
    ['Rollback', /^rollback$/i],
  ])('keeps %s at its own width', (_label, name) => {
    renderManual();
    const button = screen.getByRole('button', { name });
    expect(button.className).toContain('shrink-0');
    expect(button.className).toContain('whitespace-nowrap');
  });

  it.each([
    ['Isolation level'],
    ['Lock resolution'],
  ])('keeps the %s select at its own width', (label) => {
    renderManual();
    expect(screen.getByLabelText(label).className).toContain('shrink-0');
  });
});
