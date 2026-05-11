# Contributing to @plamenix/ui

This file covers concerns specific to the shared React library. Global
project conventions (branching, commit style, licence, code of conduct)
live in the meta-workspace
[`plamenix/CONTRIBUTING.md`](../plamenix/CONTRIBUTING.md).

## Prerequisites

- Node **24 LTS** (also tested against 26)
- [pnpm](https://pnpm.io/) **9** or newer
- [`just`](https://github.com/casey/just) command runner

## Setup

```sh
cd plamenix-ui
pnpm install
```

This installs build, lint, format, and test toolchains. Runtime
dependencies are minimal at this stage — React is a peer dependency.

## Build, test, lint

```sh
just build         # vite build && tsc --noEmit
just dev           # vite build --watch
just typecheck     # tsc --noEmit
just test          # vitest run
just fmt           # prettier --write .
just fmt-check     # prettier --check .
just lint          # eslint .
just all           # full local CI pipeline
```

CI runs `just all`. Open a PR with every check green.

## Code style

- Use the existing ESLint and Prettier configurations. Do not add
  per-file rule overrides without justification in the commit message.
- Prefer `function` declarations for React components. Reserve arrow
  functions for inline callbacks.
- Prefer hooks over higher-order components. Compose with
  children-as-prop slots and render functions.
- React Testing Library for component tests. Query by role, label, and
  text. Avoid `data-testid` unless no semantic selector applies.
- Type-only imports use `import type`. Enforced by ESLint.

## Adding a public export

1. Implement the symbol in a feature folder under `src/`.
2. Add the JSDoc block: summary line, parameter and return descriptions
   when non-trivial, an `@example` when usage is non-obvious.
3. Re-export from `src/index.ts`. Type-only symbols use `export type`.
4. Add a unit or component test. Tests live next to the implementation
   in a `*.test.ts` or `*.test.tsx` file.
5. Note the addition in the PR description; semantic-version impact
   matters for downstream consumers.

## Adding a runtime dependency

Runtime dependencies appear in every consumer's bundle. Adding one
requires:

- A clear justification in the commit message (one short line).
- Confirmation that no existing dependency or peer provides the same
  capability.
- A check that the package supports ESM-only consumption.

Internal-only tools (build, lint, test) live in `devDependencies` and
do not affect downstream bundle size.

## Module format

`@plamenix/ui` is published as **ESM only**. Do not add CJS shims, a
legacy `"main"` field, or conditional exports beyond the existing
`import` + `types` entries. Consumers (Vite-built desktop and web
editions) import the package directly.

## Tests

- Unit tests live next to the code, in `*.test.ts` files.
- Component tests use React Testing Library and live in `*.test.tsx`
  files next to the component.
- Avoid snapshot tests unless the rendered output is intentionally
  stable and the alternative is significantly more brittle.

## Licence

By contributing you agree your changes are dual-licensed under
**MIT OR Apache-2.0**.
