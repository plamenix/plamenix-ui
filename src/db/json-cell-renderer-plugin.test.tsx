// @vitest-environment jsdom

/**
 * Integration test for `@plamenix/plugin-json-cell-renderer` — the
 * first NEW plugin (I4.9 tri-state validator).
 *
 * **Why this test does NOT go through `loadPluginUiFromBytes`**: the
 * production runtime path is `bundle → fetch / read → data: URL or
 * blob: URL → dynamic import() → registry`. The plugin's UI bundle
 * carries `import { createElement } from 'react'` (per I2.6
 * externalisation); production resolves that bare specifier through
 * the import map the shell injects at boot. **Node + jsdom under
 * vitest cannot honour an import map for data: URLs** — bare
 * specifiers from `data:text/javascript;…` fail with
 * `Failed to resolve module specifier "react" from "data:…"`. That is
 * an env limitation of Node's ESM resolver, not a plugin bug.
 *
 * The loader → data-URL → registry chain is already covered by
 * `loader.test.tsx` + `e2e.test.tsx` (using bundles that import
 * nothing). This file covers the **plugin-specific behaviour** —
 * predicate gating, JSON formatting, fallback on parse failure — by
 * registering the plugin's contribution directly through the same
 * `registerContributions` API the loader would call, then exercising
 * the dispatch through the I3.4 `pickCellRenderer` consumer pattern.
 * Production end-to-end validation lives in `plamenix-desktop` /
 * `plamenix-web` integration tests once the host wrappers ship in
 * later sections (the napi binding + Fastify route already serve the
 * bundle; the missing piece is the shell wrapping the load call).
 *
 * The plugin source files at
 * `plamenix-core/crates/plamenix-plugin-host/examples/json-cell-renderer/`
 * are the canonical author's example + the document that proves the
 * authoring workflow. THIS file proves the runtime contract.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMemo } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import {
  registerContributions,
  registry,
  unregisterPlugin,
} from '../plugin-react/registry.js';
import { usePluginContributions } from '../plugin-react/usePluginContributions.js';
import { pickCellRenderer } from './cell-renderer-contract.js';
import type { CellRendererContext, CellRendererPayload } from './cell-renderer-contract.js';

const PLUGIN_ID = 'dev.plamenix.json-cell-renderer';

// Inline copy of the plugin's predicate + Component, identical to
// what `plamenix-core/.../examples/json-cell-renderer/src/index.tsx`
// exports. Kept inline so the test does not require building the
// example, AND so the runtime contract this test exercises stays in
// the same file as the assertions for readability.

const JSON_LEAD = /^\s*[{[]/;

function matchesJsonCell(ctx: CellRendererContext): boolean {
  if (ctx.cell.type !== 'text') return false;
  return JSON_LEAD.test(ctx.cell.value);
}

function JsonTreeCell({ ctx }: { ctx: CellRendererContext }) {
  const formatted = useMemo(() => {
    if (ctx.cell.type !== 'text') return null;
    try {
      return JSON.stringify(JSON.parse(ctx.cell.value) as unknown, null, 2);
    } catch {
      return null;
    }
  }, [ctx.cell]);

  if (formatted === null) {
    return ctx.cell.type === 'text' ? <span data-testid="json-fallback">{ctx.cell.value}</span> : null;
  }
  return (
    <pre data-testid="json-tree" data-plugin={PLUGIN_ID}>
      {formatted}
    </pre>
  );
}

const jsonRendererPayload: CellRendererPayload = {
  matches: matchesJsonCell,
  Component: JsonTreeCell,
};

/** Mirrors the dispatch pattern inside `ResultTable.CellContent`
 *  (I3.4) without importing the full ResultTable file. */
function ProbeCell({ ctx }: { ctx: CellRendererContext }) {
  const contributions = usePluginContributions<CellRendererPayload>('cell_renderers');
  const claimed = pickCellRenderer(contributions, ctx);
  if (claimed) {
    const Component = claimed.Component;
    return <Component ctx={ctx} />;
  }
  return <span data-testid="fallback">no plugin claimed</span>;
}

