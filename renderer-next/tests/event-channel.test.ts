import { expect, test } from "bun:test";
import { attachSessionEvents } from "../src/lib/event-channel";
import type { TimelineEvent, TimelineReplay } from "../../protocol/domain";
import type { BridgeHandlers } from "../src/bridge/product-bridge";

function ev(seq: number): TimelineEvent {
  return { v: 1, kind: "run.state", sessionId: "s1", seq, state: "streaming" };
}

type Harness = {
  handlers: BridgeHandlers[];
  emit(event: TimelineEvent): void;
  offCalls: number;
};

function harness(): Harness {
  const h: Harness = { handlers: [], emit: () => undefined, offCalls: 0 };
  return h;
}

function subscribeSeam(h: Harness) {
  return async (handlers: BridgeHandlers): Promise<() => void> => {
    h.handlers.push(handlers);
    return () => {
      h.offCalls += 1;
    };
  };
}

test("buffers live events during replay, then drains in order", async () => {
  const h = harness();
  const applied: number[] = [];
  const replayEvents = [ev(41), ev(42)];
  let pendingResolve: ((value: TimelineReplay) => void) | undefined;

  const promise = attachSessionEvents({
    subscribe: subscribeSeam(h),
    replay: (afterSeq) => {
      expect(afterSeq).toBe(40);
      return new Promise<TimelineReplay>((resolve) => {
        pendingResolve = resolve;
      });
    },
    lastSeq: 40,
    apply: (e) => applied.push(e.seq),
    onExit: () => undefined,
    onDesync: () => expect.unreachable()
  });

  // Live events arrive while the replay round-trip is in flight.
  const live43 = ev(43);
  for (const handler of h.handlers) handler.onEvent(live43);

  // Let the attach body resume past its first await so the replay stub runs.
  await Promise.resolve();
  pendingResolve!({ events: replayEvents, headSeq: 42, dropped: false });
  await promise;

  expect(applied).toEqual([41, 42, 43]);
});

test("dropped replay reports desync once and still drains buffered live events", async () => {
  const h = harness();
  const applied: number[] = [];
  let desyncs = 0;

  await attachSessionEvents({
    subscribe: subscribeSeam(h),
    replay: async () => ({ events: [], headSeq: 900, dropped: true }),
    lastSeq: 5,
    apply: (e) => applied.push(e.seq),
    onExit: () => undefined,
    onDesync: () => {
      desyncs += 1;
    }
  });

  for (const handler of h.handlers) handler.onEvent(ev(6));
  expect(desyncs).toBe(1);
});

test("fresh opens skip replay entirely; first live seq may be arbitrarily high", async () => {
  const h = harness();
  const applied: number[] = [];
  let replayCalls = 0;

  await attachSessionEvents({
    subscribe: subscribeSeam(h),
    replay: async () => {
      replayCalls += 1;
      return { events: [], headSeq: 0, dropped: false };
    },
    lastSeq: null,
    apply: (e) => applied.push(e.seq),
    onExit: () => undefined,
    onDesync: () => expect.unreachable()
  });

  for (const handler of h.handlers) handler.onEvent(ev(57));
  expect(replayCalls).toBe(0);
  expect(applied).toEqual([57]);
});

test("sequence gaps flag desync exactly once and duplicates are dropped", async () => {
  const h = harness();
  const applied: number[] = [];
  let desyncs = 0;

  await attachSessionEvents({
    subscribe: subscribeSeam(h),
    replay: async (afterSeq) => ({ events: [ev(afterSeq + 1)], headSeq: afterSeq + 1, dropped: false }),
    lastSeq: 10,
    apply: (e) => applied.push(e.seq),
    onExit: () => undefined,
    onDesync: () => {
      desyncs += 1;
    }
  });

  for (const handler of h.handlers) {
    handler.onEvent(ev(11)); // duplicate of replayed 11
    handler.onEvent(ev(11)); // duplicate again
    handler.onEvent(ev(20)); // gap → desync, still applied
    handler.onEvent(ev(21));
  }
  expect(applied).toEqual([11, 20, 21]);
  expect(desyncs).toBe(1);
});

test("teardown removes the subscription and is safe to call once", async () => {
  const h = harness();
  const teardown = await attachSessionEvents({
    subscribe: subscribeSeam(h),
    replay: async () => ({ events: [], headSeq: 0, dropped: false }),
    lastSeq: 0,
    apply: () => undefined,
    onExit: () => undefined,
    onDesync: () => undefined
  });
  teardown();
  expect(h.offCalls).toBe(1);
});
