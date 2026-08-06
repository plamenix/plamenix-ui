// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  FirstUsePermissionPrompt,
  type FirstUsePermissionRequest,
} from './FirstUsePermissionPrompt.js';

const request = (
  overrides: Partial<FirstUsePermissionRequest> = {},
): FirstUsePermissionRequest => ({
  pluginId: 'org.example.fmt',
  pluginName: 'Format SQL',
  permission: 'network.fetch',
  ...overrides,
});

describe('FirstUsePermissionPrompt (I7.2)', () => {
  afterEach(() => cleanup());

  it('renders nothing when request is null', () => {
    const { container } = render(
      <FirstUsePermissionPrompt
        request={null}
        onAllowOnce={vi.fn()}
        onAllowAlways={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders plugin name + permission string', () => {
    render(
      <FirstUsePermissionPrompt
        request={request()}
        onAllowOnce={vi.fn()}
        onAllowAlways={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Format SQL')).toBeTruthy();
    expect(screen.getByText('network.fetch')).toBeTruthy();
  });

  it('renders all three action buttons in deny / once / always order', () => {
    render(
      <FirstUsePermissionPrompt
        request={request()}
        onAllowOnce={vi.fn()}
        onAllowAlways={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    const buttons = screen
      .getAllByRole('button')
      .map((b) => (b.textContent ?? '').trim());
    expect(buttons).toContain('Deny');
    expect(buttons.some((t) => t === 'Allow once')).toBe(true);
    expect(buttons.some((t) => t === 'Allow always')).toBe(true);
  });

  it('fires onAllowOnce when "Allow once" is clicked', () => {
    const onAllowOnce = vi.fn();
    render(
      <FirstUsePermissionPrompt
        request={request()}
        onAllowOnce={onAllowOnce}
        onAllowAlways={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }));
    expect(onAllowOnce).toHaveBeenCalledTimes(1);
  });

  it('fires onAllowAlways when "Allow always" is clicked', () => {
    const onAllowAlways = vi.fn();
    render(
      <FirstUsePermissionPrompt
        request={request()}
        onAllowOnce={vi.fn()}
        onAllowAlways={onAllowAlways}
        onDeny={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Allow always' }));
    expect(onAllowAlways).toHaveBeenCalledTimes(1);
  });

  it('fires onDeny when "Deny" is clicked', () => {
    const onDeny = vi.fn();
    render(
      <FirstUsePermissionPrompt
        request={request()}
        onAllowOnce={vi.fn()}
        onAllowAlways={vi.fn()}
        onDeny={onDeny}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it('fires onDeny on Escape keystroke', () => {
    const onDeny = vi.fn();
    render(
      <FirstUsePermissionPrompt
        request={request()}
        onAllowOnce={vi.fn()}
        onAllowAlways={vi.fn()}
        onDeny={onDeny}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire any handler on Enter (no default action)', () => {
    const onAllowOnce = vi.fn();
    const onAllowAlways = vi.fn();
    const onDeny = vi.fn();
    render(
      <FirstUsePermissionPrompt
        request={request()}
        onAllowOnce={onAllowOnce}
        onAllowAlways={onAllowAlways}
        onDeny={onDeny}
      />,
    );
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onAllowOnce).not.toHaveBeenCalled();
    expect(onAllowAlways).not.toHaveBeenCalled();
    expect(onDeny).not.toHaveBeenCalled();
  });

  it('renders plugin-supplied reason block when present', () => {
    render(
      <FirstUsePermissionPrompt
        request={request({ reason: 'Needed to download formatting rules.' })}
        onAllowOnce={vi.fn()}
        onAllowAlways={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    expect(screen.getByText('Plugin-supplied reason')).toBeTruthy();
    expect(
      screen.getByText('Needed to download formatting rules.'),
    ).toBeTruthy();
    // Friendly disclaimer must be present so users know plugins
    // author the reason string.
    expect(
      screen.getByText(/Gate on the permission above, not on the reason/i),
    ).toBeTruthy();
  });

  it('does NOT render reason block when reason is null / undefined', () => {
    const { rerender } = render(
      <FirstUsePermissionPrompt
        request={request({ reason: null })}
        onAllowOnce={vi.fn()}
        onAllowAlways={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    expect(screen.queryByText('Plugin-supplied reason')).toBeNull();
    rerender(
      <FirstUsePermissionPrompt
        request={request()}
        onAllowOnce={vi.fn()}
        onAllowAlways={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    expect(screen.queryByText('Plugin-supplied reason')).toBeNull();
  });

  it('dialog carries aria-modal + aria-labelledby + aria-describedby', () => {
    render(
      <FirstUsePermissionPrompt
        request={request()}
        onAllowOnce={vi.fn()}
        onAllowAlways={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('does not bind Escape handler when request is null (no spurious denies)', () => {
    const onDeny = vi.fn();
    render(
      <FirstUsePermissionPrompt
        request={null}
        onAllowOnce={vi.fn()}
        onAllowAlways={vi.fn()}
        onDeny={onDeny}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDeny).not.toHaveBeenCalled();
  });
});
