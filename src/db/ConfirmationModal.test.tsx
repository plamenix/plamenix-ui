// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmationModal, type PendingConfirmation } from './ConfirmationModal.js';

const sample = (overrides: Partial<PendingConfirmation> = {}): PendingConfirmation => ({
  title: 'Confirm action',
  message: 'Are you sure?',
  confirmLabel: 'Yes',
  cancelLabel: 'No',
  severity: 'danger',
  ...overrides,
});

describe('ConfirmationModal (subtask E)', () => {
  afterEach(() => cleanup());

  it('renders nothing when request is null', () => {
    const { container } = render(
      <ConfirmationModal request={null} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title + message + labels from request', () => {
    render(
      <ConfirmationModal
        request={sample({ title: 'Drop CUSTOMERS?', message: 'Cannot be undone.' })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Drop CUSTOMERS?')).toBeTruthy();
    expect(screen.getByText('Cannot be undone.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'No' })).toBeTruthy();
  });

  it('fires onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationModal request={sample()} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmationModal request={sample()} onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel on Escape', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmationModal request={sample()} onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fires onConfirm on Enter (no input focused)', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationModal request={sample()} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('applies danger styling (red confirm button) for severity=danger', () => {
    render(
      <ConfirmationModal
        request={sample({ severity: 'danger' })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Yes' });
    expect(confirm.className).toMatch(/bg-red-/);
  });

  it('applies warn styling (amber confirm button) for severity=warn', () => {
    render(
      <ConfirmationModal
        request={sample({ severity: 'warn' })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Yes' });
    expect(confirm.className).toMatch(/bg-amber-/);
  });

  it('dialog has aria-modal + labelledby for screen-reader support', () => {
    render(
      <ConfirmationModal request={sample()} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
  });
});
