// @vitest-environment jsdom

/**
 * `copyText`, and the reason it exists.
 *
 * Every shipped copy button was written as
 * `void navigator.clipboard.writeText(t).catch(() => {})`, which looks
 * guarded and is not: in an insecure context `navigator.clipboard` is
 * `undefined`, so reading `.writeText` throws synchronously and there is
 * no promise for `.catch` to attach to. The web edition's ordinary
 * deployment is `http://<lan-ip>`, so that was every copy button on that
 * edition raising a TypeError out of a React event handler.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Replaces `navigator.clipboard`, including removing it entirely —
 *  which is the insecure-context case and the one that crashed. */
function stubClipboard(value: unknown): void {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value,
    configurable: true,
    writable: true,
  });
}

describe('copyText', () => {
  it('uses the clipboard API when there is one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });

    await expect(copyText('CUSTOMERS.ID')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('CUSTOMERS.ID');
  });

  it('does not throw when the clipboard API is absent', async () => {
    // The bug, stated directly. `undefined.writeText` threw before any
    // promise existed, so the `.catch` at every call site was decoration.
    stubClipboard(undefined);
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });

    await expect(copyText('ORDERS')).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('falls back when the clipboard API rejects', async () => {
    // Permission refused, or the document was not focused. The legacy
    // route sometimes still works, so a rejection is not the end.
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(true),
      configurable: true,
    });

    await expect(copyText('X')).resolves.toBe(true);
  });

  it('reports failure rather than throwing when neither route works', async () => {
    // Callers show the user something. Silently doing nothing is the
    // one behaviour worse than an error.
    stubClipboard(undefined);
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });

    await expect(copyText('X')).resolves.toBe(false);
  });

  it('leaves the user’s own selection intact', async () => {
    // The fallback selects a textarea to copy from. Copying a column
    // name should not clear the text the user had highlighted.
    stubClipboard(undefined);
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(true),
      configurable: true,
    });
    const host = document.createElement('p');
    host.textContent = 'the user had this selected';
    document.body.appendChild(host);
    const range = document.createRange();
    range.selectNodeContents(host);
    document.getSelection()?.addRange(range);

    await copyText('CUSTOMERS');

    expect(document.getSelection()?.toString()).toBe('the user had this selected');
    host.remove();
  });

  it('removes its scratch textarea', async () => {
    stubClipboard(undefined);
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(true),
      configurable: true,
    });

    await copyText('X');

    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});
