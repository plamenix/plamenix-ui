# @plamenix/ui/plugin-react

React SDK for [Plamenix](https://plamenix.dev) plugins. Provides the
public surface both **plugin authors** (writing the React half of a
plugin) and **host integrators** (mounting plugin contributions in a
Plamenix shell) consume.

```ts
// Plugin author — the default export of `src/ui.tsx` (the source
// that `plamenix build` compiles into the `ui.mjs` member of your
// `.plx` bundle).
import type {
  PluginUiModule,
  PluginContributions,
} from '@plamenix/ui/plugin-react';

const plugin: PluginUiModule = {
  contributions: {
    sidebar_panels: [
      {
        id: 'hello',
        priority: 50,
        payload: { label: 'Hello', icon: 'sparkles' },
        render: () => <HelloPanel />,
      },
    ],
  },
};

export default plugin;
```

```tsx
// Host integrator — wraps plugin subtrees + mounts contributions.
import {
  PluginAPIProvider,
  PluginOutlet,
  createPluginAPI,
  loadPluginUi,
} from '@plamenix/ui/plugin-react';

const api = createPluginAPI({ /* host-supplied bindings */ });

<PluginAPIProvider api={api}>
  <Sidebar>
    <PluginOutlet point="sidebar_panels" />
  </Sidebar>
</PluginAPIProvider>;
```

For the full author walkthrough (scaffold → build → sign → install)
see the [first-plugin tutorial](https://github.com/plamenix/plamenix/blob/main/docs/tutorial-first-plugin.md)
in the meta-workspace.

## Public surface

### Types — what your `PluginUiModule` looks like

| Export | Source | Use it when |
|---|---|---|
| `PluginUiModule` | `types.ts` | Type the default export of your `ui.tsx`. |
| `PluginContributions` | `types.ts` | Shape of the `contributions` field. |
| `Contribution` | `types.ts` | One entry inside any contribution array. |
| `ExtensionPoint` | `types.ts` | Literal-union of the 14 contribution-point names. |
| `ContributionRenderer` | `types.ts` | Render function for a contribution. |
| `PluginComponent` | `types.ts` | Plugin-supplied React component type. |
| `PluginPermissionDenied` | `types.ts` | Throw from a host binding to signal a denied capability call. |

### Host bindings — what the host wires into the API

| Export | Source | Use it when |
|---|---|---|
| `PluginAPI` | `types.ts` | The full API surface plugins consume via `usePluginAPI()`. |
| `PluginHostBindings` | `types.ts` | What the host implements + passes into `createPluginAPI`. |
| `Disposable` | `types.ts` | Returned by event subscriptions; call `.dispose()` to unregister. |
| `EventHandler` | `types.ts` | Topic-handler signature for `bus.subscribe(...)`. |
| `LogLevel` / `NotifyLevel` | `types.ts` | Strings the log + toast APIs accept. |

### Outlet — mounting contributions in your shell

| Export | Source | Use it when |
|---|---|---|
| `PluginOutlet` | `PluginOutlet.tsx` | Renders every registered contribution for one `ExtensionPoint`. |
| `PluginOutletProps` | `PluginOutlet.tsx` | Prop type for the outlet. |

### Provider + hook — letting plugin components talk to the host

| Export | Source | Use it when |
|---|---|---|
| `PluginAPIProvider` | `usePluginAPI.tsx` | Wrap any subtree that renders plugin contributions. |
| `usePluginAPI` | `usePluginAPI.tsx` | Inside a plugin component to call host bindings. |
| `createPluginAPI` | `api.ts` | Build the API the provider takes. |
| `unwiredBindings` | `api.ts` | Default bindings that throw `PluginPermissionDenied` for every call (use in tests OR as a baseline a host extends). |

### Loader — lifecycle management

| Export | Source | Use it when |
|---|---|---|
| `loadPluginUi(pluginId, module)` | `loader.ts` | Register a parsed `PluginUiModule` at runtime. |
| `loadPluginUiFromBytes(pluginId, bytes)` | `loader.ts` | Dynamic-import a `ui.mjs` from raw bytes (used by the web edition's `/api/plugins/:id/ui.mjs` route). |
| `reloadPluginUi(pluginId, module)` | `loader.ts` | Replace a plugin's contributions in place. |
| `unloadPluginUi(pluginId, module)` | `loader.ts` | Run the plugin's `deactivate` hook + unregister contributions. |
| `mergeContributions(a, b)` | `loader.ts` | Combine two `PluginContributions` payloads. |
| `LoadOptions` | `loader.ts` | Optional behavior flags for `loadPluginUi`. |

### Registry — low-level contribution introspection

The registry is the process-wide store of every registered
contribution. Most consumers use the higher-level `usePluginContributions`
hook below; the raw API is exposed for debugging + power use cases.

| Export | Source | Use it when |
|---|---|---|
| `registerContributions(pluginId, contributions)` | `registry.ts` | Direct register (loader uses this under the hood). |
| `unregisterPlugin(pluginId)` | `registry.ts` | Drop every contribution for one plugin. |
| `registry` | `registry.ts` | Singleton process-wide registry instance. |
| `InternalContribution` | `registry.ts` | The wrapped shape stored inside the registry. |
| `usePluginContributions(point)` | `usePluginContributions.ts` | Subscribe a React component to a contribution point. |
| `PluginContribution` | `usePluginContributions.ts` | One entry returned by the hook. |

### Built-ins — the host's own contributions

Plamenix ships built-in contributions (DBA toolbox schema actions,
default cell renderers, default sidebar panels) through the same
registry. These helpers let host integrators register them under a
reserved `builtin.*` namespace so user-installed plugins can't
shadow them.

| Export | Source | Use it when |
|---|---|---|
| `BUILTIN_NAMESPACE` | `builtin.ts` | The reserved id prefix (`"builtin.<feature>"`). |
| `builtinId(feature)` | `builtin.ts` | Build a built-in contribution id. |
| `isBuiltinPlugin(pluginId)` | `builtin.ts` | True when an id starts with `BUILTIN_NAMESPACE`. |
| `registerBuiltin(...)` | `builtin.ts` | Same as `registerContributions` but namespaced. |
| `unregisterBuiltin(feature)` | `builtin.ts` | Drop a built-in. |

## Contribution-point shape

See [contribution-points.md](https://github.com/plamenix/plamenix/blob/main/docs/contribution-points.md)
for the full table of 14 contribution points. Quick reference:

```ts
type ExtensionPoint =
  | 'sidebar_panels'         // Left sidebar tabs.
  | 'object_inspectors'      // Right-pane tabs in TableObjectView.
  | 'cell_renderers'         // Custom cell render functions.
  | 'sql_formatters'         // SQL formatter providers.
  | 'commands'               // Command-palette entries.
  | 'menus'                  // Context-menu items.
  | 'toolbar_buttons'        // Top-of-tab + StatusBar + TabStrip buttons.
  | 'schema_actions'         // Schema-browser context-menu actions.
  | 'auth_providers'         // Auth flows in the connection screen.
  | 'themes'                 // Visual themes.
  | 'settings_panels'        // Settings page sections.
  | 'dashboard_sections'     // Stats / welcome dashboard cards.
  | 'status_bar_items'       // Bottom status bar entries.
  | 'completion_providers'   // CodeMirror SQL autocomplete sources.
  | 'diagnostics_providers'  // Inline editor diagnostics.
  | 'import_sources';        // Import wizard sources.
```

Each contribution carries a `priority: number` (lower runs first) +
a `payload: Payload` shape specific to the extension point. The
`ContributionRenderer` returns React elements; the host's outlet
walks priorities in ascending order.

## Lifecycle reference

```text
loadPluginUi(id, module)
  └──> registry.register(id, contributions)
       └──> usePluginContributions(point) returns the new entries.

unloadPluginUi(id, module)
  ├──> module.deactivate?.()
  └──> registry.unregister(id)
       └──> usePluginContributions(point) re-renders without them.

reloadPluginUi(id, module)
  ├──> unloadPluginUi(id, previousModule)
  └──> loadPluginUi(id, nextModule)
```

The host's `Supervisor` (Rust side) drives these calls; plugin
authors don't invoke them directly.

## TypeScript + bundle layout

- **ESM only.** No CJS shims, no `"main"` fallbacks.
- **Type declarations** ship in `dist/plugin-react/index.d.ts` and
  are referenced via `package.json`'s `exports` field's `types`
  condition. Editors that follow the standard ESM resolution see
  every type out of the box.
- **Tree-shakable.** Every named export comes from a side-effect-free
  module + the consumer's bundler drops unused exports.

## TypeDoc

A full TypeDoc site is deferred to M2. The IDE-rendered `.d.ts`
declarations + this README cover the M1 reference surface. The
deferred TypeDoc build will add:

- Cross-file navigation (jump from `PluginOutlet` to `PluginAPI`).
- Versioned API history.
- A search-indexed static site under `dist/docs/`.

## Versioning

The package version tracks the host's contribution-point schema. A
breaking change to any `ExtensionPoint` payload bumps the major
version. Plugin authors should pin to `^1.0.0-beta` until the host's
schema stabilises post-M1.

## License

Dual-licensed under MIT or Apache-2.0. See the repository root for
the full text.
