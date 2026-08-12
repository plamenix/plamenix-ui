/**
 * Built-in contributions, and the reason they moved.
 *
 * They used to register from inside the components that consume them,
 * which made a feature's availability depend on an unrelated component
 * being mounted — and because `unregisterBuiltin` is not refcounted, it
 * made *unmounting* one consumer withdraw the contribution from every
 * other.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { registerAllBuiltins } from './builtins.js';
import { registry } from './plugin-react/registry.js';

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
});

function idsFor(slot: string): string[] {
  return registry
    .getContributions(slot as Parameters<typeof registry.getContributions>[0])
    .map((c) => c.id);
}

describe('registerAllBuiltins', () => {
  it('registers the SQL formatter, which is what the Format button gates on', () => {
    // The visible symptom that started this. `QueryPanel` renders the
    // button only when an applicable formatter is registered, and the
    // desktop shell registered it from `RoutineObjectView` — a
    // component that mounts only while a stored procedure is open, i.e.
    // the one place the text is read-only.
    expect(idsFor('sql_formatters')).toHaveLength(0);
    dispose = registerAllBuiltins();
    expect(idsFor('sql_formatters').length).toBeGreaterThan(0);
  });

  it('registers all five export formats', () => {
    // These came from the result grid, so they went away with it.
    dispose = registerAllBuiltins();
    expect(idsFor('export_formats').length).toBeGreaterThanOrEqual(5);
  });

  it('registers the password auth provider', () => {
    // This one came from the connect screen, so it was withdrawn the
    // moment the user connected and that screen unmounted.
    dispose = registerAllBuiltins();
    expect(idsFor('auth_providers').length).toBeGreaterThan(0);
  });

  it('refuses a second registration rather than silently doubling', () => {
    // The registry throws on a duplicate plugin id. Recording it
    // because it is the crash the old arrangement carried: two
    // components both registered the SQL formatter, so a shell that
    // mounted `DdlViewerModal` and `RoutineObjectView` together would
    // have thrown. Neither shell happened to, which is why it never
    // surfaced.
    dispose = registerAllBuiltins();
    expect(() => registerAllBuiltins()).toThrow(/already registered/);
  });

  it('can be torn down and registered again', () => {
    // What React's StrictMode does to an effect on mount: run, clean
    // up, run again. A registration that could not survive that would
    // break every development build.
    const first = registerAllBuiltins();
    first();
    dispose = registerAllBuiltins();
    expect(idsFor('sql_formatters').length).toBeGreaterThan(0);
  });

  it('withdraws everything it registered', () => {
    const teardown = registerAllBuiltins();
    expect(idsFor('sql_formatters').length).toBeGreaterThan(0);
    teardown();
    expect(idsFor('sql_formatters')).toHaveLength(0);
    expect(idsFor('export_formats')).toHaveLength(0);
  });
});