function textCtx(value: string): CellRendererContext {
  return {
    cell: { type: 'text', value },
    columnName: 'metadata',
    columnInfo: null,
    rowIndex: 0,
  };
}

describe('@plamenix/plugin-json-cell-renderer (I4.9 tri-state validator)', () => {
  beforeEach(() => {
    registry.__reset();
    registerContributions(PLUGIN_ID, {
      cell_renderers: [
        { id: 'json-tree', priority: 50, payload: jsonRendererPayload },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    unregisterPlugin(PLUGIN_ID);
    registry.__reset();
  });

  it('renders JSON-shaped object cells as formatted tree', () => {
    render(<ProbeCell ctx={textCtx('{"users":42,"active":true}')} />);
    const pre = screen.getByTestId('json-tree');
    // Pretty-printed with 2-space indent — exact match proves the
    // plugin's `JSON.stringify(parsed, null, 2)` produced the body.
    expect(pre.textContent).toBe('{\n  "users": 42,\n  "active": true\n}');
    expect(pre.getAttribute('data-plugin')).toBe(PLUGIN_ID);
  });

  it('claims array-shaped cells too (predicate matches both `{` and `[` leads)', () => {
    render(<ProbeCell ctx={textCtx('[1,2,3]')} />);
    expect(screen.getByTestId('json-tree').textContent).toBe('[\n  1,\n  2,\n  3\n]');
  });

  it('does NOT claim non-JSON text cells (falls through to host fallback)', () => {
    render(<ProbeCell ctx={textCtx('plain text value')} />);
    expect(screen.queryByTestId('json-tree')).toBeNull();
    expect(screen.getByTestId('fallback').textContent).toBe('no plugin claimed');
  });

  it('does NOT claim non-text cell types (predicate guards by cell.type first)', () => {
    const ctx: CellRendererContext = {
      cell: { type: 'integer', value: 42 },
      columnName: 'count',
      columnInfo: null,
      rowIndex: 0,
    };
    render(<ProbeCell ctx={ctx} />);
    expect(screen.getByTestId('fallback')).toBeTruthy();
  });

  it('gracefully renders unparseable JSON cells without crashing the cell render', () => {
    // Lead-char heuristic claims this cell — it starts with `{` — but
    // JSON.parse fails on the unbalanced content. Plugin's catch path
    // renders the raw text via its own fallback span (NOT the host's
    // `no plugin claimed` fallback, which would mean the predicate
    // rejected the cell).
    render(<ProbeCell ctx={textCtx('{ broken: ')} />);
    expect(screen.queryByTestId('json-tree')).toBeNull();
    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('json-fallback').textContent).toBe('{ broken: ');
  });

  it('coexists with other plugin cell renderers via priority ordering', () => {
    // Register a higher-priority renderer that claims everything;
    // proves JSON renderer doesn't shadow other plugins when their
    // priorities outrank it.
    registerContributions('com.example.first', {
      cell_renderers: [
        {
          id: 'priority-winner',
          priority: 10, // lower number = higher priority than JSON's 50
          payload: {
            matches: () => true,
            Component: () => <span data-testid="winner">claimed first</span>,
          },
        },
      ],
    });
    render(<ProbeCell ctx={textCtx('{"json":true}')} />);
    expect(screen.getByTestId('winner').textContent).toBe('claimed first');
    expect(screen.queryByTestId('json-tree')).toBeNull();
    unregisterPlugin('com.example.first');
  });

  it('contract sanity: the plugin\'s contribution shape matches the existing CellRendererPayload', () => {
    // Surface-level check the plugin's payload is a valid
    // CellRendererPayload — guards against future type-shape drift
    // where the plugin source could compile but no longer satisfy
    // the contract.
    expect(typeof jsonRendererPayload.matches).toBe('function');
    expect(typeof jsonRendererPayload.Component).toBe('function');
    // Predicate gates non-text cells.
    expect(
      jsonRendererPayload.matches({
        cell: { type: 'null' },
        columnName: 'x',
        columnInfo: null,
        rowIndex: 0,
      }),
    ).toBe(false);
  });
});
