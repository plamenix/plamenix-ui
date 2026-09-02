import { describe, expect, it, vi } from 'vitest';
import { InterceptorChain } from './chain.js';

describe('InterceptorChain (I6.12)', () => {
  it('empty chain returns continue', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const decision = await chain.run({ x: 1 });
    expect(decision).toEqual({ action: 'continue' });
  });

  it('returns continue when all handlers continue', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    chain.use(() => ({ action: 'continue' }));
    chain.use(() => ({ action: 'continue' }));
    const decision = await chain.run({ x: 1 });
    expect(decision.action).toBe('continue');
  });

  it('first cancel short-circuits + propagates reason', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const second = vi.fn(() => ({ action: 'continue' as const }));
    chain.use(() => ({ action: 'cancel', reason: 'nope' }));
    chain.use(second);
    const decision = await chain.run({ x: 1 });
    expect(decision).toEqual({ action: 'cancel', reason: 'nope' });
    expect(second).not.toHaveBeenCalled();
  });

  it('handlers run in registration order', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const order: string[] = [];
    chain.use(() => {
      order.push('a');
      return { action: 'continue' };
    });
    chain.use(() => {
      order.push('b');
      return { action: 'continue' };
    });
    chain.use(() => {
      order.push('c');
      return { action: 'continue' };
    });
    await chain.run({ x: 1 });
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('async handlers are awaited before next handler runs', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    let aDone = false;
    chain.use(async () => {
      await new Promise((r) => setTimeout(r, 10));
      aDone = true;
      return { action: 'continue' };
    });
    chain.use(() => {
      expect(aDone).toBe(true);
      return { action: 'continue' };
    });
    await chain.run({ x: 1 });
  });

  it('async handler can cancel; later sync handler not invoked', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    chain.use(async () => {
      await Promise.resolve();
      return { action: 'cancel', reason: 'async-veto' };
    });
    const second = vi.fn(() => ({ action: 'continue' as const }));
    chain.use(second);
    const decision = await chain.run({ x: 1 });
    expect(decision).toEqual({ action: 'cancel', reason: 'async-veto' });
    expect(second).not.toHaveBeenCalled();
  });

  it('dispose() removes the handler from the chain', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const cancelHandler = vi.fn(() => ({ action: 'cancel' as const, reason: 'r' }));
    const reg = chain.use(cancelHandler);
    expect(chain.__size()).toBe(1);
    reg.dispose();
    expect(chain.__size()).toBe(0);
    const decision = await chain.run({ x: 1 });
    expect(decision.action).toBe('continue');
    expect(cancelHandler).not.toHaveBeenCalled();
  });

  it('handler can dispose itself mid-flight without breaking iteration', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    const aHandler = vi.fn(() => ({ action: 'continue' as const }));
    const reg = chain.use(aHandler);
    const bHandler = vi.fn(() => {
      reg.dispose(); // dispose a while we're iterating
      return { action: 'continue' as const };
    });
    chain.use(bHandler);
    const decision = await chain.run({ x: 1 });
    expect(decision.action).toBe('continue');
    expect(aHandler).toHaveBeenCalledTimes(1);
    expect(bHandler).toHaveBeenCalledTimes(1);
  });

  it('__reset clears handlers + restores empty state', async () => {
    const chain = new InterceptorChain<{ x: number }>();
    chain.use(() => ({ action: 'cancel', reason: 'r' }));
    chain.__reset();
    expect(chain.__size()).toBe(0);
    expect(await chain.run({ x: 1 })).toEqual({ action: 'continue' });
  });
});
