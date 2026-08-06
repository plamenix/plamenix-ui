// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  SCHEMA_ACTION_APPLIED,
  SCHEMA_DESCRIBED,
  diffAndEmitSchemaEvents,
  emitSchemaActionApplied,
  emitSchemaDescribed,
  useEmitSchemaEvents,
  type SchemaActionAppliedPayload,
  type SchemaDescribedPayload,
  type SchemaSnapshot,
} from './schema-events.js';
import { eventBus } from './event-bus.js';
import { useTabsStore } from '../db/tabs-store.js';
import type { Schema } from '../db/types.js';

const buildSchema = (overrides: Partial<Schema> = {}): Schema => ({
  tables: [],
  procedures: [],
  triggers: [],
  generators: [],
  domains: [],
  ...overrides,
});

const snap = (id: string, schema: Schema | null, sessionId: string | null = 's1'): SchemaSnapshot => ({
  id,
  sessionId,
  schema,
});

describe('schema-events topic constants (I6.8)', () => {
  it('exposes the two expected topic literals', () => {
    expect(SCHEMA_DESCRIBED).toBe('schema/described');
    expect(SCHEMA_ACTION_APPLIED).toBe('schema/action-applied');
  });
});

describe('diffAndEmitSchemaEvents (I6.8)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => eventBus.__reset());

  it('emits schema/described when a tab gains a non-null schema', () => {
    const handler = vi.fn();
    eventBus.subscribe<SchemaDescribedPayload>('p', SCHEMA_DESCRIBED, handler);
    const schema = buildSchema({
      tables: [{ name: 'T1', kind: 'table', columns: [] }, { name: 'T2', kind: 'table', columns: [] }],
      procedures: [{ name: 'P1', params: [] }],
    } as unknown as Partial<Schema>);
    const count = diffAndEmitSchemaEvents([snap('a', null)], [snap('a', schema)]);
    expect(count).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]?.[1] as SchemaDescribedPayload;
    expect(payload.tabId).toBe('a');
    expect(payload.tableCount).toBe(2);
    expect(payload.procedureCount).toBe(1);
    expect(payload.triggerCount).toBe(0);
    expect(payload.generatorCount).toBe(0);
    expect(payload.domainCount).toBe(0);
  });

  it('emits schema/described when schema reference is replaced (re-describe)', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', SCHEMA_DESCRIBED, handler);
    const a = buildSchema({ tables: [{ name: 'T1', kind: 'table', columns: [] }] as unknown as Schema['tables'] });
    const b = buildSchema({
      tables: [
        { name: 'T1', kind: 'table', columns: [] },
        { name: 'T2', kind: 'table', columns: [] },
      ] as unknown as Schema['tables'],
    });
    diffAndEmitSchemaEvents([snap('x', a)], [snap('x', b)]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as SchemaDescribedPayload).tableCount).toBe(2);
  });

  it('does NOT re-emit when the same schema reference is observed twice', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', SCHEMA_DESCRIBED, handler);
    const s = buildSchema();
    diffAndEmitSchemaEvents([snap('x', s)], [snap('x', s)]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does NOT emit for tabs whose schema stays null', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', SCHEMA_DESCRIBED, handler);
    diffAndEmitSchemaEvents([snap('x', null)], [snap('x', null)]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('walks multiple tabs in one diff', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', SCHEMA_DESCRIBED, handler);
    const s1 = buildSchema();
    const s2 = buildSchema();
    diffAndEmitSchemaEvents(
      [snap('a', null), snap('b', null)],
      [snap('a', s1), snap('b', s2)],
    );
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('uses the supplied now() for timestamps (deterministic)', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', SCHEMA_DESCRIBED, handler);
    diffAndEmitSchemaEvents([snap('x', null)], [snap('x', buildSchema())], () => 7777);
    expect((handler.mock.calls[0]?.[1] as SchemaDescribedPayload).describedAt).toBe(7777);
  });
});

describe('emitSchemaActionApplied (I6.8)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => eventBus.__reset());

  it('dispatches to subscribers of schema/action-applied', () => {
    const handler = vi.fn();
    eventBus.subscribe<SchemaActionAppliedPayload>('p', SCHEMA_ACTION_APPLIED, handler);
    const payload: SchemaActionAppliedPayload = {
      tabId: 't1',
      sessionId: 's1',
      kind: 'table',
      action: 'drop',
      targetName: 'CUSTOMERS',
      ddl: 'DROP TABLE CUSTOMERS',
      appliedAt: 1234,
    };
    emitSchemaActionApplied(payload);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[1]).toEqual(payload);
  });

  it('accepts null ddl for non-DDL actions (e.g. next-value)', () => {
    const handler = vi.fn();
    eventBus.subscribe<SchemaActionAppliedPayload>('p', SCHEMA_ACTION_APPLIED, handler);
    emitSchemaActionApplied({
      tabId: 't1',
      sessionId: 's1',
      kind: 'generator',
      action: 'next-value',
      targetName: 'GEN_CUSTOMER_ID',
      ddl: null,
      appliedAt: 1,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[1] as SchemaActionAppliedPayload).ddl).toBeNull();
  });

  it('wildcard subscriber `schema/*` sees both events', () => {
    const handler = vi.fn();
    eventBus.subscribe('p', 'schema/*', handler);
    emitSchemaDescribed({
      tabId: 't', sessionId: 's', tableCount: 0, procedureCount: 0,
      triggerCount: 0, generatorCount: 0, domainCount: 0, describedAt: 1,
    });
    emitSchemaActionApplied({
      tabId: 't', sessionId: 's', kind: 'table', action: 'drop',
      targetName: 'T', ddl: 'DROP TABLE T', appliedAt: 2,
    });
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('useEmitSchemaEvents (I6.8)', () => {
  beforeEach(() => eventBus.__reset());
  afterEach(() => {
    cleanup();
    eventBus.__reset();
    // Reset schema on every tab so subsequent tests start clean.
    useTabsStore.setState((state) => ({
      ...state,
      tabs: state.tabs.map((t) => ({ ...t, schema: null })),
    }));
  });

  it('emits schema/described when patchTab assigns a schema', () => {
    const handler = vi.fn();
    eventBus.subscribe<SchemaDescribedPayload>('p', SCHEMA_DESCRIBED, handler);
    renderHook(() => useEmitSchemaEvents());
    const id = useTabsStore.getState().activeTabId;
    const before = handler.mock.calls.length;
    act(() => {
      useTabsStore.getState().patchTab(id, { schema: buildSchema({
        tables: [{ name: 'T', kind: 'table', columns: [] }] as unknown as Schema['tables'],
      }) });
    });
    expect(handler.mock.calls.length).toBeGreaterThan(before);
    const payload = handler.mock.calls[handler.mock.calls.length - 1]?.[1] as SchemaDescribedPayload;
    expect(payload.tabId).toBe(id);
    expect(payload.tableCount).toBe(1);
  });
});
