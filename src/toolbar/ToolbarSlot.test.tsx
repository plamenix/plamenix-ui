// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ToolbarSlot } from './ToolbarSlot.js';
import { registry, registerContributions } from '../plugin-react/registry.js';

interface StatusCtx {
  sessionId: string | null;
}

describe('ToolbarSlot (I5.3)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    cleanup();
    registry.__reset();
  });

  it('renders nothing when no contributions target the location', () => {
    const { container } = render(
      <ToolbarSlot<StatusCtx> location="status" ctx={{ sessionId: null }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one button per matching contribution + skips other locations', () => {
    registerContributions('com.example.multi', {
      toolbar_buttons: [
        {
          id: 'a',
          payload: { location: 'status', label: 'A', icon: () => null, run: () => {} },
        },
        {
          id: 'b',
          payload: { location: 'status', label: 'B', icon: () => null, run: () => {} },
        },
        {
          id: 'c',
          payload: { location: 'tab', label: 'C', run: () => {} },
        },
      ],
    });
    render(<ToolbarSlot<StatusCtx> location="status" ctx={{ sessionId: 's' }} />);
    // status slot hides labels by default — `aria-label` carries the
    // hint (= label fallback), so role=button queries find them.
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'A' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'B' })).toBeDefined();
  });

  it('click invokes the contribution run with the live ctx', () => {
    const run = vi.fn();
    registerContributions('com.example.click', {
      toolbar_buttons: [
        {
          id: 'go',
          payload: {
            location: 'tab',
            label: 'Go',
            run,
          },
        },
      ],
    });
    render(<ToolbarSlot<{ sessionId: string }> location="tab" ctx={{ sessionId: 'abc' }} />);
    screen.getByRole('button', { name: 'Go' }).click();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toEqual({
      location: 'tab',
      data: { sessionId: 'abc' },
    });
  });

  it('hides labels in the status slot but shows them when showLabel is true', () => {
    registerContributions('com.example.label', {
      toolbar_buttons: [
        {
          id: 'labelled',
          payload: {
            location: 'status',
            label: 'Visible',
            icon: () => null,
            run: () => {},
          },
        },
      ],
    });
    const { rerender } = render(
      <ToolbarSlot<StatusCtx> location="status" ctx={{ sessionId: 's' }} />,
    );
    expect(screen.queryByText('Visible')).toBeNull();
    rerender(
      <ToolbarSlot<StatusCtx>
        location="status"
        ctx={{ sessionId: 's' }}
        showLabel
      />,
    );
    expect(screen.getByText('Visible')).toBeDefined();
  });

  it('honours when() predicate — items hidden when predicate returns false', () => {
    registerContributions('com.example.guarded', {
      toolbar_buttons: [
        {
          id: 'guarded',
          payload: {
            location: 'tab',
            label: 'Connected only',
            when: (ctx) => (ctx.data as { sessionId: string | null }).sessionId !== null,
            run: () => {},
          },
        },
      ],
    });
    const { rerender } = render(
      <ToolbarSlot<{ sessionId: string | null }>
        location="tab"
        ctx={{ sessionId: null }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Connected only' })).toBeNull();
    rerender(
      <ToolbarSlot<{ sessionId: string | null }>
        location="tab"
        ctx={{ sessionId: 'session-1' }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Connected only' })).toBeDefined();
  });

  it('button data-attrs carry pluginId + contribution id (debug + Permissions panel needs this)', () => {
    registerContributions('com.example.debug', {
      toolbar_buttons: [
        {
          id: 'debug-btn',
          payload: { location: 'tab', label: 'Debug', run: () => {} },
        },
      ],
    });
    render(<ToolbarSlot<{ sessionId: string }> location="tab" ctx={{ sessionId: 's' }} />);
    const btn = screen.getByRole('button', { name: 'Debug' });
    expect(btn.getAttribute('data-plugin')).toBe('com.example.debug');
    expect(btn.getAttribute('data-contribution')).toBe('com.example.debug:debug-btn');
  });
});
