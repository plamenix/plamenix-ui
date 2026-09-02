/**
 * Every icon this library names must exist in the lucide the shells
 * actually load.
 *
 * `@plamenix/ui` is consumed as a build with `lucide-react` left
 * external, so the version the library compiled against and the version
 * a shell resolves are two different things. They had drifted a major
 * apart — the library on `0.460`, both shells on `1.14` — and lucide
 * dropped its brand icons in 1.x.
 *
 * The result was the worst shape a break can take: `pnpm build` passed,
 * `tsc` passed, every test passed, and the app opened to a blank window
 * with `SyntaxError: Importing binding name 'Github' is not found` in a
 * console nobody had open. A named ESM import that does not resolve is
 * a module-load failure, so it takes the whole render tree down rather
 * than the one component that asked for it.
 *
 * This resolves the icons the way a shell does and fails in CI instead.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as lucide from 'lucide-react';

/** Every `import { … } from 'lucide-react'` name under `src/`. */
function iconsNamedInSource(dir = 'src'): Set<string> {
  const found = new Set<string>();
  const walk = (path: string): void => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const source = readFileSync(full, 'utf8');
      const pattern = /import\s*\{([^}]*)\}\s*from\s*'lucide-react'/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        for (const raw of (match[1] ?? '').split(',')) {
          // `Plug as PluginsIcon` — the import name is what has to exist.
          const name = raw.trim().split(' as ')[0]?.trim();
          if (name && /^[A-Z]/.test(name)) found.add(name);
        }
      }
    }
  };
  walk(dir);
  return found;
}

describe('lucide icons', () => {
  it('names at least a hundred, so a broken scan cannot pass quietly', () => {
    // Guards the guard: a regex that stopped matching would otherwise
    // turn this file green and useless.
    expect(iconsNamedInSource().size).toBeGreaterThan(100);
  });

  it('every one of them exists in the installed lucide', () => {
    const missing = [...iconsNamedInSource()].filter((name) => !(name in lucide));
    expect(missing, `lucide has no export for: ${missing.join(', ')}`).toEqual([]);
  });
});
