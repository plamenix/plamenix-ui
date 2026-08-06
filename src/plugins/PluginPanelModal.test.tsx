// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PluginPanelModal } from './PluginPanelModal.js';
import type {
  ActivePlugin,
  PluginSupervisionInfo,
  SidebarPanelInfo,
} from './types.js';

const panel: SidebarPanelInfo = { id: 'p1', label: 'Inspector' };

const basePlugin = (overrides: Partial<ActivePlugin> = {}): ActivePlugin => ({
  id: 'org.plamenix.example',
  name: 'Example',
  version: '1.0.0',
  sidebarPanels: [panel],
  logs: [],
  activation: { status: 'ok' },
  requiredPermissions: [],
  optionalPermissions: [],
  grantedPermissions: [],
  pendingPermissions: [],
  ...overrides,
});

const supervision = (
  overrides: Partial<PluginSupervisionInfo> = {},
): PluginSupervisionInfo => ({
  status: 'active',
  restartPolicy: 'transient',
  restartCount: 0,
  crashBudget: { used: 0, max: 3, windowSecs: 60 },
  ...overrides,
});

describe('PluginPanelModal — supervision section (I8.5)', () => {
  afterEach(() => cleanup());

  it('does not render supervision section when supervision is absent', () => {
    render(
      <PluginPanelModal
        plugin={basePlugin()}
        panel={panel}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText('Supervision')).toBeNull();
  });

  it('renders status pill + restart policy label', () => {
    render(
      <PluginPanelModal
        plugin={basePlugin({
          supervision: supervision({ status: 'active', restartPolicy: 'permanent' }),
        })}
        panel={panel}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Supervision')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText(/Permanent/)).toBeTruthy();
  });

  it('renders crash budget count + progress bar with aria values', () => {
    render(
      <PluginPanelModal
        plugin={basePlugin({
          supervision: supervision({
            status: 'crashing',
            restartCount: 2,
            crashBudget: { used: 2, max: 3, windowSecs: 60 },
          }),
        })}
        panel={panel}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('2 of 3 used')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Crash budget' });
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('3');
    expect(bar.getAttribute('aria-valuenow')).toBe('2');
  });

  it('renders disable reason banner when status is disabled', () => {
    render(
      <PluginPanelModal
        plugin={basePlugin({
          supervision: supervision({
            status: 'disabled',
            crashBudget: { used: 3, max: 3, windowSecs: 60 },
            disableReason: 'crash-budget-exhausted',
          }),
        })}
        panel={panel}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Disabled')).toBeTruthy();
    expect(screen.getByText(/crashed too many times/i)).toBeTruthy();
  });

  it('renders re-enable button only when status is disabled AND onReEnable is supplied', () => {
    const { rerender } = render(
      <PluginPanelModal
        plugin={basePlugin({
          supervision: supervision({ status: 'active' }),
        })}
        panel={panel}
        onClose={vi.fn()}
        onReEnable={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Re-enable/ })).toBeNull();

    rerender(
      <PluginPanelModal
        plugin={basePlugin({
          supervision: supervision({
            status: 'disabled',
            crashBudget: { used: 3, max: 3, windowSecs: 60 },
            disableReason: 'crash-budget-exhausted',
          }),
        })}
        panel={panel}
        onClose={vi.fn()}
        onReEnable={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Re-enable/ })).toBeTruthy();

    // Without onReEnable, the button is suppressed even when disabled.
    rerender(
      <PluginPanelModal
        plugin={basePlugin({
          supervision: supervision({
            status: 'disabled',
            crashBudget: { used: 3, max: 3, windowSecs: 60 },
            disableReason: 'crash-budget-exhausted',
          }),
        })}
        panel={panel}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Re-enable/ })).toBeNull();
  });

  it('fires onReEnable with the plugin id when clicked', () => {
    const onReEnable = vi.fn();
    render(
      <PluginPanelModal
        plugin={basePlugin({
          supervision: supervision({
            status: 'disabled',
            crashBudget: { used: 3, max: 3, windowSecs: 60 },
            disableReason: 'crash-budget-exhausted',
          }),
        })}
        panel={panel}
        onClose={vi.fn()}
        onReEnable={onReEnable}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Re-enable/ }));
    expect(onReEnable).toHaveBeenCalledWith('org.plamenix.example');
  });

  it('progressbar width clamps to 100 even when used > max (defensive)', () => {
    render(
      <PluginPanelModal
        plugin={basePlugin({
          supervision: supervision({
            status: 'disabled',
            crashBudget: { used: 99, max: 3, windowSecs: 60 },
            disableReason: 'crash-budget-exhausted',
          }),
        })}
        panel={panel}
        onClose={vi.fn()}
      />,
    );
    const bar = screen.getByRole('progressbar', { name: 'Crash budget' });
    const fill = bar.firstChild as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill!.style.width).toBe('100%');
  });
});
