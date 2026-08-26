import {
  TIMELINE_JOURNAL_CAPACITY,
  type TimelineEvent,
  type TimelineReplay
} from "../../../protocol/domain";

/**
 * Per-session bounded ring of sequenced timeline events. Lives in the Desktop
 * Host so a renderer that switches away (or restarts) can catch up through
 * `events.replay` instead of losing live state — the root-cause fix for the
 * tab-switch tool-card/streaming-bubble loss class of bugs.
 */
export class EventJournal {
  private readonly rings = new Map<string, TimelineEvent[]>();
  private readonly heads = new Map<string, number>();

  /** Appends one event, assigning its `seq`, and trims the ring window. */
  append(sessionId: string, event: Omit<TimelineEvent, "seq">): TimelineEvent {
    const sequenced = { ...event, seq: (this.heads.get(sessionId) ?? 0) + 1 } as TimelineEvent;
    let ring = this.rings.get(sessionId);
    if (!ring) {
      ring = [];
      this.rings.set(sessionId, ring);
    }
    ring.push(sequenced);
    if (ring.length > TIMELINE_JOURNAL_CAPACITY) {
      ring.splice(0, ring.length - TIMELINE_JOURNAL_CAPACITY);
    }
    this.heads.set(sessionId, sequenced.seq);
    return sequenced;
  }

  /** Highest sequence ever journaled for the session (0 when unknown). */
  head(sessionId: string): number {
    return this.heads.get(sessionId) ?? 0;
  }

  /**
   * Events strictly after `afterSeq`. `dropped` reports that the request
   * predates the retained window — the caller must fall back to persisted
   * messages instead of trusting replay alone.
   */
  since(sessionId: string, afterSeq: number): TimelineReplay {
    const head = this.head(sessionId);
    if (!Number.isInteger(afterSeq) || afterSeq < 0) {
      return { events: [], headSeq: head, dropped: true };
    }
    const ring = this.rings.get(sessionId);
    if (!ring || ring.length === 0) {
      // No journal yet: an empty live session is legitimately caught up.
      return { events: [], headSeq: head, dropped: false };
    }
    const oldest = ring[0]!.seq;
    const events = afterSeq < oldest - 1 ? [] : ring.filter((event) => event.seq > afterSeq);
    return { events, headSeq: head, dropped: afterSeq < oldest - 1 };
  }

  forgetSession(sessionId: string): void {
    this.rings.delete(sessionId);
    this.heads.delete(sessionId);
  }
}
