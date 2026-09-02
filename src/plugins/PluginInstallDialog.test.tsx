// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PluginInstallDialog, type PendingPluginInstall } from './PluginInstallDialog.js';

const pending = (overrides: Partial<PendingPluginInstall> = {}): PendingPluginInstall => ({
  id: 'org.example.fmt',
  name: 'Format SQL',
  version: '1.2.3',
  description: 'Formats SQL via sqlfluff.',
  publisher: 'Example, Inc.',
  requiredPermissions: ['contributions.sql_formatters'],
  optionalPermissions: ['network.fetch', 'fs.read'],
  ...overrides,
});

describe('PluginInstallDialog (I7.1)', () => {
  afterEach(() => cleanup());

  it('renders nothing when pending is null', () => {
    const { container } = render(
      <PluginInstallDialog pending={null} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders plugin metadata + identity dl', () => {
    render(<PluginInstallDialog pending={pending()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Format SQL')).toBeTruthy();
    expect(screen.getByText(/v1\.2\.3/)).toBeTruthy();
    expect(screen.getByText('org.example.fmt')).toBeTruthy();
    expect(screen.getByText('Example, Inc.')).toBeTruthy();
    expect(screen.getByText(/Formats SQL/)).toBeTruthy();
  });

  it('renders required permissions as a batch + warning panel', () => {
    render(
      <PluginInstallDialog
        pending={pending({
          requiredPermissions: ['db.read', 'fs.write'],
        })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Required permissions')).toBeTruthy();
    expect(screen.getByText('db.read')).toBeTruthy();
    expect(screen.getByText('fs.write')).toBeTruthy();
    expect(screen.getByText(/grants every permission in this batch/i)).toBeTruthy();
  });

  it('renders empty-state message when no required permissions', () => {
    render(
      <PluginInstallDialog
        pending={pending({ requiredPermissions: [] })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText('Required permissions')).toBeNull();
    expect(screen.getByText(/does not declare any required permissions/i)).toBeTruthy();
  });

  it('optional permissions section is collapsed by default + expands on click', () => {
    render(<PluginInstallDialog pending={pending()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: /Optional permissions/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('does not render optional section when none declared', () => {
    render(
      <PluginInstallDialog
        pending={pending({ optionalPermissions: [] })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Optional permissions/ })).toBeNull();
  });

  it('selected-count badge updates as user toggles checkboxes', () => {
    render(<PluginInstallDialog pending={pending()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: /Optional permissions/i });
    expect(screen.getByText('0/2 selected')).toBeTruthy();
    fireEvent.click(toggle);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(checkboxes[0]!);
    expect(screen.getByText('1/2 selected')).toBeTruthy();
    fireEvent.click(checkboxes[1]!);
    expect(screen.getByText('2/2 selected')).toBeTruthy();
    // Toggle back off.
    fireEvent.click(checkboxes[0]!);
    expect(screen.getByText('1/2 selected')).toBeTruthy();
  });

  it('fires onConfirm with plugin id + empty optional set when nothing selected', () => {
    const onConfirm = vi.fn();
    render(<PluginInstallDialog pending={pending()} onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Install/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('org.example.fmt', []);
  });

  it('fires onConfirm with chosen optional subset', () => {
    const onConfirm = vi.fn();
    render(<PluginInstallDialog pending={pending()} onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Optional permissions/i }));
    const [first] = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(first!);
    fireEvent.click(screen.getByRole('button', { name: /Install/ }));
    expect(onConfirm).toHaveBeenCalledWith('org.example.fmt', ['network.fetch']);
  });

  it('fires onCancel on Cancel button + X icon + Esc', () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <PluginInstallDialog pending={pending()} onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    rerender(<PluginInstallDialog pending={pending()} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel install' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('resets optional selection when pending plugin changes', () => {
    const { rerender } = render(
      <PluginInstallDialog
        pending={pending({ id: 'a', optionalPermissions: ['net'] })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Optional permissions/i }));
    const [box] = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(box!);
    expect(screen.getByText('1/1 selected')).toBeTruthy();
    // Different plugin id => reset.
    rerender(
      <PluginInstallDialog
        pending={pending({ id: 'b', optionalPermissions: ['net'] })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('0/1 selected')).toBeTruthy();
  });

  it('dialog carries aria-modal + aria-labelledby + aria-describedby', () => {
    render(<PluginInstallDialog pending={pending()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('renders "No description provided" when description is missing', () => {
    render(
      <PluginInstallDialog
        pending={pending({ description: null })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/No description provided/i)).toBeTruthy();
  });

  it('hides Publisher row when publisher is missing', () => {
    render(
      <PluginInstallDialog
        pending={pending({ publisher: null })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText('Publisher')).toBeNull();
  });
});

describe('PluginInstallDialog — signature banner (I7.16)', () => {
  afterEach(() => cleanup());

  it('hides the signature banner when signature is undefined', () => {
    render(<PluginInstallDialog pending={pending()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText('Signature verified')).toBeNull();
    expect(screen.queryByText('Unsigned plugin')).toBeNull();
    expect(screen.queryByText('Signature invalid')).toBeNull();
  });

  it('renders the signed banner with public key hex + key id', () => {
    render(
      <PluginInstallDialog
        pending={pending({
          signature: {
            status: 'selfSigned',
            publicKeyHex: 'a'.repeat(64),
            keyId: 'ci-bot',
          },
        })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/publisher not verified/i)).toBeTruthy();
    expect(screen.getByText(/key: aaaa/)).toBeTruthy();
    expect(screen.getByText('id: ci-bot')).toBeTruthy();
    // The badge must not claim the publisher was checked — the signing
    // key ships inside the archive.
    expect(screen.queryByText('Signature verified')).toBeNull();
  });

  it('renders the signed banner without a key id row when keyId is undefined', () => {
    render(
      <PluginInstallDialog
        pending={pending({
          signature: {
            status: 'selfSigned',
            publicKeyHex: 'b'.repeat(64),
          },
        })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/publisher not verified/i)).toBeTruthy();
    expect(screen.queryByText(/^id:/)).toBeNull();
  });

  it('renders red unsigned banner with role=alert', () => {
    render(
      <PluginInstallDialog
        pending={pending({ signature: { status: 'unsigned' } })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Unsigned plugin')).toBeTruthy();
    expect(screen.getByRole('alert', { name: 'Plugin is unsigned' })).toBeTruthy();
  });

  it('renders amber invalid banner with reason + role=alert', () => {
    render(
      <PluginInstallDialog
        pending={pending({
          signature: { status: 'invalid', reason: 'cryptographic verify failed' },
        })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Signature invalid')).toBeTruthy();
    expect(screen.getByText('cryptographic verify failed')).toBeTruthy();
    expect(screen.getByRole('alert', { name: 'Signature invalid' })).toBeTruthy();
  });
});
