// @vitest-environment jsdom

/**
 * The export save sink (plamenix-desktop: the Export dropdown looked
 * inert because the browser-style download it triggered was invisible
 * — no dialog, no confirmation, a file silently landing in Downloads).
 *
 * The sink is the seam: hosts register a real writer (native save
 * dialog + file write), the default stays the historical blob
 * download, and every successful export announces itself.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  notifyExportSaved,
  saveExportFile,
  setExportFileSink,
  type ExportFileSink,
} from './export-sink.js';
import { useToastStore } from '../toast/toast-store.js';

afterEach(() => {
  setExportFileSink(null);
  useToastStore.getState().clear();
  vi.restoreAllMocks();
});

describe('saveExportFile', () => {
  it('falls back to a browser download when no sink is registered', async () => {
    // The default path is the historical behaviour, pinned so hosts
    // that never register a sink (the web edition) keep working.
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL }));
    const click = vi.fn();
    const anchor = { href: '', download: '', click, remove: vi.fn() };
    const append = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      expect(tag).toBe('a');
      return anchor;
    }) as unknown as typeof document.createElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(append as never);

    const result = await saveExportFile({ filename: 'x.csv', mime: 'text/csv', contents: 'a,b' });

    expect(result).toEqual({ ok: true, path: null, canceled: false });
    expect(anchor.download).toBe('x.csv');
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    vi.unstubAllGlobals();
  });

  it('routes the request through the registered sink', async () => {
    const sink = vi
      .fn<ExportFileSink>()
      .mockResolvedValue({ ok: true, path: 'C:\\tmp\\x.csv', canceled: false });
    setExportFileSink(sink);

    const result = await saveExportFile({
      filename: 'x.csv',
      mime: 'text/csv',
      contents: 'a,b',
    });

    expect(sink).toHaveBeenCalledWith({ filename: 'x.csv', mime: 'text/csv', contents: 'a,b' });
    expect(result.path).toBe('C:\\tmp\\x.csv');
  });

  it('restores the default download when the sink is cleared', async () => {
    setExportFileSink(async () => ({ ok: false, path: null, canceled: true }));
    setExportFileSink(null);
    const createObjectURL = vi.fn(() => 'blob:fake');
    vi.stubGlobal('URL', Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    vi.spyOn(document.body, 'appendChild').mockImplementation((() => null) as never);

    const result = await saveExportFile({ filename: 'x', mime: 'text/plain', contents: 'y' });
    expect(result.ok).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('notifyExportSaved', () => {
  it('announces a saved export with the row count and destination', () => {
    useToastStore.getState().clear();
    notifyExportSaved(104, { ok: true, path: 'D:\\out\\x.csv', canceled: false }, 'x.csv');

    const toast = useToastStore
      .getState()
      .toasts.find((t) => t.kind === 'notice' && t.title.includes('x.csv'));
    expect(toast?.title).toContain('104 rows');
    expect(toast?.title).toContain('D:\\out\\x.csv');
  });

  it('falls back to the file name when the sink does not report a path', () => {
    useToastStore.getState().clear();
    notifyExportSaved(3, { ok: true, path: null, canceled: false }, 'plamenix-result.csv');

    const toast = useToastStore.getState().toasts.at(-1);
    expect(toast?.title).toContain('plamenix-result.csv');
  });

  it('stays silent when the user cancelled the save', () => {
    // Backing out of a dialog is a decision, not an event — a toast
    // would nag everyone who changed their mind.
    useToastStore.getState().clear();
    notifyExportSaved(104, { ok: false, path: null, canceled: true }, 'x.csv');
    notifyExportSaved(104, { ok: false, path: null, canceled: false }, 'x.csv');

    expect(useToastStore.getState().toasts.length).toBe(0);
  });
});
