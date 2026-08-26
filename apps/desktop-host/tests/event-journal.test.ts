import { describe, expect, test } from "bun:test";
import { EventJournal } from "../src/event-journal";
import { TIMELINE_JOURNAL_CAPACITY, type TimelineEvent } from "../../../protocol/domain";

function ev(n: number): Omit<TimelineEvent, "seq"> {
  return { v: 1, kind: "run.state", sessionId: "s1", state: n % 2 === 0 ? "idle" : "streaming" };
}

describe("EventJournal", () => {
  test("assigns per-session monotonic sequences starting at 1", () => {
    const journal = new EventJournal();
    const first = journal.append("a", ev(1));
    const second = journal.append("a", ev(2));
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(journal.head("a")).toBe(2);
    expect(journal.head("b")).toBe(0);
  });

  test("since returns strictly-after events and flags predating windows as dropped", () => {
    const journal = new EventJournal();
    for (let i = 1; i <= 5; i += 1) journal.append("a", ev(i));
    expect(journal.since("a", 3).events.map((event) => event.seq)).toEqual([4, 5]);
    expect(journal.since("a", 3).dropped).toBe(false);

    const partial = journal.since("a", 1);
    expect(partial.events.map((event) => event.seq)).toEqual([2, 3, 4, 5]);

    // Older than the window start minus one → cannot bridge, must re-hydrate.
    expect(journal.since("a", 0).dropped).toBe(false); // full history requested
    const trimmed = new EventJournal();
    for (let i = 1; i <= TIMELINE_JOURNAL_CAPACITY + 10; i += 1) trimmed.append("a", ev(i));
    expect(trimmed.since("a", 2).dropped).toBe(true);
    expect(trimmed.since("a", TIMELINE_JOURNAL_CAPACITY + 5).dropped).toBe(false);
  });

  test("an unknown session is caught-up empty, not dropped", () => {
    const journal = new EventJournal();
    expect(journal.since("ghost", 0)).toEqual({ events: [], headSeq: 0, dropped: false });
  });

  test("invalid afterSeq fails closed as dropped", () => {
    const journal = new EventJournal();
    journal.append("a", ev(1));
    expect(journal.since("a", Number.NaN).dropped).toBe(true);
    expect(journal.since("a", -1).dropped).toBe(true);
  });

  test("rings are isolated per session and forgetSession clears state", () => {
    const journal = new EventJournal();
    journal.append("a", ev(1));
    journal.append("b", ev(2));
    expect(journal.since("b", 0).headSeq).toBe(1);
    journal.forgetSession("a");
    expect(journal.head("a")).toBe(0);
    expect(journal.head("b")).toBe(1);
  });
});
