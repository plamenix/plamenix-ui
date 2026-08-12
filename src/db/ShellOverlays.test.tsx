// @vitest-environment jsdom

/**
 * The identifier-append rule, and the overlay set as a contract.
 *
 * The rule is the reason picking two tables in a row does not produce
 * `CUSTOMERSORDERS`. It was written longhand in both shells, which is
 * two places for it to stop being true.
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShellOverlays, appendIdentifier, type ShellOverlayTab } from './ShellOverlays.js';

afterEach(cleanup);

describe('appendIdentifier', () => {
  it('separates the identifier from what is already there', () => {
    expect(appendIdentifier('SELECT * FROM', 'CUSTOMERS')).toBe('SELECT * FROM CUSTOMERS');
  });

  it('does not double a space the buffer already ends with', () => {
    expect(appendIdentifier('SELECT * FROM ', 'CUSTOMERS')).toBe('SELECT * FROM CUSTOMERS');
  });

  it('starts an empty buffer without a leading space', () => {
    // Otherwise the first pick indents the statement by one column.
    expect(appendIdentifier('', 'CUSTOMERS')).toBe('CUSTOMERS');
  });

  it('keeps two consecutive picks apart', () => {
    // The failure this rule exists for.
    const once = appendIdentifier('', 'CUSTOMERS');
    expect(appendIdentifier(once, 'ORDERS')).toBe('CUSTOMERS ORDERS');
  });

  it('treats a trailing newline as needing a separator', () => {
    // Recording what the rule does rather than endorsing it: only a
    // literal space counts as already-separated, so a newline gets a
    // space appended and the new line starts one column in. Harmless,
    // and worth knowing before someone "fixes" the check to trim.
    expect(appendIdentifier('SELECT *\n', 'FROM')).toBe('SELECT *\n FROM');
  });
});

const TAB: ShellOverlayTab = {
  sessionId: 's1',
  health: 'healthy',
  user: 'SYSDBA',
  host: 'localhost',
  port: 3050,
  database: '/data/test.fdb',
  executedSql: null,
  results: null,
  schema: null,
};

function renderOverlays(overrides: Partial<Parameters<typeof ShellOverlays>[0]> = {}) {
  return render(
    <ShellOverlays
      tab={TAB}
      recentKey="localhost/test.fdb"
      commands={[]}
      paletteOpen={false}
      onPaletteClose={vi.fn()}
      shortcutsOpen={false}
      onShortcutsClose={vi.fn()}
      searchOpen={false}
      onSearchClose={vi.fn()}
      onSearchPick={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ShellOverlays', () => {
  it('always renders the status bar, whatever is open', () => {
    const { container } = renderOverlays();
    expect(container.textContent).toContain('SYSDBA');
    expect(container.textContent).toContain('localhost');
  });

  it('renders the status bar while disconnected too', () => {
    // The bar carries the brand attribution, so a disconnected shell
    // that dropped it would lose it.
    const { container } = renderOverlays({
      tab: { ...TAB, sessionId: null, health: 'unknown' },
    });
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('keeps the overlays closed until asked', () => {
    const { container } = renderOverlays();
    expect(container.textContent).not.toContain('Keyboard shortcuts');
  });

  it('opens the cheat sheet when its flag is set', () => {
    const { container } = renderOverlays({ shortcutsOpen: true });
    expect(container.textContent).toMatch(/shortcut/i);
  });
});
