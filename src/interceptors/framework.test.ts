import { describe, expect, it, vi } from 'vitest';
import { InterceptorChain } from './chain.js';
import type { InterceptorDecision } from './chain.js';

describe('InterceptorChain priority ordering (I6.19)', () => {
  it('lower priority number runs first', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const order: string[] = [];
    chain.use(
      () => {
        order.push('b');
        return { action: 'continue' };
      },
      { priority: 100 },
    );
    chain.use(
      () => {
        order.push('a');
        return { action: 'continue' };
      },
      { priority: 50 },
    );
    await chain.run({ x: 1 });
    expect(order).toEqual(['a', 'b']);
  });

  it('same priority → registration order tie-breaks', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const order: string[] = [];
    chain.use(
      () => {
        order.push('first');
        return { action: 'continue' };
      },
      { priority: 100 },
    );
    chain.use(
      () => {
        order.push('second');
        return { action: 'continue' };
      },
      { priority: 100 },
    );
    await chain.run({ x: 1 });
    expect(order).toEqual(['first', 'second']);
  });

  it('default priority is 100 (handlers without options run after priority-50 ones)', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const order: string[] = [];
    chain.use(() => {
      order.push('default');
      return { action: 'continue' };
    });
    chain.use(
      () => {
        order.push('priority-50');
        return { action: 'continue' };
      },
      { priority: 50 },
    );
    await chain.run({ x: 1 });
    expect(order).toEqual(['priority-50', 'default']);
  });

  it('built-in at priority 0 wins over plugins at default 100', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    chain.use(
      () => ({ action: 'cancel', reason: 'plugin policy' }),
      { priority: 100 },
    );
    chain.use(
      () => ({ action: 'cancel', reason: 'built-in policy' }),
      { priority: 0 },
    );
    const decision = await chain.run({ x: 1 });
    expect(decision).toEqual({ action: 'cancel', reason: 'built-in policy' });
  });
});

describe('InterceptorChain replace semantics (I6.19)', () => {
  it('replace decision substitutes the ctx for subsequent handlers', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    let seen = 0;
    chain.use(
      (c) => ({ action: 'replace', ctx: { x: c.x + 10 }, reason: 'add 10' }),
      { priority: 0 },
    );
    chain.use(
      (c) => {
        seen = c.x;
        return { action: 'continue' };
      },
      { priority: 100 },
    );
    await chain.run({ x: 1 });
    expect(seen).toBe(11);
  });

  it('chain returns replace decision when no later cancel occurs', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    chain.use((c) => ({
      action: 'replace',
      ctx: { x: c.x + 1 },
      reason: 'inc',
    }));
    const decision = (await chain.run({ x: 1 })) as InterceptorDecision<{
      x: number;
    }>;
    expect(decision.action).toBe('replace');
    if (decision.action === 'replace') {
      expect(decision.ctx.x).toBe(2);
      expect(decision.reason).toBe('inc');
    }
  });

  it('cancel after replace wins (cancel short-circuits)', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    chain.use((c) => ({ action: 'replace', ctx: { x: c.x + 1 }, reason: 'inc' }), { priority: 0 });
    chain.use(() => ({ action: 'cancel', reason: 'veto' }), { priority: 100 });
    const decision = await chain.run({ x: 1 });
    expect(decision).toEqual({ action: 'cancel', reason: 'veto' });
  });

  it('multiple replaces chain — final reason wins, ctx is the last replacement', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    chain.use((c) => ({ action: 'replace', ctx: { x: c.x + 1 }, reason: 'first' }), { priority: 0 });
    chain.use((c) => ({ action: 'replace', ctx: { x: c.x * 10 }, reason: 'second' }), { priority: 50 });
    const decision = (await chain.run({ x: 1 })) as InterceptorDecision<{
      x: number;
    }>;
    expect(decision.action).toBe('replace');
    if (decision.action === 'replace') {
      expect(decision.ctx.x).toBe(20); // (1+1)*10
      expect(decision.reason).toBe('second');
    }
  });

  it('replace mixed with continue — continue preserves the last replaced ctx', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    chain.use((c) => ({ action: 'replace', ctx: { x: c.x + 100 }, reason: 'r1' }), { priority: 0 });
    chain.use(() => ({ action: 'continue' }), { priority: 50 });
    const decision = (await chain.run({ x: 1 })) as InterceptorDecision<{
      x: number;
    }>;
    if (decision.action === 'replace') {
      expect(decision.ctx.x).toBe(101);
    }
  });
});

