// @vitest-environment jsdom

/**
 * What a click in the schema sidebar does to the SQL editor.
 *
 * The answer is: nothing, ever.
 *
 * It used to append. Clicking a column called `onSelect('TABLE.COLUMN')`
 * and both shells concatenated that onto the editor buffer, so the
 * commonest possible gesture — reading `SELECT * FROM CUSTOMERS`, then
 * clicking a column of CUSTOMERS to see it — produced
 * `SELECT * FROM CUSTOMERS CUSTOMERS.ID`, which does not parse. There
 * was no undo affordance and nothing said what had happened.
 *
 * Insertion still exists; it just belongs to gestures that name a
 * destination. Dragging a node into the editor inserts at the drop
 * point, which the editor has handled correctly all along.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchemaBrowser } from './SchemaBrowser.js';
import type { Schema } from './types.js';

afterEach(cleanup);

const SCHEMA: Schema = {
  tables: [
    {
      name: 'CUSTOMERS',
      kind: 'table',
      columns: [
        { name: 'ID', position: 0, sqlType: 'INTEGER', nullable: false },
        { name: 'lower_case', position: 1, sqlType: 'VARCHAR(50)', nullable: true },
      ],
    },
  ],
  procedures: [],
  triggers: [],
  generators: [],
  domains: [],
} as Schema;

function renderBrowser(props: Record<string, unknown> = {}) {
  return render(<SchemaBrowser schema={SCHEMA} busy={false} {...props} />);
}

/** Expands CUSTOMERS so its columns render. The chevron, not the name —
 *  the name is a copy action now. */
function expandTable() {
  fireEvent.click(screen.getByRole('button', { name: /expand columns/i }));
}

describe('clicking a column', () => {
  it('never writes to the editor', async () => {
    // The bug, named. `onSelect` is the append channel; nothing may
    // reach it from a click any more.
    const onSelect = vi.fn();
    renderBrowser({ onSelect, onCopyIdentifier: vi.fn() });
    expandTable();

    fireEvent.click(await screen.findByText('ID'));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('copies the column name instead', async () => {
    const onCopyIdentifier = vi.fn();
    renderBrowser({ onCopyIdentifier });
    expandTable();

    fireEvent.click(await screen.findByText('ID'));

    expect(onCopyIdentifier).toHaveBeenCalledWith('ID', 'CUSTOMERS.ID');
  });

  it('quotes a name that would not survive unquoted', async () => {
    // Firebird folds an unquoted identifier to upper case, so pasting
    // `lower_case` addresses `LOWER_CASE`, which does not exist. The
    // label stays unquoted — it is prose for the confirmation, not SQL.
    const onCopyIdentifier = vi.fn();
    renderBrowser({ onCopyIdentifier });
    expandTable();

    fireEvent.click(await screen.findByText('lower_case'));

    expect(onCopyIdentifier).toHaveBeenCalledWith('"lower_case"', 'CUSTOMERS.lower_case');
  });

  it('still renders when the host offers no copy handler', async () => {
    // Optional prop. A sidebar that throws because the host did not
    // wire clipboard support would be a worse bug than the one fixed.
    renderBrowser();
    expandTable();

    const column = await screen.findByText('ID');
    expect(() => fireEvent.click(column)).not.toThrow();
  });
});

describe('dragging a node', () => {
  it('carries SQL-safe text for a qualified column', async () => {
    // This is the sanctioned insert path, so its payload is SQL and
    // has to be quoted as SQL. It used to hand over raw names.
    renderBrowser({ onCopyIdentifier: vi.fn() });
    expandTable();

    const setData = vi.fn();
    fireEvent.dragStart(await screen.findByText('lower_case'), {
      dataTransfer: { setData, effectAllowed: '' },
    });

    expect(setData).toHaveBeenCalledWith('text/plain', 'CUSTOMERS."lower_case"');
  });

  it('leaves an already-safe name bare', async () => {
    // Quoting everything would work, and would make every dropped
    // identifier noisier than the SQL a user writes by hand.
    renderBrowser({ onCopyIdentifier: vi.fn() });
    expandTable();

    const setData = vi.fn();
    fireEvent.dragStart(await screen.findByText('ID'), {
      dataTransfer: { setData, effectAllowed: '' },
    });

    expect(setData).toHaveBeenCalledWith('text/plain', 'CUSTOMERS.ID');
  });
});
