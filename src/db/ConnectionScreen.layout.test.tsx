// @vitest-environment jsdom

/**
 * The connect screen's action bar stays on screen.
 *
 * The whole right pane used to scroll, action bar included, so at
 * ordinary window heights Connect and Save sat below the fold — the
 * screen's entire purpose, reachable only by scrolling to look for it.
 *
 * jsdom does not lay out, so this asserts the structure that produces
 * the behaviour rather than measured geometry: the pane does not scroll,
 * one region inside it does, and the actions sit outside that region as
 * a non-shrinking sibling. That is what keeps them visible at any
 * height, and it is what a careless refactor would undo.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionScreen } from './ConnectionScreen.js';
import type { ConnectionForm } from './types.js';

afterEach(cleanup);

const FORM: ConnectionForm = {
  host: '127.0.0.1',
  port: 3050,
  database: '/var/lib/firebird/data/test.fdb',
  user: 'SYSDBA',
  password: '',
  pureRust: true,
  encryptionKey: '',
  encryptionRequired: false,
  fbclientPath: '',
  charset: 'UTF8',
  embedded: false,
} as ConnectionForm;

function renderScreen() {
  return render(
    <ConnectionScreen
      form={FORM}
      profiles={[]}
      profileName=""
      profileColor={null}
      selectedProfileId={null}
      busy={false}
      error={null}
      testResult={null}
      testing={false}
      onFieldChange={vi.fn()}
      onProfileNameChange={vi.fn()}
      onProfileColorChange={vi.fn()}
      onSelectProfile={vi.fn()}
      onSaveProfile={vi.fn()}
      onDeleteProfile={vi.fn()}
      onSubmit={vi.fn()}
      onTestConnection={vi.fn()}
      onQuickConnect={vi.fn()}
    />,
  );
}

/** The nearest ancestor that scrolls, if any. */
function scrollingAncestor(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    if (/overflow-y-auto|overflow-auto|overflow-y-scroll/.test(node.className)) return node;
    node = node.parentElement;
  }
  return null;
}

describe('the connect action bar', () => {
  it('is not inside the region that scrolls', () => {
    // The bug, stated directly: it used to be, so it moved off screen.
    renderScreen();
    const connect = screen.getByRole('button', { name: /connect/i });

    expect(scrollingAncestor(connect)).toBeNull();
  });

  it('sits in a container that will not shrink', () => {
    // Without `shrink-0` a flex parent under pressure collapses it
    // rather than the fields above.
    renderScreen();
    const bar = screen.getByRole('button', { name: /connect/i }).parentElement;

    expect(bar?.className).toContain('shrink-0');
  });

  it('keeps Save beside Connect, outside the scroll region too', () => {
    renderScreen();
    const save = screen.getByRole('button', { name: /save/i });

    expect(scrollingAncestor(save)).toBeNull();
  });

  it('leaves Advanced settings with the fields, not in the bar', () => {
    // It opens a drawer of further *connection settings*, so it belongs
    // beside the connection details rather than beside Save and
    // Connect. It scrolls with them, which is fine — what must not
    // scroll away is the pair that commits the form.
    renderScreen();
    const advanced = screen.getByRole('button', { name: /advanced settings/i });
    const bar = screen.getByRole('button', { name: /^connect$/i }).parentElement;

    expect(scrollingAncestor(advanced)).not.toBeNull();
    expect(bar?.contains(advanced)).toBe(false);
  });

  it('keeps only Save and Connect in the pinned bar', () => {
    // The bar is for committing the form. Anything else in it competes
    // with the two actions that matter.
    renderScreen();
    const bar = screen.getByRole('button', { name: /^connect$/i }).parentElement;
    const labels = [...(bar?.querySelectorAll('button') ?? [])].map((b) =>
      (b.textContent ?? '').trim(),
    );

    expect(labels).toEqual(['Save', 'Connect']);
  });

  it('still scrolls the fields', () => {
    // The fields genuinely can overflow — the point is that they are
    // what scrolls, not the actions.
    renderScreen();
    const host = screen.getByDisplayValue('127.0.0.1');

    expect(scrollingAncestor(host)).not.toBeNull();
  });
});
