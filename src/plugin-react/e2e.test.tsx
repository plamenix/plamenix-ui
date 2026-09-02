// @vitest-environment jsdom

/**
 * End-to-end smoke for the React-plugin path.
 *
 * Walks from a serialised plugin bundle (the ESM text a plugin author
 * would `vite build` into `dist/ui.mjs`) all the way through:
 *
 *   bundle text
 *     → `loadPluginUiFromBytes` (the primitive both editions consume)
 *       → registry (singleton)
 *         → `<PluginOutlet>` slot consumer
 *           → React render → real DOM
 *
 * Earlier tests cover each layer in isolation (loader.test.tsx,
 * PluginOutlet.test.tsx, registry round-trip). This file proves they
 * compose, which is the closing contract for Section I2 — both edition
 * integrations call into exactly this chain. The desktop edition
 * wraps the chain by reading bytes from disk via a Tauri command and
 * passing them to `loadPluginUiFromBytes`; the web edition wraps the
 * chain by serving the bytes from `GET /api/plugins/:id/ui.mjs` and
 * either `import(url)` directly via `loadPluginUi` or fetching the
 * body and calling `loadPluginUiFromBytes`. The host wrappers
 * themselves are I4 work (they land alongside the first real React
 * plugin); the SDK contract this test exercises is the contract those
 * wrappers will compose against.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createPluginAPI } from './api.js';
import { loadPluginUi, loadPluginUiFromBytes } from './loader.js';
import { PluginOutlet } from './PluginOutlet.js';
import { registry } from './registry.js';
import type { PluginAPI } from './types.js';

function silentApi(pluginId: string): PluginAPI {
  return createPluginAPI(pluginId, {
    log: () => {},
    notify: () => {},
    invokeCommand: async () => null,
    getSetting: async () => null,
    setSetting: async () => {},
    subscribe: () => ({ dispose: () => {} }),
  });
}

/**
 * Realistic plugin bundle text — closely mirrors what a plugin
 * author's `vite build` would emit (minified or not). The payload is
 * plain data so the test does not depend on React being available
 * inside the dynamic-imported module scope; the host's `render` prop
 * is what produces JSX from the payload, exercising the agreed
 * payload-only contract.
 */
const PLUGIN_BUNDLE = `
export default {
  contributions: {
    sidebar_panels: [
      {
        id: 'hello-from-plugin',
        priority: 10,
        payload: {
          label: 'PLUGIN-RENDERED PANEL',
          icon: 'sparkles',
        }
      }
    ]
  },
  async activate(api) {
    // Plugin code echoes its pluginId through the host log so the
    // test can prove the activate() path ran with the bound API.
    api.log('info', 'activated ' + api.pluginId);
  }
};
`;

describe('end-to-end: bundle bytes → loader → PluginOutlet → DOM', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    cleanup();
    registry.__reset();
  });

  it('desktop path: loadPluginUiFromBytes → PluginOutlet renders plugin payload', async () => {
    const captured: string[] = [];
    const api = createPluginAPI('plg.e2e.desktop', {
      log: (_pluginId, _level, message) => {
        captured.push(message);
      },
      notify: () => {},
      invokeCommand: async () => null,
      getSetting: async () => null,
      setSetting: async () => {},
      subscribe: () => ({ dispose: () => {} }),
    });

    await loadPluginUiFromBytes('plg.e2e.desktop', PLUGIN_BUNDLE, api);

    // activate() ran with the bound API.
    expect(captured).toEqual(['activated plg.e2e.desktop']);

    render(
      <PluginOutlet<{ label: string; icon: string }>
        point="sidebar_panels"
        render={({ pluginId, contribution }) => (
          <div data-testid="panel" data-plugin-id={pluginId} data-icon={contribution.payload.icon}>
            {contribution.payload.label}
          </div>
        )}
      />,
    );

    const panel = screen.getByTestId('panel');
    expect(panel.textContent).toBe('PLUGIN-RENDERED PANEL');
    expect(panel.getAttribute('data-plugin-id')).toBe('plg.e2e.desktop');
    expect(panel.getAttribute('data-icon')).toBe('sparkles');
  });

  it('web path: loadPluginUi with a data: URL (simulating /api/plugins/:id/ui.mjs response) → PluginOutlet renders', async () => {
    // The web edition serves the bundle from `GET /api/plugins/:id/ui.mjs`
    // and the React client dynamic-imports that URL. jsdom under
    // vitest cannot import server-relative URLs, but the loader's
    // contract is "give me any URL the JS runtime can import" — a
    // data: URL satisfies that contract identically. Real production
    // would pass `/api/plugins/:id/ui.mjs?v=<hash>` here instead.
    const dataUrl = `data:text/javascript;base64,${btoa(unescape(encodeURIComponent(PLUGIN_BUNDLE)))}`;

    await loadPluginUi('plg.e2e.web', dataUrl, silentApi('plg.e2e.web'));

    render(
      <PluginOutlet<{ label: string }>
        point="sidebar_panels"
        render={({ contribution }) => (
          <span data-testid="web-panel">{contribution.payload.label}</span>
        )}
      />,
    );

    expect(screen.getByTestId('web-panel').textContent).toBe('PLUGIN-RENDERED PANEL');
  });

  it('two plugins targeting the same point on the same edition merge and render in priority order', async () => {
    const bundleA = `
      export default {
        contributions: {
          sidebar_panels: [
            { id: 'second', priority: 200, payload: { label: 'SECOND' } }
          ]
        }
      };
    `;
    const bundleB = `
      export default {
        contributions: {
          sidebar_panels: [
            { id: 'first', priority: 10, payload: { label: 'FIRST' } }
          ]
        }
      };
    `;

    await loadPluginUiFromBytes('plg.alpha', bundleA, silentApi('plg.alpha'));
    await loadPluginUiFromBytes('plg.beta', bundleB, silentApi('plg.beta'));

    render(
      <PluginOutlet<{ label: string }>
        point="sidebar_panels"
        render={({ contribution }) => (
          <div data-testid={`panel-${contribution.id}`}>{contribution.payload.label}</div>
        )}
      />,
    );

    const all = screen.getAllByTestId(/^panel-/);
    expect(all.map((n) => n.textContent)).toEqual(['FIRST', 'SECOND']);
  });
});
