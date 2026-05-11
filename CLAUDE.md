# @plamenix/ui

Shared React library consumed by both Plamenix editions. This `CLAUDE.md`
loads on demand when work happens inside this repo. Global Plamenix
conventions live in the parent workspace `CLAUDE.md`; this file only
covers concerns specific to this repository.

## What lives here

- `src/transport/` — the `Transport` interface and `TransportError`
  class. The single boundary between this library and its host runtime.
- More modules accrete here as concrete consumers (`plamenix-desktop`,
  `plamenix-web`) need shared shapes. Components, hooks, and stores are
  added in the PR that first needs them, not pre-scaffolded.

## What does not live here

- Edition-specific code. Nothing in this library may import from
  `@tauri-apps/*` or call `fetch()` directly. Host interaction goes
  through `Transport`.
- The Tauri-backed and HTTP-backed `Transport` implementations live in
  `plamenix-desktop` and `plamenix-web` respectively.
- Plugin host code (wasmtime, WIT). The plugin runtime lives in
  `plamenix-core`; this library only consumes plugin UI contributions.

## Build commands

```sh
just build         # vite build && tsc --noEmit
just dev           # vite build --watch
just typecheck     # tsc --noEmit
just test          # vitest run
just fmt           # prettier --write .
just fmt-check     # prettier --check .
just lint          # eslint .
just all           # fmt-check + lint + typecheck + test + build
```

Package manager is **pnpm**. Lockfile is `pnpm-lock.yaml`. Do not commit
`package-lock.json` or `yarn.lock`.

## Code style

- Functions and hooks over classes. Compose with children-as-prop slots
  and render functions; avoid HOCs and decorators.
- Local state with `useState`. Shared state with Zustand (when added),
  never React Context for non-trivial data.
- Server state with TanStack Query (when added). Query keys include the
  active tab identifier where applicable.
- React Testing Library for component tests. Query by role, label, and
  text. Reserve `data-testid` for last-resort cases.
- No `any`. Use `unknown` plus a type guard. No non-null assertions
  (`!`). No untyped event handlers.
- Type-only imports: `import type { Foo } from '...'`. Enforced by
  ESLint.
- Comments explain *why*, never *what*. Identifiers carry the *what*.
- No `console.*` in shipping code (lint warns). Use a logger primitive
  once one exists.

## Public API discipline

- Every exported symbol earns a JSDoc summary, plus parameter and return
  descriptions when non-trivial. `@example` blocks when usage is
  non-obvious.
- Re-exports go through `src/index.ts`. Adding a new public symbol means
  editing `src/index.ts` as part of the same PR.
- Type-only exports use `export type`. Value exports use `export`.
- The library is ESM-only. Do not add CJS shims, `"main"` fallbacks, or
  conditional exports beyond `import` + `types`.

## Tech stack pins

- React **19**, ReactDOM **19** (peer dependencies).
- TypeScript **6.0** strict mode + `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`.
- Vite **8** library mode with `vite-plugin-dts` for type declarations.
- Vitest **4** for unit and component tests.
- ESLint **9** flat config with `@typescript-eslint/strict`,
  `react-hooks`, `react-refresh`.
- Prettier **3**, 100-character line width, single quotes, trailing
  commas everywhere.

## Things to ask before doing

- Adding a new runtime dependency: each entry costs bundle size for
  every downstream consumer. Prefer adapting an existing peer
  (`react`, future Zustand/TanStack Query/Lucide) before adding a new
  dependency.
- Adding a non-React peer dependency: must be required by an exported
  component or hook. Internal-only deps belong in `devDependencies`.
- Adding a new top-level folder under `src/`: confirm there is no
  existing folder that fits. Avoid hierarchy growth for sub-1000-LOC
  modules.
- Splitting `@plamenix/ui` into multiple packages (`@plamenix/types`,
  `@plamenix/plugin-react`, etc.): defer until a concrete need forces
  the split, then convert to a pnpm workspace.
