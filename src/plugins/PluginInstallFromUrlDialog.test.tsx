// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  PluginInstallFromUrlDialog,
  isValidPluginUrl,
} from './PluginInstallFromUrlDialog.js';

describe('isValidPluginUrl (I7.6)', () => {
  it('accepts http + https URLs', () => {
    expect(isValidPluginUrl('https://example.com/plugin.plx')).toBe(true);
    expect(isValidPluginUrl('http://localhost:8080/p.plx')).toBe(true);
  });

  it('rejects file://, javascript:, and bare strings', () => {
    expect(isValidPluginUrl('file:///etc/passwd')).toBe(false);
    expect(isValidPluginUrl('javascript:alert(1)')).toBe(false);
    expect(isValidPluginUrl('not a url')).toBe(false);
  });

  it('rejects empty + whitespace-only', () => {
    expect(isValidPluginUrl('')).toBe(false);
    expect(isValidPluginUrl('   ')).toBe(false);
  });
});

describe('PluginInstallFromUrlDialog (I7.6)', () => {
  afterEach(() => cleanup());

  it('renders nothing when open is false', () => {
    const { container } = render(
      <PluginInstallFromUrlDialog
        open={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders heading + input + buttons when open', () => {
    render(
      <PluginInstallFromUrlDialog
        open
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Install plugin from URL')).toBeTruthy();
    expect(screen.getByPlaceholderText('https://example.com/plugin.plx')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Fetch \+ validate/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('pre-fills the URL input from initialUrl', () => {
    render(
      <PluginInstallFromUrlDialog
        open
        initialUrl="https://example.com/p.plx"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText(
      'https://example.com/plugin.plx',
    ) as HTMLInputElement;
    expect(input.value).toBe('https://example.com/p.plx');
  });

  it('Fetch button disabled when input is empty or invalid', () => {
    render(
      <PluginInstallFromUrlDialog
        open
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const fetch = screen.getByRole('button', { name: /Fetch \+ validate/ }) as HTMLButtonElement;
    expect(fetch.disabled).toBe(true);
    const input = screen.getByPlaceholderText('https://example.com/plugin.plx');
    fireEvent.change(input, { target: { value: 'not-a-url' } });
    expect(fetch.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'https://example.com/p.plx' } });
    expect(fetch.disabled).toBe(false);
  });

  it('Fetch button click fires onSubmit with the trimmed URL', () => {
    const onSubmit = vi.fn();
    render(
      <PluginInstallFromUrlDialog
        open
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText('https://example.com/plugin.plx');
    fireEvent.change(input, {
      target: { value: '  https://example.com/p.plx  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Fetch \+ validate/ }));
    expect(onSubmit).toHaveBeenCalledWith('https://example.com/p.plx');
  });

  it('Form submit (Enter) fires onSubmit when URL is valid', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <PluginInstallFromUrlDialog
        open
        initialUrl="https://example.com/p.plx"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('Form submit is a no-op when URL is invalid', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <PluginInstallFromUrlDialog
        open
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    const form = container.querySelector('form');
    fireEvent.submit(form!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Cancel button + X icon + Esc fire onCancel', () => {
    const onCancel = vi.fn();
    render(
      <PluginInstallFromUrlDialog
        open
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel install' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('busy flag disables input + buttons + swaps button copy to Fetching…', () => {
    render(
      <PluginInstallFromUrlDialog
        open
        busy
        initialUrl="https://example.com/p.plx"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText(
      'https://example.com/plugin.plx',
    ) as HTMLInputElement;
    expect(input.disabled).toBe(true);
    const fetch = screen.getByRole('button', { name: /Fetching…/ }) as HTMLButtonElement;
    expect(fetch.disabled).toBe(true);
    const cancel = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
  });

  it('renders inline error with role=alert', () => {
    render(
      <PluginInstallFromUrlDialog
        open
        error="Server returned 404"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Server returned 404');
  });

  it('input gets aria-invalid + aria-describedby when error is present', () => {
    render(
      <PluginInstallFromUrlDialog
        open
        error="boom"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText('https://example.com/plugin.plx');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('resets input when dialog reopens with a different initialUrl', () => {
    const { rerender } = render(
      <PluginInstallFromUrlDialog
        open={false}
        initialUrl="https://a.example/p.plx"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    rerender(
      <PluginInstallFromUrlDialog
        open
        initialUrl="https://a.example/p.plx"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText(
      'https://example.com/plugin.plx',
    ) as HTMLInputElement;
    expect(input.value).toBe('https://a.example/p.plx');
    // Close + reopen with different URL.
    rerender(
      <PluginInstallFromUrlDialog
        open={false}
        initialUrl="https://b.example/p.plx"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    rerender(
      <PluginInstallFromUrlDialog
        open
        initialUrl="https://b.example/p.plx"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input2 = screen.getByPlaceholderText(
      'https://example.com/plugin.plx',
    ) as HTMLInputElement;
    expect(input2.value).toBe('https://b.example/p.plx');
  });
});
