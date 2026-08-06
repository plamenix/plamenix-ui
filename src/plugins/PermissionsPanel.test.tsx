// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PermissionsPanel } from './PermissionsPanel.js';
import type { ActivePlugin, PluginSupervisionInfo } from './types.js';

const supervision = (
  overrides: Partial<PluginSupervisionInfo> = {},
): PluginSupervisionInfo => ({
  status: 'active',
  restartPolicy: 'transient',
  restartCount: 0,
  crashBudget: { used: 0, max: 3, windowSecs: 60 },
  ...overrides,
});

const plugin = (overrides: Partial<ActivePlugin> = {}): ActivePlugin => ({
  id: 'org.example.fmt',
  name: 'Format SQL',
  version: '1.2.3',
  sidebarPanels: [],
  logs: [],
  activation: { status: 'ok' },
  requiredPermissions: ['contributions.sql_formatters'],
  optionalPermissions: ['network.fetch', 'fs.read'],
  grantedPermissions: ['contributions.sql_formatters', 'network.fetch'],
  pendingPermissions: [],
  ...overrides,
});

describe('PermissionsPanel (I7.3)', () => {
  afterEach(() => cleanup());

  it('renders empty state when no plugins installed', () => {
    render(<PermissionsPanel plugins={[]} />);
    expect(screen.getByText('No plugins installed')).toBeTruthy();
  });

  it('renders one row per (plugin, permission) pair', () => {
    render(<PermissionsPanel plugins={[plugin()]} />);
    // 1 required + 2 optional = 3 rows
    const rows = screen.getAllByRole('row');
    // 1 header + 3 data rows
    expect(rows).toHaveLength(4);
  });

  it('renders correct status pills per kind+granted state', () => {
    render(<PermissionsPanel plugins={[plugin()]} />);
    // Required + granted → Granted pill (emerald)
    // Optional + granted (network.fetch) → Granted
    // Optional + not granted (fs.read) → Revoked
    expect(screen.getAllByText('Granted')).toHaveLength(2);
    expect(screen.getByText('Revoked')).toBeTruthy();
  });

  it('renders Pending status for required permission not yet granted', () => {
    render(
      <PermissionsPanel
        plugins={[
          plugin({
            requiredPermissions: ['db.read'],
            grantedPermissions: [],
            pendingPermissions: ['db.read'],
            optionalPermissions: [],
          }),
        ]}
      />,
    );
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('granted optional row shows Revoke button + fires onRevoke', () => {
    const onRevoke = vi.fn();
    render(<PermissionsPanel plugins={[plugin()]} onRevoke={onRevoke} />);
    // network.fetch is the granted optional → Revoke button
    const btn = screen.getByRole('button', {
      name: 'Revoke network.fetch from org.example.fmt',
    });
    fireEvent.click(btn);
    expect(onRevoke).toHaveBeenCalledWith('org.example.fmt', 'network.fetch');
  });

  it('not-granted optional row shows Grant button + fires onGrant', () => {
    const onGrant = vi.fn();
    render(<PermissionsPanel plugins={[plugin()]} onGrant={onGrant} />);
    // fs.read is not granted → Grant button
    const btn = screen.getByRole('button', {
      name: 'Grant fs.read to org.example.fmt',
    });
    fireEvent.click(btn);
    expect(onGrant).toHaveBeenCalledWith('org.example.fmt', 'fs.read');
  });

  it('required+granted row shows "Uninstall to revoke" copy (not a button)', () => {
    render(<PermissionsPanel plugins={[plugin()]} />);
    expect(screen.getByText('Uninstall to revoke')).toBeTruthy();
  });

  it('required+pending row shows Grant button', () => {
    const onGrant = vi.fn();
    render(
      <PermissionsPanel
        plugins={[
          plugin({
            requiredPermissions: ['db.read'],
            grantedPermissions: [],
            pendingPermissions: ['db.read'],
            optionalPermissions: [],
          }),
        ]}
        onGrant={onGrant}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Grant db.read to org.example.fmt' }),
    );
    expect(onGrant).toHaveBeenCalledWith('org.example.fmt', 'db.read');
  });

  it('action buttons are disabled when corresponding callback is missing', () => {
    render(<PermissionsPanel plugins={[plugin()]} />);
    // No onRevoke supplied → Revoke button disabled
    const revoke = screen.getByRole('button', {
      name: 'Revoke network.fetch from org.example.fmt',
    });
    expect((revoke as HTMLButtonElement).disabled).toBe(true);
    // No onGrant supplied → Grant button disabled
    const grant = screen.getByRole('button', {
      name: 'Grant fs.read to org.example.fmt',
    });
    expect((grant as HTMLButtonElement).disabled).toBe(true);
  });

  it('filter narrows rows by plugin name', () => {
    render(
      <PermissionsPanel
        plugins={[
          plugin({ id: 'a', name: 'AAA Plugin' }),
          plugin({ id: 'b', name: 'BBB Plugin' }),
        ]}
      />,
    );
    const input = screen.getByLabelText('Filter permissions');
    fireEvent.change(input, { target: { value: 'BBB' } });
    expect(screen.queryByText('AAA Plugin')).toBeNull();
    expect(screen.getAllByText('BBB Plugin').length).toBeGreaterThan(0);
  });

  it('filter narrows rows by permission string', () => {
    render(<PermissionsPanel plugins={[plugin()]} />);
    const input = screen.getByLabelText('Filter permissions');
    fireEvent.change(input, { target: { value: 'fs.' } });
    expect(screen.queryByText('network.fetch')).toBeNull();
    expect(screen.getByText('fs.read')).toBeTruthy();
  });

  it('filter narrows rows by plugin id', () => {
    render(<PermissionsPanel plugins={[plugin({ id: 'unique.id.token' })]} />);
    const input = screen.getByLabelText('Filter permissions');
    fireEvent.change(input, { target: { value: 'unique.id' } });
    expect(screen.getAllByText('unique.id.token').length).toBeGreaterThan(0);
    fireEvent.change(input, { target: { value: 'no-match' } });
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('filter is case-insensitive + trims whitespace', () => {
    render(<PermissionsPanel plugins={[plugin({ name: 'CaseMatters' })]} />);
    const input = screen.getByLabelText('Filter permissions');
    fireEvent.change(input, { target: { value: '   casematters   ' } });
    expect(screen.getAllByText('CaseMatters').length).toBeGreaterThan(0);
  });

  it('renders plugin id under plugin name (audit context)', () => {
    render(<PermissionsPanel plugins={[plugin()]} />);
    expect(screen.getAllByText('org.example.fmt').length).toBeGreaterThan(0);
  });

  it('handles multiple plugins in matrix', () => {
    render(
      <PermissionsPanel
        plugins={[
          plugin({
            id: 'p1',
            name: 'Plugin One',
            requiredPermissions: ['cap.a'],
            optionalPermissions: [],
            grantedPermissions: ['cap.a'],
          }),
          plugin({
            id: 'p2',
            name: 'Plugin Two',
            requiredPermissions: [],
            optionalPermissions: ['cap.b'],
            grantedPermissions: [],
          }),
        ]}
      />,
    );
    // 1 header + 1 row from p1 + 1 row from p2 = 3 rows total
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('Plugin One')).toBeTruthy();
    expect(screen.getByText('Plugin Two')).toBeTruthy();
  });

  it('table has semantic header cells with scope=col', () => {
    render(<PermissionsPanel plugins={[plugin()]} />);
    const thead = screen.getAllByRole('rowgroup')[0]!;
    const headerCells = within(thead).getAllByRole('columnheader');
    expect(headerCells).toHaveLength(5);
    for (const h of headerCells) {
      expect(h.getAttribute('scope')).toBe('col');
    }
  });
});

describe('PermissionsPanel — supervision section (I7.4)', () => {
  afterEach(() => cleanup());

  it('does NOT render supervision section when no plugin has supervision data', () => {
    render(<PermissionsPanel plugins={[plugin()]} />);
    expect(screen.queryByText('Plugin status')).toBeNull();
  });

  it('renders supervision section + status pill when at least one plugin has supervision', () => {
    render(
      <PermissionsPanel plugins={[plugin({ supervision: supervision() })]} />,
    );
    expect(screen.getByText('Plugin status')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('renders crash budget counter + progressbar with aria attrs', () => {
    render(
      <PermissionsPanel
        plugins={[
          plugin({
            supervision: supervision({
              status: 'crashing',
              restartCount: 2,
              crashBudget: { used: 2, max: 3, windowSecs: 60 },
            }),
          }),
        ]}
      />,
    );
    expect(screen.getByText(/Crashes 2\/3 \(60s\)/)).toBeTruthy();
    const bar = screen.getByRole('progressbar', {
      name: 'Crash budget for org.example.fmt',
    });
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('3');
    expect(bar.getAttribute('aria-valuenow')).toBe('2');
    expect(screen.getByText('Restarts: 2')).toBeTruthy();
  });

  it('renders disable-reason banner + Re-enable button when status is disabled', () => {
    const onReEnable = vi.fn();
    render(
      <PermissionsPanel
        plugins={[
          plugin({
            supervision: supervision({
              status: 'disabled',
              crashBudget: { used: 3, max: 3, windowSecs: 60 },
              disableReason: 'crash-budget-exhausted',
            }),
          }),
        ]}
        onReEnable={onReEnable}
      />,
    );
    expect(screen.getByText('Disabled')).toBeTruthy();
    expect(screen.getByText(/crashed too many times/i)).toBeTruthy();
    const btn = screen.getByRole('button', {
      name: 'Re-enable org.example.fmt',
    });
    fireEvent.click(btn);
    expect(onReEnable).toHaveBeenCalledWith('org.example.fmt');
  });

  it('hides Re-enable button when status=disabled but onReEnable callback is missing', () => {
    render(
      <PermissionsPanel
        plugins={[
          plugin({
            supervision: supervision({
              status: 'disabled',
              crashBudget: { used: 3, max: 3, windowSecs: 60 },
              disableReason: 'crash-budget-exhausted',
            }),
          }),
        ]}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Re-enable org.example.fmt' }),
    ).toBeNull();
  });

  it('hides Re-enable button when status is not disabled even if onReEnable supplied', () => {
    render(
      <PermissionsPanel
        plugins={[plugin({ supervision: supervision({ status: 'active' }) })]}
        onReEnable={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Re-enable org.example.fmt' }),
    ).toBeNull();
  });

  it('only lists plugins with supervision data; legacy plugins skip the section row', () => {
    render(
      <PermissionsPanel
        plugins={[
          plugin({ id: 'p1', name: 'Has supervision', supervision: supervision() }),
          plugin({ id: 'p2', name: 'Legacy plugin' }),
        ]}
      />,
    );
    // Supervision section heading appears.
    expect(screen.getByText('Plugin status')).toBeTruthy();
    // p1 is in the supervision section list; p2 is not.
    const section = screen.getByText('Plugin status').closest('section');
    expect(section).not.toBeNull();
    expect(within(section!).getByText('Has supervision')).toBeTruthy();
    expect(within(section!).queryByText('Legacy plugin')).toBeNull();
  });
});
