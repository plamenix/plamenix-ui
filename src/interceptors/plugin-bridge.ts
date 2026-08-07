/**
 * Puts WASM plugins into the interceptor chains.
 *
 * The chains here have been tested for a while, and every one of those
 * tests passed against a build where no plugin could reach them: the
 * WIT contract had no interceptor export, so first-party handlers were
 * the only handlers there could be. The host end of the bridge now
 * exists (`plamenix_plugin_host::interceptor`); this is the renderer
 * end.
 *
 * ## Why one handler per chain rather than one per plugin
 *
 * A plugin's registration carries a priority, and it would be tempting
 * to register each plugin as its own handler at that priority so the
 * host's chain interleaves plugins with built-ins. That is wrong for
 * this codebase: every plugin call is a round trip across the transport
 * (Tauri `invoke` or an HTTP request), so N plugins would cost N round
 * trips inside a 500ms budget that also has to cover the built-ins.
 *
 * Instead the host runs the whole plugin segment in one call, applying
 * the same chain semantics on its side, and this registers one handler
 * per chain to carry the result back. Plugins therefore run as a group,
 * after the built-ins by default, which is what the reserved priority
 * band already implies: `docs/plugin-interceptors.md` reserves 0..99
 * for first-party interceptors and confines plugins to 100 and above,
 * so no plugin can be scheduled before a built-in anyway.
 *
 * The one case this cannot express is a plugin interleaved *between*
 * two built-ins. Nothing needs that today, and the alternative costs a
 * round trip per plugin on every keystroke-adjacent operation.
 */

import type { InterceptorChain, InterceptorRegistration } from './chain.js';
import { queryExecutingChain } from './query-executing.js';
import { cellCommittingChain } from './cell-committing.js';
import { rowInsertingChain } from './row-inserting.js';
import { rowDeletingChain } from './row-deleting.js';
import { connectionOpeningChain } from './connection-opening.js';
import { exportStartingChain } from './export-starting.js';
import { editorSavingChain } from './editor-saving.js';
import { schemaActionApplyingChain } from './schema-action-applying.js';

/** The extension points a plugin may register for. Mirrors
 *  `plamenix_plugin_host::interceptor::ExtensionPoint`. */
export type ExtensionPoint =
  | 'query.executing'
  | 'cell.committing'
  | 'row.inserting'
  | 'row.deleting'
  | 'connection.opening'
  | 'export.starting'
  | 'editor.saving'
  | 'schema.action-applying';

/** What the host reports back after running the plugin segment. */
export interface PluginInterceptorOutcome {
  verdict:
    | { action: 'proceed' }
    | { action: 'replace'; contextJson: string }
    | { action: 'cancel'; reason: string };
  /** Plugins that trapped, overran, or refused without a reason. They
   *  were skipped and the operation proceeds; reported so a broken
   *  plugin can be named rather than silently ignored. */
  skipped: Array<{ pluginId: string; reason: string }>;
}

/** The two calls the bridge needs from whichever shell installs it.
 *  Both editions implement these over their own transport. */
export interface PluginInterceptorTransport {
  /** Which chains have at least one plugin registered. */
  listInterceptors(): Promise<Array<{ extensionPoint: ExtensionPoint }>>;
  /** Runs the plugin segment of one chain. */
  runInterceptors(
    extensionPoint: ExtensionPoint,
    contextJson: string,
  ): Promise<PluginInterceptorOutcome>;
}

/** Options for {@link installPluginInterceptors}. */
export interface InstallPluginInterceptorsOptions {
  /** Where skipped-plugin notices go. Defaults to `console.warn`.
   *  Fail-open should be visible: a plugin quietly not running is how
   *  a policy gate stops being a policy gate. */
  onSkipped?: (pluginId: string, reason: string) => void;
}

const CHAINS: Record<ExtensionPoint, InterceptorChain<never>> = {
  'query.executing': queryExecutingChain as unknown as InterceptorChain<never>,
  'cell.committing': cellCommittingChain as unknown as InterceptorChain<never>,
  'row.inserting': rowInsertingChain as unknown as InterceptorChain<never>,
  'row.deleting': rowDeletingChain as unknown as InterceptorChain<never>,
  'connection.opening':
    connectionOpeningChain as unknown as InterceptorChain<never>,
  'export.starting': exportStartingChain as unknown as InterceptorChain<never>,
  'editor.saving': editorSavingChain as unknown as InterceptorChain<never>,
  'schema.action-applying':
    schemaActionApplyingChain as unknown as InterceptorChain<never>,
};

/**
 * Registers a plugin handler on every chain that has plugins waiting.
 *
 * Returns a disposable that unregisters all of them, so a shell can
 * re-install after plugins are reloaded without accumulating handlers.
 *
 * Chains with no registered plugin get no handler at all: a chain that
 * nobody contributes to must not pay a round trip on every operation
 * it guards, and `query.executing` guards every statement the user
 * runs.
 */
export async function installPluginInterceptors(
  transport: PluginInterceptorTransport,
  options: InstallPluginInterceptorsOptions = {},
): Promise<{ dispose(): void }> {
  const onSkipped =
    options.onSkipped ??
    ((pluginId: string, reason: string) => {
      // eslint-disable-next-line no-console
      console.warn(`Interceptor skipped for ${pluginId}: ${reason}`);
    });

  const registrations = await transport.listInterceptors();
  const points = new Set<ExtensionPoint>(
    registrations.map((entry) => entry.extensionPoint),
  );

  const installed: InterceptorRegistration[] = [];
  for (const point of points) {
    const chain = CHAINS[point];
    if (!chain) {
      // A host that knows about a point this build does not. Skipping
      // beats throwing: the rest of the chains should still work.
      onSkipped('(host)', `unknown extension point '${point}'`);
      continue;
    }
    installed.push(
      chain.use(async (ctx) => {
        const outcome = await transport.runInterceptors(
          point,
          JSON.stringify(ctx),
        );
        for (const skip of outcome.skipped) {
          onSkipped(skip.pluginId, skip.reason);
        }
        switch (outcome.verdict.action) {
          case 'cancel':
            return { action: 'cancel', reason: outcome.verdict.reason };
          case 'replace':
            return {
              action: 'replace',
              ctx: JSON.parse(outcome.verdict.contextJson) as never,
              reason: 'rewritten by a plugin',
            };
          default:
            return { action: 'continue' };
        }
      }),
    );
  }

  return {
    dispose() {
      for (const registration of installed) {
        registration.dispose();
      }
    },
  };
}
