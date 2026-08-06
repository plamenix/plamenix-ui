// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import {
  registerBuiltinBlobRenderer,
  unregisterBuiltinBlobRenderer,
} from './blob-cell-renderer.js';
import { isBuiltinPlugin } from '../../plugin-react/builtin.js';
import { pickCellRenderer } from '../cell-renderer-contract.js';
import { registry } from '../../plugin-react/registry.js';
import { usePluginContributions } from '../../plugin-react/usePluginContributions.js';
import type {
  CellRendererContext,
  CellRendererPayload,
} from '../cell-renderer-contract.js';
import type { BlobRef } from '../types.js';

const SAMPLE_BLOB: BlobRef = {
  id: 'b-1',
  sizeBytes: 256,
  peekHex: '89504e470d0a1a0a0000000d49484452',
};

function blobCtx(blob: BlobRef = SAMPLE_BLOB, colIndex = 3): CellRendererContext {
  return {
    cell: { type: 'blob', value: blob },
    columnName: 'image',
    columnInfo: null,
    rowIndex: 5,
    colIndex,
  };
}

function ProbeCell({ ctx }: { ctx: CellRendererContext }) {
  const contributions = usePluginContributions<CellRendererPayload>('cell_renderers');
  const claimed = pickCellRenderer(contributions, ctx);
  if (claimed) {
    const Component = claimed.Component;
    return <Component ctx={ctx} />;
  }
  return <span data-testid="fallback">no plugin claimed</span>;
}

describe('builtin BLOB cell renderer (I4.1)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    cleanup();
    unregisterBuiltinBlobRenderer();
    registry.__reset();
  });

  it('registers under the built-in namespace + claims blob cells', () => {
    const open = vi.fn();
    registerBuiltinBlobRenderer(open);

    const contributions = registry.getContributions('cell_renderers');
    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.pluginId).toBe('@plamenix-builtin/blob-renderer');
    expect(isBuiltinPlugin(contributions[0]?.pluginId ?? '')).toBe(true);
    expect(contributions[0]?.contribution.id).toBe('blob');
    expect(contributions[0]?.contribution.priority).toBe(50);
  });

  it('renders the BLOB button with leading-hex preview when claiming a blob cell', () => {
    const open = vi.fn();
    registerBuiltinBlobRenderer(open);
    const { container } = render(<ProbeCell ctx={blobCtx()} />);
    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain('BLOB');
    // Leading 16 hex chars from the peek string surface as `0x<…>` per
    // the existing default-switch visual.
    expect(btn?.textContent).toContain('0x89504e470d0a1a0a');
  });

  it('truncates the hex preview with ellipsis when the blob exceeds the preview length', () => {
    const open = vi.fn();
    registerBuiltinBlobRenderer(open);
    const { container } = render(<ProbeCell ctx={blobCtx()} />);
    const btn = container.querySelector('button');
    // sizeBytes 256 * 2 = 512 hex chars total; preview only 16 →
    // truncated marker present.
    expect(btn?.textContent).toContain('…');
  });

  it('forwards click to the registered open callback with the cell context bound', () => {
    const open = vi.fn();
    registerBuiltinBlobRenderer(open);
    const ctx = blobCtx(SAMPLE_BLOB, 7);
    const { container } = render(<ProbeCell ctx={ctx} />);
    fireEvent.click(container.querySelector('button')!);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(SAMPLE_BLOB, 'image', 5, 7);
  });

  it('does NOT claim non-blob cells (cell.type guard)', () => {
    const open = vi.fn();
    registerBuiltinBlobRenderer(open);
    const ctx: CellRendererContext = {
      cell: { type: 'text', value: 'hello' },
      columnName: 'x',
      columnInfo: null,
      rowIndex: 0,
      colIndex: 0,
    };
    const { getByTestId } = render(<ProbeCell ctx={ctx} />);
    expect(getByTestId('fallback')).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
  });

  it('teardown unregisters cleanly — subsequent register works (re-init safe)', () => {
    const open1 = vi.fn();
    const teardown = registerBuiltinBlobRenderer(open1);
    teardown();
    expect(registry.getContributions('cell_renderers')).toHaveLength(0);

    // Second registration after teardown succeeds — proves the
    // unregister path drops the entry the registry's
    // already-registered guard checks against.
    const open2 = vi.fn();
    expect(() => registerBuiltinBlobRenderer(open2)).not.toThrow();
    expect(registry.getContributions('cell_renderers')).toHaveLength(1);
  });

  it('explicit unregisterBuiltinBlobRenderer is equivalent to the teardown closure', () => {
    registerBuiltinBlobRenderer(vi.fn());
    unregisterBuiltinBlobRenderer();
    expect(registry.getContributions('cell_renderers')).toHaveLength(0);
  });

  it('losers to higher-priority third-party blob renderers', () => {
    // Imagine an image-thumbnail plugin at priority 10 that wants to
    // claim BLOB cells before the built-in's BLOB button does.
    const { registerContributions } = registry;
    registry.registerContributions('com.example.image-thumb', {
      cell_renderers: [
        {
          id: 'thumb',
          priority: 10,
          payload: {
            matches: (ctx) => ctx.cell.type === 'blob',
            Component: () => <span data-testid="thumb">image thumb</span>,
          },
        },
      ],
    });
    const open = vi.fn();
    registerBuiltinBlobRenderer(open);

    const { getByTestId, container } = render(<ProbeCell ctx={blobCtx()} />);
    expect(getByTestId('thumb')).toBeTruthy();
    expect(container.querySelector('button')).toBeNull();
    expect(open).not.toHaveBeenCalled();
    // `registerContributions` is exposed via the registry export but
    // called above via the public re-export form — not destructuring
    // here is intentional, `registerContributions` is the same fn.
    void registerContributions;
  });
});
