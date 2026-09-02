// @vitest-environment jsdom

/**
 * The two presentations of the history list.
 *
 * `'dialog'` is the floating overlay the keyboard shortcut raises.
 * `'page'` fills its container, for use as a top-bar destination beside
 * Home. One implementation serves both — the list, the search, the
 * labels and the bulk delete are the same code, and only the framing
 * differs — so the two cannot drift apart.
 *
 * What must differ is dismissal. An overlay is dismissed by clicking
 * away from it or pressing Escape; a page is a view the user navigated
 * to on purpose, and both of those would throw it away by accident —
 * Escape especially, since the first thing in the view is a search box.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryPanel } from './HistoryPanel.js';
import type { HistoryEntry } from './types.js';

afterEach(cleanup);

const ENTRIES: HistoryEntry[] = [
  {
    id: 1,
    sql: 'SELECT * FROM CUSTOMERS',
    executedAt: 1_700_000_000_000,
    durationMs: 8,
    succeeded: true,
    rowCount: 3,
    label: null,
  } as HistoryEntry,
];

function renderPanel(props: Record<string, unknown> = {}) {
  return render(
    <HistoryPanel
      open
      profileLabel="local"
      entries={ENTRIES}
      onClose={vi.fn()}
      onPick={vi.fn()}
      {...props}
    />,
  );
}

describe('as a page', () => {
  it('is a region rather than a dialog', () => {
    // A dialog implies something to dismiss back to. A pane does not.
    renderPanel({ variant: 'page' });
    expect(screen.getByRole('region', { name: 'Query history' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not paint a backdrop over the app', () => {
    renderPanel({ variant: 'page' });
    const region = screen.getByRole('region', { name: 'Query history' });
    expect(region.className).not.toContain('fixed');
    expect(region.className).not.toContain('bg-black/40');
  });

  it('survives Escape', () => {
    // The search box has focus on arrival. Escape there means "clear
    // what I typed", not "discard this view".
    const onClose = vi.fn();
    renderPanel({ variant: 'page', onClose });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the same entries the dialog does', () => {
    renderPanel({ variant: 'page' });
    expect(screen.getByText(/SELECT \* FROM CUSTOMERS/)).toBeTruthy();
  });
});

describe('as a dialog', () => {
  it('is still the default', () => {
    // Every existing caller passes no variant and must be unaffected.
    renderPanel();
    expect(screen.getByRole('dialog', { name: 'Query history' })).toBeTruthy();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });

    fireEvent.click(screen.getByRole('dialog', { name: 'Query history' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
