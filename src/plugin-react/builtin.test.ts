import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILTIN_NAMESPACE,
  builtinId,
  isBuiltinPlugin,
  registerBuiltin,
  unregisterBuiltin,
} from './builtin.js';
import {
  registerContributions,
  registry,
  unregisterPlugin,
} from './registry.js';

describe('internal-server pattern (built-ins as plugins)', () => {
  beforeEach(() => {
    registry.__reset();
  });
  afterEach(() => {
    registry.__reset();
  });

  describe('id discriminator', () => {
    it('builtinId composes the namespace prefix', () => {
      expect(builtinId('cell-renderers-default')).toBe(
        '@plamenix-builtin/cell-renderers-default',
      );
    });

    it('builtinId rejects empty name', () => {
      expect(() => builtinId('')).toThrow(/non-empty/);
    });

    it('builtinId rejects already-prefixed name (defends against double-prefix typos)', () => {
      expect(() => builtinId(`${BUILTIN_NAMESPACE}cell-renderers`)).toThrow(
        /must not already include/,
      );
    });

    it('isBuiltinPlugin discriminates correctly', () => {
      expect(isBuiltinPlugin('@plamenix-builtin/x')).toBe(true);
      expect(isBuiltinPlugin('dev.plamenix.hello')).toBe(false);
      expect(isBuiltinPlugin('com.example.csv-export')).toBe(false);
      expect(isBuiltinPlugin('')).toBe(false);
    });
  });

  describe('registration through the unified registry', () => {
    it('registerBuiltin produces an entry visible at the same extension point as a third-party plugin', () => {
      registerBuiltin('csv-export', {
        export_formats: [{ id: 'csv', payload: { label: 'CSV' } }],
      });
      registerContributions('com.example.parquet', {
        export_formats: [{ id: 'parquet', payload: { label: 'Parquet' } }],
      });

      const ids = registry.getContributions('export_formats').map((c) => ({
        pluginId: c.pluginId,
        id: c.contribution.id,
      }));
      expect(ids).toEqual([
        { pluginId: '@plamenix-builtin/csv-export', id: 'csv' },
        { pluginId: 'com.example.parquet', id: 'parquet' },
      ]);
    });

    it('built-in + third-party interleave by priority', () => {
      registerBuiltin('schema-actions-default', {
        schema_actions: [
          { id: 'recreate', priority: 100, payload: { label: 'RECREATE TABLE' } },
          { id: 'recompute', priority: 100, payload: { label: 'SET STATISTICS' } },
        ],
      });
      registerContributions('com.example.dba-toolbox', {
        schema_actions: [
          // Higher priority than built-ins — wants to run first.
          { id: 'audit-tap', priority: 10, payload: { label: 'Audit tap' } },
          // Lower priority — wants to run after built-ins.
          { id: 'force-write', priority: 200, payload: { label: 'Force writes' } },
        ],
      });

      const order = registry
        .getContributions('schema_actions')
        .map((c) => c.contribution.id);
      // priority-10 first, then built-ins (priority 100 — tied,
      // stable tiebreak by plugin id @plamenix-builtin < com.example),
      // then priority 200 last.
      expect(order).toEqual(['audit-tap', 'recompute', 'recreate', 'force-write']);
    });

    it('unregisterBuiltin drops every contribution under the built-in id', () => {
      registerBuiltin('csv-export', {
        export_formats: [{ id: 'csv', payload: {} }],
        commands: [{ id: 'export-as-csv', payload: {} }],
      });
      expect(registry.getContributions('export_formats')).toHaveLength(1);
      expect(registry.getContributions('commands')).toHaveLength(1);

      unregisterBuiltin('csv-export');

      expect(registry.getContributions('export_formats')).toHaveLength(0);
      expect(registry.getContributions('commands')).toHaveLength(0);
    });

    it('unregisterBuiltin leaves third-party contributions untouched', () => {
      registerBuiltin('csv-export', {
        export_formats: [{ id: 'csv', payload: {} }],
      });
      registerContributions('com.example.parquet', {
        export_formats: [{ id: 'parquet', payload: {} }],
      });

      unregisterBuiltin('csv-export');

      const remaining = registry.getContributions('export_formats');
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.pluginId).toBe('com.example.parquet');
    });

    it('registerBuiltin refuses re-registration (defends against double-init in dev)', () => {
      registerBuiltin('csv-export', {
        export_formats: [{ id: 'csv', payload: {} }],
      });
      expect(() =>
        registerBuiltin('csv-export', {
          export_formats: [{ id: 'csv', payload: {} }],
        }),
      ).toThrow(/already registered/);
    });

    it('after unregisterBuiltin, re-registration is allowed (clean re-init path)', () => {
      registerBuiltin('csv-export', {
        export_formats: [{ id: 'csv', payload: { label: 'CSV v1' } }],
      });
      unregisterBuiltin('csv-export');
      expect(() =>
        registerBuiltin('csv-export', {
          export_formats: [{ id: 'csv', payload: { label: 'CSV v2' } }],
        }),
      ).not.toThrow();
      expect(
        (registry.getContributions<{ label: string }>('export_formats')[0]?.contribution
          .payload.label),
      ).toBe('CSV v2');
    });

    it('built-ins are visible via the standard unregisterPlugin path too (full id)', () => {
      registerBuiltin('csv-export', {
        export_formats: [{ id: 'csv', payload: {} }],
      });
      // unregisterPlugin with the full prefixed id is equivalent to
      // unregisterBuiltin. Documents that built-ins are not magic in
      // the registry — they're plugins.
      unregisterPlugin('@plamenix-builtin/csv-export');
      expect(registry.getContributions('export_formats')).toHaveLength(0);
    });
  });
});
