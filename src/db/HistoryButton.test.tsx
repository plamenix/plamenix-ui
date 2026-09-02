// @vitest-environment jsdom

/**
 * The top-bar History button.
 *
 * Query history — storage, search, labels, bulk delete — shipped long
 * before anything in the interface pointed at it. The only way in was a
 * keyboard shortcut, and it was not in the app menu either, so in
 * practice the feature was reachable only by someone who already knew
 * it existed.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryButton } from './HistoryButton.js';

afterEach(cleanup);

describe('HistoryButton', () => {
  it('is reachable by its accessible name', () => {
    render(<HistoryButton onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'History' })).toBeTruthy();
  });

  it('opens history when pressed', () => {
    const onClick = vi.fn();
    render(<HistoryButton onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('marks itself as the current page when history is showing', () => {
    // It is a destination beside Home, not a modal trigger, so it
    // carries the same "you are here" contract Home does.
    render(<HistoryButton onClick={vi.fn()} active />);
    expect(screen.getByRole('button', { name: 'History' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('claims nothing when it is not the current page', () => {
    render(<HistoryButton onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'History' }).getAttribute('aria-current')).toBeNull();
  });

  it('keeps its label on one line', () => {
    // It sits in the same overflow-prone top bar that squeezed the
    // transaction controls into each other.
    render(<HistoryButton onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'History' }).className).toContain(
      'whitespace-nowrap',
    );
  });
});
