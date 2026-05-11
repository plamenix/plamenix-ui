# @plamenix/ui

Shared React library for the [Plamenix](../plamenix/) Firebird IDE.
Consumed by both editions:

- `plamenix-desktop` — Tauri 2 desktop application
- `plamenix-web` — Fastify + React web edition

The library is **transport-agnostic**: every host interaction passes
through a `Transport` implementation provided by the consuming edition.
The library itself imports nothing edition-specific.

## Status

Bootstrap scaffold. The public surface exports the `Transport` interface
and a `TransportError` class. React components, hooks, and stores
accrete here as the desktop and web editions begin consuming this
package; nothing is pre-scaffolded.

## Build

```sh
pnpm install
pnpm build         # writes dist/index.mjs and dist/index.d.ts
pnpm dev           # rebuild on file changes
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm lint          # eslint .
pnpm fmt           # prettier --write .
pnpm fmt:check     # prettier --check .
```

Or via `just` (recipes wrap the same commands):

```sh
just build
just dev
just test
just lint
just fmt
just all
```

## Module format

ESM-only. `package.json` declares `"type": "module"` and a single
`"exports"` entry resolving to `dist/index.mjs` with matching
`dist/index.d.ts` types. Consumers (Vite-built desktop and web editions)
import directly without a CJS shim.

## Tech stack

- React **19** (peer dependency)
- TypeScript **6** (strict mode, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`)
- Vite **8** library mode (Rolldown bundler)
- Vitest **4** for unit and component tests
- ESLint **9** (flat config), Prettier **3**

## Licence

Dual-licensed under **MIT OR Apache-2.0**. See [`LICENSE-MIT`](./LICENSE-MIT)
and [`LICENSE-APACHE`](./LICENSE-APACHE).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for build, test, and lint
specifics. Global workspace conventions live in
[`plamenix/CONTRIBUTING.md`](../plamenix/CONTRIBUTING.md).