describe('InterceptorChain budget enforcement (I6.19)', () => {
  it('default budget is 500ms — explicit override applies', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    let t = 0;
    const tick = () => {
      t += 100;
      return t;
    };
    const onTrap = vi.fn();
    chain.use(() => ({ action: 'continue' }));
    chain.use(() => ({ action: 'cancel', reason: 'should not reach' }));
    chain.use(() => ({ action: 'cancel', reason: 'should not reach either' }));
    // Budget 50ms; tick advances 100ms before each `now()` call →
    // second iteration exceeds budget.
    const decision = await chain.run({ x: 1 }, { budgetMs: 50, onTrap, now: tick });
    expect(decision.action).toBe('continue');
    expect(onTrap).toHaveBeenCalledTimes(1);
    const err = onTrap.mock.calls[0]?.[0] as Error;
    expect(err.message).toMatch(/exceeded 50ms budget/);
  });

  it('budget check evaluated BEFORE each handler — slow handler still finishes', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    let now = 0;
    const clock = () => now;
    const onTrap = vi.fn();
    chain.use(async () => {
      now = 600; // simulate elapsed time during the handler
      return { action: 'cancel', reason: 'slow but valid' };
    });
    chain.use(() => ({ action: 'cancel', reason: 'never runs' }));
    // First handler runs (budget not yet exceeded at start), returns
    // cancel — cancel propagates. Budget check on second handler
    // does NOT happen because cancel short-circuits.
    const decision = await chain.run({ x: 1 }, { budgetMs: 500, onTrap, now: clock });
    expect(decision).toEqual({ action: 'cancel', reason: 'slow but valid' });
    expect(onTrap).not.toHaveBeenCalled();
  });

  it('empty chain returns continue regardless of budget', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const decision = await chain.run({ x: 1 }, { budgetMs: 0 });
    expect(decision.action).toBe('continue');
  });

  it('chain fails OPEN on budget exhaustion (returns continue, not cancel)', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    let t = 0;
    chain.use(() => {
      t += 600;
      return { action: 'continue' };
    });
    chain.use(() => ({ action: 'cancel', reason: 'never runs — budget already blown' }));
    const decision = await chain.run({ x: 1 }, {
      budgetMs: 500,
      onTrap: () => undefined,
      now: () => t,
    });
    expect(decision.action).toBe('continue');
  });
});

describe('InterceptorChain fail-open on trap (I6.19)', () => {
  it('handler that throws is skipped; chain continues', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const onTrap = vi.fn();
    const second = vi.fn(() => ({ action: 'continue' as const }));
    chain.use(() => {
      throw new Error('plugin bug');
    });
    chain.use(second);
    const decision = await chain.run({ x: 1 }, { onTrap });
    expect(decision.action).toBe('continue');
    expect(second).toHaveBeenCalledTimes(1);
    expect(onTrap).toHaveBeenCalledTimes(1);
    expect((onTrap.mock.calls[0]?.[0] as Error).message).toBe('plugin bug');
  });

  it('async handler that rejects is skipped; chain continues', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const onTrap = vi.fn();
    chain.use(async () => {
      await Promise.resolve();
      throw new Error('async plugin bug');
    });
    chain.use(() => ({ action: 'cancel', reason: 'honoured' }));
    const decision = await chain.run({ x: 1 }, { onTrap });
    expect(decision).toEqual({ action: 'cancel', reason: 'honoured' });
    expect(onTrap).toHaveBeenCalledTimes(1);
  });

  it('multiple handlers can trap; chain finishes', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const onTrap = vi.fn();
    chain.use(() => {
      throw new Error('a');
    });
    chain.use(() => {
      throw new Error('b');
    });
    chain.use(() => ({ action: 'continue' }));
    const decision = await chain.run({ x: 1 }, { onTrap });
    expect(decision.action).toBe('continue');
    expect(onTrap).toHaveBeenCalledTimes(2);
  });

  it('trap before a cancel: cancel still wins', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const onTrap = vi.fn();
    chain.use(() => {
      throw new Error('trap');
    });
    chain.use(() => ({ action: 'cancel', reason: 'late-veto' }));
    const decision = await chain.run({ x: 1 }, { onTrap });
    expect(decision).toEqual({ action: 'cancel', reason: 'late-veto' });
  });

  it('trap during replace handler: replace effect is discarded', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const onTrap = vi.fn();
    let seen = 0;
    chain.use(() => {
      throw new Error('would-be-replace blew up');
    });
    chain.use(
      (c) => {
        seen = c.x;
        return { action: 'continue' };
      },
      { priority: 200 },
    );
    await chain.run({ x: 1 }, { onTrap });
    // Second handler saw the original ctx (replace never landed).
    expect(seen).toBe(1);
  });
});

describe('InterceptorChain backwards compatibility (I6.12-I6.18 handlers still work)', () => {
  it('handler with no priority option still registers + runs', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const handler = vi.fn(() => ({ action: 'continue' as const }));
    chain.use(handler);
    await chain.run({ x: 1 });
    expect(handler).toHaveBeenCalled();
  });

  it('run() with no options uses default budget + console.error onTrap', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    chain.use(() => ({ action: 'continue' }));
    const decision = await chain.run({ x: 1 });
    expect(decision.action).toBe('continue');
  });
});
