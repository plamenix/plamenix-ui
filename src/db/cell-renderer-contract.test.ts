import { describe, expect, it } from 'vitest';
import {
  pickCellRenderer,
  type CellRendererContext,
  type CellRendererPayload,
} from './cell-renderer-contract.js';
import type { PluginContribution } from '../plugin-react/usePluginContributions.js';

function entry(
  id: string,
  matches: (ctx: CellRendererContext) => boolean,
  pluginId = `plg.${id}`,
  priority = 100,
): PluginContribution<CellRendererPayload> {
  const NoopComponent = () => null;
  return {
    pluginId,
    contribution: {
      id,
      priority,
      payload: { matches, Component: NoopComponent },
    },
  };
}

function textCtx(value: string, columnName = 'col'): CellRendererContext {
  return {
    cell: { type: 'text', value },
    columnName,
    columnInfo: null,
    rowIndex: 0,
  };
}

describe('pickCellRenderer', () => {
  it('returns null when no contributions are registered', () => {
    const claimed = pickCellRenderer([], textCtx('anything'));
    expect(claimed).toBeNull();
  });

  it('returns null when no contribution claims the cell', () => {
    const all = [
      entry('a', () => false),
      entry('b', () => false),
    ];
    expect(pickCellRenderer(all, textCtx('hi'))).toBeNull();
  });

  it('returns the first matching payload in array order (priority-sorted upstream)', () => {
    const all = [
      entry('low-priority-no-match', () => false),
      entry('first-claim', (ctx) => ctx.columnName === 'jsonblob'),
      entry('second-claim', (ctx) => ctx.columnName === 'jsonblob'),
    ];
    const claimed = pickCellRenderer(all, textCtx('{}', 'jsonblob'));
    expect(claimed?.Component.name).toBe('NoopComponent');
    // Both could have claimed; first-claim wins.
    expect(claimed).toBe(all[1]?.contribution.payload);
  });

  it('feeds the supplied context to every predicate', () => {
    const seen: CellRendererContext[] = [];
    const all = [
      entry('audit-1', (ctx) => {
        seen.push(ctx);
        return false;
      }),
      entry('audit-2', (ctx) => {
        seen.push(ctx);
        return false;
      }),
    ];
    pickCellRenderer(all, textCtx('hi', 'name'));
    expect(seen).toHaveLength(2);
    expect(seen[0]?.cell).toEqual({ type: 'text', value: 'hi' });
    expect(seen[0]?.columnName).toBe('name');
    expect(seen[0]?.columnInfo).toBeNull();
    expect(seen[0]?.rowIndex).toBe(0);
  });

  it('short-circuits — predicates after the first match are not called', () => {
    let secondCalled = false;
    const all = [
      entry('first', () => true),
      entry('second', () => {
        secondCalled = true;
        return false;
      }),
    ];
    pickCellRenderer(all, textCtx('x'));
    expect(secondCalled).toBe(false);
  });

  it('matches on tagged-union cell variants — null, integer, blob', () => {
    const claimsNullsOnly: CellRendererPayload = {
      matches: (ctx) => ctx.cell.type === 'null',
      Component: () => null,
    };
    const all: ReadonlyArray<PluginContribution<CellRendererPayload>> = [
      { pluginId: 'plg.null', contribution: { id: 'n', payload: claimsNullsOnly } },
    ];
    expect(
      pickCellRenderer(all, { cell: { type: 'null' }, columnName: 'x', columnInfo: null, rowIndex: 0 }),
    ).toBe(claimsNullsOnly);
    expect(
      pickCellRenderer(all, { cell: { type: 'integer', value: 1 }, columnName: 'x', columnInfo: null, rowIndex: 0 }),
    ).toBeNull();
    expect(
      pickCellRenderer(all, {
        cell: { type: 'blob', value: { id: 'b', sizeBytes: 1024, peekHex: '00' } },
        columnName: 'x',
        columnInfo: null,
        rowIndex: 0,
      }),
    ).toBeNull();
  });
});
