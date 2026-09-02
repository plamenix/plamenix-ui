// @vitest-environment jsdom

/**
 * The grid re-reads itself after a write.
 *
 * It used to sit there stale. A saved cell showed whatever the user
 * typed, held as an in-memory override — which is not necessarily what
 * the server stored, once a `DEFAULT`, a `BEFORE INSERT` trigger, a
 * computed column or a generator has had its say. An inserted row was
 * worse: there is no override for a row that was never in the result,
 * so the grid simply did not show it, and the interface asked the user
 * to go and re-run their own query.
 *
 * The automatic re-read must not reach query history. History is a
 * record of what the person ran; a machine-issued SELECT after every
 * saved cell would bury that.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MultiResultView } from './MultiResultView.js';
import type { Schema, StatementOutcome } from './types.js';

/**
 * The grid is virtualised by `@tanstack/react-virtual`, which asks the
 * DOM how tall its scroll container is. jsdom answers zero for
 * everything, so without this no row is ever rendered and the grid
 * cannot be driven at all — which is why these components had no tests.
 */
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 600,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 800,
  });
  HTMLElement.prototype.getBoundingClientRect = function getRect(): DOMRect {
    return { width: 800, height: 600, top: 0, left: 0, bottom: 600, right: 800, x: 0, y: 0,
      toJSON: () => ({}) } as DOMRect;
  };
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

const SCHEMA: Schema = {
  tables: [
    {
      name: 'CUSTOMERS',
      kind: 'table',
      primaryKey: ['ID'],
      columns: [
        { name: 'ID', position: 0, sqlType: 'INTEGER', nullable: false },
        { name: 'NAME', position: 1, sqlType: 'VARCHAR(50)', nullable: true },
      ],
    },
  ],
  procedures: [],
  triggers: [],
  generators: [],
  domains: [],
} as Schema;

const OUTCOMES: StatementOutcome[] = [
  {
    status: 'ok',
    sql: 'SELECT * FROM CUSTOMERS',
    durationMs: 8,
    result: {
      Rows: {
        columns: [{ name: 'ID' }, { name: 'NAME' }],
        rows: [
          {
            cells: [
              { type: 'integer', value: '1' },
              { type: 'text', value: 'Ada' },
            ],
          },
        ],
      },
    },
  } as unknown as StatementOutcome,
];

function renderView(overrides: Record<string, unknown> = {}) {
  const onApplyFilter = vi.fn().mockResolvedValue(undefined);
  const onCommitCellEdit = vi.fn().mockResolvedValue(undefined);
  render(
    <MultiResultView
      tabId="t1"
      sessionId="s1"
      outcomes={OUTCOMES}
      schema={SCHEMA}
      onCommitCellEdit={onCommitCellEdit}
      onApplyFilter={onApplyFilter}
      {...overrides}
    />,
  );
  return { onApplyFilter, onCommitCellEdit };
}

/** Saves a new value into the NAME cell of the only row. */
async function editNameCell(next: string) {
  const cell = await screen.findByText('Ada');
  fireEvent.doubleClick(cell);
  const input = await screen.findByDisplayValue('Ada');
  fireEvent.change(input, { target: { value: next } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('after a cell edit', () => {
  it('re-reads the grid instead of leaving it stale', async () => {
    const { onCommitCellEdit, onApplyFilter } = renderView();

    await editNameCell('Grace');

    await waitFor(() => expect(onCommitCellEdit).toHaveBeenCalled());
    await waitFor(() => expect(onApplyFilter).toHaveBeenCalled());
  });

  it('keeps the re-read out of query history', async () => {
    // The whole point of the flag. Without it every saved cell would
    // add a SELECT the user never typed.
    const { onApplyFilter } = renderView();

    await editNameCell('Grace');

    await waitFor(() => expect(onApplyFilter).toHaveBeenCalled());
    const [, options] = onApplyFilter.mock.calls.at(-1) as [string, { recordHistory?: boolean }];
    expect(options?.recordHistory).toBe(false);
  });

  it('re-reads the same query, not a reset one', async () => {
    // The user edited a row they were looking at. Sending them back to
    // page one as a reward for saving would be its own bug.
    const { onApplyFilter } = renderView();

    await editNameCell('Grace');

    await waitFor(() => expect(onApplyFilter).toHaveBeenCalled());
    const [sql] = onApplyFilter.mock.calls.at(-1) as [string];
    expect(sql).toContain('CUSTOMERS');
  });
});

describe('when the host cannot re-run', () => {
  it('does not pretend it can', async () => {
    // `onApplyFilter` absent means there is no execute path to reach.
    // The grid must still accept the edit rather than throwing.
    const onCommitCellEdit = vi.fn().mockResolvedValue(undefined);
    render(
      <MultiResultView
        tabId="t1"
        sessionId="s1"
        outcomes={OUTCOMES}
        schema={SCHEMA}
        onCommitCellEdit={onCommitCellEdit}
      />,
    );

    await editNameCell('Grace');

    await waitFor(() => expect(onCommitCellEdit).toHaveBeenCalled());
  });
});
