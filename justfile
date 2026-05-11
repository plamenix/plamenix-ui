# @plamenix/ui command runner.

# Show available recipes when invoked with no arguments.
default:
    @just --list

# Install dependencies (pnpm).
install:
    pnpm install

# Build the library: ES modules + type declarations.
build:
    pnpm build

# Watch and rebuild on file changes.
dev:
    pnpm dev

# TypeScript type-check without emitting.
typecheck:
    pnpm typecheck

# Run the test suite.
test:
    pnpm test

# Run tests in watch mode.
test-watch:
    pnpm test:watch

# Format every file with Prettier.
fmt:
    pnpm fmt

# Verify Prettier formatting without modifying files.
fmt-check:
    pnpm fmt:check

# Lint with ESLint.
lint:
    pnpm lint

# Run the full local CI pipeline.
all: fmt-check lint typecheck test build

# Remove build artifacts and dependency caches.
clean:
    rm -rf dist node_modules .vite coverage
