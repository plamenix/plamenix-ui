/**
 * React hook for declarative event-bus subscriptions (I6.1).
 *
 * Wraps `eventBus.subscribe(pluginId, pattern, handler)` in a
 * `useEffect` so the subscription life cycle tracks the component
 * mount. The handler is captured in a ref so subscribers don't have
 * to memoise their callback to avoid spurious re-subscribes — every
 * render's `handler` becomes the next invocation's target without
 * tearing down the subscription itself.
 *
 *   useEventSubscription('com.example.audit', 'query/executed', (topic, payload) => {
 *     log.info(`audit: ${topic}`, payload);
 *   });
 *
 * For one-off out-of-React subscribers (built-in interceptors,
 * server-side wiring), import `eventBus` directly and call `.subscribe`.
 */

import { useEffect, useRef } from 'react';
import { eventBus, type EventHandler } from './event-bus.js';

export function useEventSubscription<TPayload = unknown>(
  pluginId: string,
  pattern: string,
  handler: EventHandler<TPayload>,
): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const sub = eventBus.subscribe<TPayload>(pluginId, pattern, (topic, payload) => {
      ref.current(topic, payload);
    });
    return () => sub.dispose();
  }, [pluginId, pattern]);
}
