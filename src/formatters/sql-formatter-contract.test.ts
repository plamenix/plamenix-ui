import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  pickSqlFormatter,
  pluginContributionsToSqlFormatters,
  type SqlFormatterContributionPayload,
} from './sql-formatter-contract.js';
import { registry, registerContributions } from '../plugin-react/registry.js';

const noop = (sql: string) => sql;

function descriptors(dialect: string) {
  return pluginContributionsToSqlFormatters(
    registry.getContributions<SqlFormatterContributionPayload>('sql_formatters'),
    dialect,
  );
}

describe('pluginContributionsToSqlFormatters (I5.6)', () => {
  beforeEach(() => registry.__reset());
  afterEach(() => registry.__reset());

  it('filters by dialect — exact match + `all` wildcard surface, others drop', () => {
    registerContributions('com.example.multi', {
      sql_formatters: [
        {
          id: 'firebird-only',
          payload: { label: 'F', dialect: 'firebird', format: noop } satisfies SqlFormatterContributionPayload,
        },
        {
          id: 'pgsql-only',
          payload: { label: 'P', dialect: 'pgsql', format: noop },
        },
        {
          id: 'universal',
          payload: { label: 'U', dialect: 'all', format: noop },
        },
      ],
    });
    expect(descriptors('firebird').map((d) => d.label).sort()).toEqual(['F', 'U']);
    expect(descriptors('pgsql').map((d) => d.label).sort()).toEqual(['P', 'U']);
    expect(descriptors('mysql').map((d) => d.label)).toEqual(['U']);
  });

  it('descriptor id namespaces by pluginId + contribution id', () => {
    registerContributions('com.example.ns', {
      sql_formatters: [
        { id: 'pretty', payload: { label: 'P', dialect: 'all', format: noop } },
      ],
    });
    const [d] = descriptors('firebird');
    expect(d?.id).toBe('com.example.ns:pretty');
    expect(d?.pluginId).toBe('com.example.ns');
  });

  it('respects registry priority order (lower wins)', () => {
    registerContributions('com.example.late', {
      sql_formatters: [
        {
          id: 'late',
          priority: 300,
          payload: { label: 'Late', dialect: 'firebird', format: noop },
        },
      ],
    });
    registerContributions('com.example.early', {
      sql_formatters: [
        {
          id: 'early',
          priority: 50,
          payload: { label: 'Early', dialect: 'firebird', format: noop },
        },
      ],
    });
    expect(descriptors('firebird').map((d) => d.label)).toEqual(['Early', 'Late']);
  });

  it('descriptor.format carries the payload callback through', () => {
    const fn = (sql: string) => sql.toUpperCase();
    registerContributions('com.example.fn', {
      sql_formatters: [
        { id: 'upper', payload: { label: 'U', dialect: 'all', format: fn } },
      ],
    });
    const [d] = descriptors('firebird');
    expect(d?.format('select 1')).toBe('SELECT 1');
  });

  describe('pickSqlFormatter', () => {
    it('returns the highest-priority matching formatter', () => {
      registerContributions('com.example.pick', {
        sql_formatters: [
          {
            id: 'a',
            priority: 100,
            payload: { label: 'A', dialect: 'firebird', format: noop },
          },
          {
            id: 'b',
            priority: 50,
            payload: { label: 'B', dialect: 'firebird', format: noop },
          },
        ],
      });
      const picked = pickSqlFormatter(
        registry.getContributions<SqlFormatterContributionPayload>('sql_formatters'),
        'firebird',
      );
      expect(picked?.label).toBe('B');
    });

    it('returns null when nothing applies', () => {
      const picked = pickSqlFormatter(
        registry.getContributions<SqlFormatterContributionPayload>('sql_formatters'),
        'firebird',
      );
      expect(picked).toBeNull();
    });
  });
});
