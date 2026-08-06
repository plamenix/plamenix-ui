import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pluginContributionsToToolbarButtons,
  type ToolbarButtonContributionPayload,
  type ToolbarContext,
} from './toolbar-button-contract.js';
import { registry, registerContributions } from '../plugin-react/registry.js';

interface TabCtx {
  sessionId: string | null;
  busy: boolean;
}

function tabDescriptors(ctx: TabCtx) {
  return pluginContributionsToToolbarButtons<TabCtx>(
    registry.getContributions<ToolbarButtonContributionPayload<TabCtx>>('toolbar_buttons'),
    'tab',
    ctx,
  );
}

describe('pluginContributionsToToolbarButtons (I5.3)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    registry.__reset();
  });

  it('filters out contributions whose location does not match', () => {
    registerContributions('com.example.a', {
      toolbar_buttons: [
        {
          id: 'in-tab',
          payload: {
            location: 'tab',
            label: 'A',
            run: () => {},
          } satisfies ToolbarButtonContributionPayload<TabCtx>,
        },
        {
          id: 'in-status',
          payload: { location: 'status', label: 'B', run: () => {} },
        },
        {
          id: 'in-tabstrip',
          payload: { location: 'tabstrip', label: 'C', run: () => {} },
        },
      ],
    });
    const tab = tabDescriptors({ sessionId: 's', busy: false });
    expect(tab.map((d) => d.id)).toEqual(['com.example.a:in-tab']);
  });

  it('descriptor id namespaces by pluginId + contribution id', () => {
    registerContributions('com.example.ns', {
      toolbar_buttons: [
        {
          id: 'foo',
          payload: { location: 'tab', label: 'X', run: () => {} },
        },
      ],
    });
    const [d] = tabDescriptors({ sessionId: 's', busy: false });
    expect(d?.id).toBe('com.example.ns:foo');
    expect(d?.pluginId).toBe('com.example.ns');
  });

  it('drops items whose when() returns false against the supplied ctx', () => {
    registerContributions('com.example.guarded', {
      toolbar_buttons: [
        {
          id: 'only-connected',
          payload: {
            location: 'tab',
            label: 'Connected',
            when: (ctx) => (ctx.data as TabCtx).sessionId !== null,
            run: () => {},
          },
        },
      ],
    });
    expect(tabDescriptors({ sessionId: null, busy: false })).toHaveLength(0);
    expect(tabDescriptors({ sessionId: 's', busy: false })).toHaveLength(1);
  });

  it('descriptor.run invokes the contribution with the captured ctx', () => {
    const run = vi.fn();
    registerContributions('com.example.r', {
      toolbar_buttons: [
        {
          id: 'click-me',
          payload: { location: 'tab', label: 'Click', run },
        },
      ],
    });
    const ctx = { sessionId: 'abc', busy: false };
    tabDescriptors(ctx)[0]?.run();
    expect(run).toHaveBeenCalledTimes(1);
    const arg = run.mock.calls[0]?.[0] as ToolbarContext<TabCtx>;
    expect(arg.location).toBe('tab');
    expect(arg.data).toEqual(ctx);
  });

  it('respects registry priority order — lower number sorts first', () => {
    registerContributions('com.example.late', {
      toolbar_buttons: [
        {
          id: 'late',
          priority: 200,
          payload: { location: 'tab', label: 'Late', run: () => {} },
        },
      ],
    });
    registerContributions('com.example.early', {
      toolbar_buttons: [
        {
          id: 'early',
          priority: 50,
          payload: { location: 'tab', label: 'Early', run: () => {} },
        },
      ],
    });
    const ids = tabDescriptors({ sessionId: 's', busy: false }).map((d) => d.id);
    expect(ids).toEqual(['com.example.early:early', 'com.example.late:late']);
  });

  it('defaults variant to "default" and hint to label when payload omits them', () => {
    registerContributions('com.example.defaults', {
      toolbar_buttons: [
        {
          id: 'plain',
          payload: { location: 'tab', label: 'Plain', run: () => {} },
        },
      ],
    });
    const [d] = tabDescriptors({ sessionId: 's', busy: false });
    expect(d?.variant).toBe('default');
    expect(d?.hint).toBe('Plain');
  });

  it('carries explicit variant + hint + icon through unchanged', () => {
    const icon = (() => null) as unknown as React.ComponentType<{ className?: string }>;
    registerContributions('com.example.styled', {
      toolbar_buttons: [
        {
          id: 'styled',
          payload: {
            location: 'tab',
            label: 'Styled',
            hint: 'A specific hint',
            icon,
            variant: 'accent',
            run: () => {},
          },
        },
      ],
    });
    const [d] = tabDescriptors({ sessionId: 's', busy: false });
    expect(d?.variant).toBe('accent');
    expect(d?.hint).toBe('A specific hint');
    expect(d?.icon).toBe(icon);
  });

  it('descriptor.ctx exposes the captured context for inspection', () => {
    registerContributions('com.example.captured', {
      toolbar_buttons: [
        {
          id: 'captured',
          payload: { location: 'tab', label: 'X', run: () => {} },
        },
      ],
    });
    const ctx = { sessionId: 'abc', busy: true };
    const [d] = tabDescriptors(ctx);
    expect(d?.ctx).toEqual({ location: 'tab', data: ctx });
  });
});
