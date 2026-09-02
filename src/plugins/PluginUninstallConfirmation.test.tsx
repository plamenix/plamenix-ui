// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  PluginUninstallConfirmation,
  formatStorageSize,
  type PendingPluginUninstall,
} from './PluginUninstallConfirmation.js';

const pending = (
  overrides: Partial<PendingPluginUninstall> = {},
): PendingPluginUninstall => ({
  id: 'org.example.fmt',
  name: 'Format SQL',
  version: '1.2.3',
  grantCount: 2,
  storageBytes: 4096,
  ...overrides,
});

describe('formatStorageSize (I7.7)', () => {
  it('formats < 1 KiB as raw bytes', () => {
    expect(formatStorageSize(0)).toBe('0 B');
    expect(formatStorageSize(512)).toBe('512 B');
    expect(formatStorageSize(1023)).toBe('1023 B');
  });

  it('formats KiB with one decimal', () => {
    expect(formatStorageSize(1024)).toBe('1.0 KiB');
    expect(formatStorageSize(2560)).toBe('2.5 KiB');
  });

  it('formats MiB with one decimal', () => {
    expect(formatStorageSize(1024 * 1024)).toBe('1.0 MiB');
    expect(formatStorageSize(1024 * 1024 * 5 + 1024 * 512)).toBe('5.5 MiB');
  });

  it('formats GiB with two decimals', () => {
    expect(formatStorageSize(1024 * 1024 * 1024)).toBe('1.00 GiB');
  });
});

describe('PluginUninstallConfirmation (I7.7)', () => {
  afterEach(() => cleanup());

  it('renders nothing when pending is null', () => {
    const { container } = render(
      <PluginUninstallConfirmation
        pending={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders name + version + plugin id', () => {
    render(
      <PluginUninstallConfirmation
        pending={pending()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Format SQL')).toBeTruthy();
    expect(screen.getByText('v1.2.3')).toBeTruthy();
    expect(screen.getByText('org.example.fmt')).toBeTruthy();
  });

  it('renders the three-action consequence list', () => {
    render(
      <PluginUninstallConfirmation
        pending={pending()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/Delete the extracted bundle/i)).toBeTruthy();
    expect(screen.getByText(/Clear 2 permission grants/)).toBeTruthy();
    expect(screen.getByText(/Also delete plugin storage/)).toBeTruthy();
  });

  it('singular grant copy renders when grantCount === 1', () => {
    render(
      <PluginUninstallConfirmation
        pending={pending({ grantCount: 1 })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/Clear 1 permission grant/)).toBeTruthy();
    expect(screen.queryByText(/grants/i)).toBeNull();
  });

  it('storage checkbox hidden when storageBytes is null / undefined / zero', () => {
    const { rerender } = render(
      <PluginUninstallConfirmation
        pending={pending({ storageBytes: null })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Also delete plugin storage')).toBeNull();
    rerender(
      <PluginUninstallConfirmation
        pending={pending({ storageBytes: 0 })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Also delete plugin storage')).toBeNull();
  });

  it('storage checkbox defaults to checked (delete by default)', () => {
    render(
      <PluginUninstallConfirmation
        pending={pending()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const box = screen.getByLabelText(
      'Also delete plugin storage',
    ) as HTMLInputElement;
    expect(box.checked).toBe(true);
  });

  it('Uninstall fires onConfirm(true) when checkbox is checked', () => {
    const onConfirm = vi.fn();
    render(
      <PluginUninstallConfirmation
        pending={pending()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Uninstall$/ }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('Uninstall fires onConfirm(false) when user unchecks storage', () => {
    const onConfirm = vi.fn();
    render(
      <PluginUninstallConfirmation
        pending={pending()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const box = screen.getByLabelText(
      'Also delete plugin storage',
    ) as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /^Uninstall$/ }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('Uninstall fires onConfirm(true) when there is no storage row', () => {
    const onConfirm = vi.fn();
    render(
      <PluginUninstallConfirmation
        pending={pending({ storageBytes: null })}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Uninstall$/ }));
    // Default checkbox state stays true even when row is hidden; this
    // ensures the host receives the consistent "delete storage" signal
    // even though there's nothing to delete.
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('Cancel + X icon + Esc fire onCancel', () => {
    const onCancel = vi.fn();
    render(
      <PluginUninstallConfirmation
        pending={pending()}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel uninstall' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('busy disables all action buttons + checkbox + swaps copy', () => {
    render(
      <PluginUninstallConfirmation
        pending={pending()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        busy
      />,
    );
    const uninstall = screen.getByRole('button', { name: /Uninstalling…/ }) as HTMLButtonElement;
    expect(uninstall.disabled).toBe(true);
    const cancel = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    const xBtn = screen.getByRole('button', { name: 'Cancel uninstall' }) as HTMLButtonElement;
    expect(xBtn.disabled).toBe(true);
    const box = screen.getByLabelText('Also delete plugin storage') as HTMLInputElement;
    expect(box.disabled).toBe(true);
  });

  it('busy=true suppresses Esc cancellation', () => {
    const onCancel = vi.fn();
    render(
      <PluginUninstallConfirmation
        pending={pending()}
        onConfirm={vi.fn()}
        onCancel={onCancel}
        busy
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('error prop renders inline alert with role=alert', () => {
    render(
      <PluginUninstallConfirmation
        pending={pending()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        error="Failed to remove directory"
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Failed to remove directory',
    );
  });

  it('storage checkbox resets to checked when pending changes to different plugin', () => {
    const { rerender } = render(
      <PluginUninstallConfirmation
        pending={pending({ id: 'a' })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const box = screen.getByLabelText(
      'Also delete plugin storage',
    ) as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(false);
    rerender(
      <PluginUninstallConfirmation
        pending={pending({ id: 'b' })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const box2 = screen.getByLabelText(
      'Also delete plugin storage',
    ) as HTMLInputElement;
    expect(box2.checked).toBe(true);
  });

  it('dialog has aria-modal + aria-labelledby + aria-describedby', () => {
    render(
      <PluginUninstallConfirmation
        pending={pending()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
  });
});
