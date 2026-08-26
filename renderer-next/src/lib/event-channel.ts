import type { TimelineEvent, TimelineReplay } from "../../../protocol/domain";
import type { BridgeHandlers } from "../bridge/product-bridge";

/**
 * Switch-safe live event attachment.
 *
 * Order matters: the live listener arms FIRST and buffers, then the journaled
 * replay fills any gap since `lastSeq`, then buffered live events drain with
 * sequence dedupe. Nothing emitted while the user viewed another session can
 * be lost — that was the root cause of the tab-switch tool-card loss class.
 *
 * `onDesync` fires when the replay window no longer covers `lastSeq` (dropped)
 * or a sequence gap appears; the caller recovers by re-hydrating persisted
 * messages. Fresh opens pass `lastSeq = null` and skip replay entirely —
 * anything already persisted arrives via hydration instead.
 */
export async function attachSessionEvents(options: {
  subscribe: (handlers: BridgeHandlers) => Promise<() => void>;
  replay: (afterSeq: number) => Promise<TimelineReplay>;
  lastSeq: number | null;
  apply(event: TimelineEvent): void;
  onExit(reason: string): void;
  onDesync(): void;
}): Promise<() => void> {
  const pending: TimelineEvent[] = [];
  let deliveredHead = options.lastSeq ?? 0;
  let armed = false;
  let desyncReported = false;

  const deliver = (event: TimelineEvent): void => {
    if (typeof event.seq !== "number") return;
    if (event.seq <= deliveredHead) return;
    if (!desyncReported && deliveredHead > 0 && event.seq > deliveredHead + 1) {
      desyncReported = true;
      options.onDesync();
    }
    deliveredHead = event.seq;
    options.apply(event);
  };

  const teardown = await options.subscribe({
    onEvent: (event) => {
      if (armed) deliver(event);
      else pending.push(event);
    },
    onExit: options.onExit
  });

  try {
    if (options.lastSeq !== null) {
      const snapshot = await options.replay(deliveredHead);
      if (snapshot.dropped) {
        desyncReported = true;
        options.onDesync();
      } else {
        for (const event of snapshot.events) deliver(event);
        deliveredHead = Math.max(deliveredHead, snapshot.headSeq);
      }
    }
  } finally {
    armed = true;
    const queued = pending.splice(0, pending.length);
    for (const event of queued) deliver(event);
  }

  return teardown;
}
