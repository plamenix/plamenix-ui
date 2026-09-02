// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { PluginOutlet } from './PluginOutlet.js';
import { registry, registerContributions, unregisterPlugin } from './registry.js';
import type { Contribution } from './types.js';

describe('<PluginOutlet>', () => {
  beforeEach(() => {
    registry.__reset();
  });

  afterEach(() => {
    cleanup();
    registry.__reset();
  });

  it('renders nothing when the extension point has no contributions and no fallback is provided', () => {
    const { container } = render(<PluginOutlet point="cell_renderers" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the fallback when the extension point is empty', () => {
    render(
      <PluginOutlet
        point="cell_renderers"
        fallback={<span data-testid="empty-state">none yet</span>}
      />,
    );
    expect(screen.getByTestId('empty-state').textContent).toBe('none yet');
  });

  it('renders contributions via the default render path', () => {
    registerContributions('plg.one', {
      cell_renderers: [{ id: 'rndr', payload: {} }],
    });
    const { container } = render(<PluginOutlet point="cell_renderers" />);
    const node = container.querySelector('[data-plugin="plg.one"][data-contribution="rndr"]');
    expect(node).not.toBeNull();
  });

  it('routes contributions through a custom render prop when supplied', () => {
    interface Payload {
      label: string;
    }
    registerContributions('plg.one', {
      cell_renderers: [{ id: 'rndr', payload: { label: 'hello' } satisfies Payload }],
    });

    render(
      <PluginOutlet<Payload>
        point="cell_renderers"
        render={({ pluginId, contribution }) => (
          <span data-testid="rendered">{pluginId}::{contribution.payload.label}</span>
        )}
      />,
    );

    expect(screen.getByTestId('rendered').textContent).toBe('plg.one::hello');
  });

  it('re-renders when a contribution is registered after mount', () => {
    const { container } = render(<PluginOutlet point="cell_renderers" />);
    expect(container.querySelectorAll('[data-plugin]')).toHaveLength(0);

    act(() => {
      registerContributions('plg.late', {
        cell_renderers: [{ id: 'r', payload: {} }],
      });
    });

    expect(container.querySelectorAll('[data-plugin]')).toHaveLength(1);
  });

  it('re-renders when a plugin is unregistered', () => {
    registerContributions('plg.one', {
      cell_renderers: [{ id: 'r', payload: {} }],
    });
    const { container } = render(<PluginOutlet point="cell_renderers" />);
    expect(container.querySelectorAll('[data-plugin]')).toHaveLength(1);

    act(() => {
      unregisterPlugin('plg.one');
    });

    expect(container.querySelectorAll('[data-plugin]')).toHaveLength(0);
  });

  it('orders contributions by priority (lower first)', () => {
    registerContributions('plg.one', {
      cell_renderers: [
        { id: 'late', priority: 200, payload: {} },
        { id: 'early', priority: 10, payload: {} },
        { id: 'middle', priority: 100, payload: {} },
      ],
    });

    const ids: string[] = [];
    render(
      <PluginOutlet
        point="cell_renderers"
        render={({ contribution }) => {
          ids.push(contribution.id);
          return null;
        }}
      />,
    );

    expect(ids).toEqual(['early', 'middle', 'late']);
  });

  it('merges contributions across plugins at the same extension point', () => {
    registerContributions('plg.alpha', {
      cell_renderers: [{ id: 'a', priority: 50, payload: {} }],
    });
    registerContributions('plg.beta', {
      cell_renderers: [{ id: 'b', priority: 10, payload: {} }],
    });

    const order: string[] = [];
    render(
      <PluginOutlet
        point="cell_renderers"
        render={({ pluginId, contribution }) => {
          order.push(`${pluginId}:${contribution.id}`);
          return null;
        }}
      />,
    );

    expect(order).toEqual(['plg.beta:b', 'plg.alpha:a']);
  });

  it('isolates extension points — registering to A does not trigger renders for outlet on B', () => {
    let renderCount = 0;
    render(
      <PluginOutlet
        point="export_formats"
        render={() => {
          renderCount += 1;
          return null;
        }}
      />,
    );
    const initial = renderCount;

    act(() => {
      registerContributions('plg.unrelated', {
        cell_renderers: [{ id: 'r', payload: {} }],
      });
    });

    expect(renderCount).toBe(initial);
  });

  it('unsubscribes on unmount — late registration does not throw or warn', () => {
    const { unmount } = render(<PluginOutlet point="cell_renderers" />);
    unmount();

    expect(() => {
      registerContributions('plg.after', {
        cell_renderers: [{ id: 'r', payload: {} }],
      });
    }).not.toThrow();
  });

  it('typed render prop reflects the Payload generic for downstream consumers', () => {
    interface CellRendererPayload {
      mimeType: string;
      Component: () => null;
    }
    const contribution: Contribution<CellRendererPayload> = {
      id: 'json-tree',
      payload: { mimeType: 'application/json', Component: () => null },
    };
    registerContributions('plg.types', { cell_renderers: [contribution] });

    render(
      <PluginOutlet<CellRendererPayload>
        point="cell_renderers"
        render={({ contribution: c }) => (
          <span data-testid="mime">{c.payload.mimeType}</span>
        )}
      />,
    );

    expect(screen.getByTestId('mime').textContent).toBe('application/json');
  });
});
