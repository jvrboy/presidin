/**
 * Stream Processor - Real-time stream processing with windowing, aggregation, and CEP
 * Extends streaming tools with sliding/tumbling/session windows and complex event processing
 */

export interface StreamEvent {
  id: string;
  streamId: string;
  timestamp: number;
  type: string;
  data: Record<string, any>;
}

export interface WindowConfig {
  type: "tumbling" | "sliding" | "session";
  sizeMs: number;
  slideMs?: number;
  gapMs?: number;
}

export interface WindowResult {
  windowStart: number;
  windowEnd: number;
  events: StreamEvent[];
  aggregate: Record<string, number>;
}

export interface CEPattern {
  name: string;
  conditions: { field: string; operator: ">" | "<" | "=" | ">=" | "<=" | "!="; value: any }[];
  sequence?: { type: string; within: number }[];
  action: string;
}

export interface CEPMatch {
  patternName: string;
  events: StreamEvent[];
  timestamp: number;
  action: string;
}

export class StreamProcessor {
  private windows: Map<string, StreamEvent[]> = new Map();
  private patterns: CEPattern[] = [];
  private matches: CEPMatch[] = [];
  private aggregators: Map<string, (events: StreamEvent[]) => Record<string, number>> = new Map();

  constructor(private windowConfig: WindowConfig) {}

  addPattern(pattern: CEPattern): void {
    this.patterns.push(pattern);
  }

  setAggregator(streamId: string, fn: (events: StreamEvent[]) => Record<string, number>): void {
    this.aggregators.set(streamId, fn);
  }

  process(event: StreamEvent): { windowResults: WindowResult[]; cepMatches: CEPMatch[] } {
    if (!this.windows.has(event.streamId)) {
      this.windows.set(event.streamId, []);
    }
    this.windows.get(event.streamId)!.push(event);

    this.pruneWindow(event.streamId);

    const windowResults = this.computeWindows(event.streamId);
    const cepMatches = this.detectPatterns(event.streamId);

    this.matches.push(...cepMatches);
    if (this.matches.length > 1000) this.matches = this.matches.slice(-500);

    return { windowResults, cepMatches };
  }

  private pruneWindow(streamId: string): void {
    const events = this.windows.get(streamId)!;
    const cutoff = Date.now() - this.windowConfig.sizeMs * 2;
    this.windows.set(
      streamId,
      events.filter((e) => e.timestamp > cutoff),
    );
  }

  private computeWindows(streamId: string): WindowResult[] {
    const events = this.windows.get(streamId) ?? [];
    const now = Date.now();
    const results: WindowResult[] = [];

    if (this.windowConfig.type === "tumbling") {
      const windowStart = now - (now % this.windowConfig.sizeMs);
      const windowEnd = windowStart + this.windowConfig.sizeMs;
      const windowEvents = events.filter(
        (e) => e.timestamp >= windowStart && e.timestamp < windowEnd,
      );
      if (windowEvents.length > 0) {
        results.push(this.createWindowResult(windowStart, windowEnd, windowEvents, streamId));
      }
    } else if (this.windowConfig.type === "sliding") {
      const slide = Math.max(1, this.windowConfig.slideMs ?? this.windowConfig.sizeMs / 2);
      for (let start = now - this.windowConfig.sizeMs; start <= now; start += slide) {
        const windowEvents = events.filter(
          (e) => e.timestamp >= start && e.timestamp < start + this.windowConfig.sizeMs,
        );
        if (windowEvents.length > 0) {
          results.push(
            this.createWindowResult(
              start,
              start + this.windowConfig.sizeMs,
              windowEvents,
              streamId,
            ),
          );
        }
      }
    } else if (this.windowConfig.type === "session") {
      const gap = this.windowConfig.gapMs ?? 30000;
      let sessionStart = events[0]?.timestamp ?? now;
      let sessionEvents: StreamEvent[] = [];
      for (const event of events) {
        if (
          event.timestamp -
            (sessionEvents[sessionEvents.length - 1]?.timestamp ?? event.timestamp) >
          gap
        ) {
          if (sessionEvents.length > 0) {
            results.push(
              this.createWindowResult(
                sessionStart,
                sessionEvents[sessionEvents.length - 1].timestamp,
                sessionEvents,
                streamId,
              ),
            );
          }
          sessionStart = event.timestamp;
          sessionEvents = [];
        }
        sessionEvents.push(event);
      }
      if (sessionEvents.length > 0) {
        results.push(
          this.createWindowResult(
            sessionStart,
            sessionEvents[sessionEvents.length - 1].timestamp,
            sessionEvents,
            streamId,
          ),
        );
      }
    }

    return results;
  }

  private createWindowResult(
    start: number,
    end: number,
    events: StreamEvent[],
    streamId: string,
  ): WindowResult {
    const aggregator = this.aggregators.get(streamId);
    const aggregate = aggregator ? aggregator(events) : { count: events.length };
    return { windowStart: start, windowEnd: end, events, aggregate };
  }

  private detectPatterns(streamId: string): CEPMatch[] {
    const events = this.windows.get(streamId) ?? [];
    const matches: CEPMatch[] = [];

    for (const pattern of this.patterns) {
      if (pattern.sequence) {
        const sequenceMatches = this.matchSequence(events, pattern);
        matches.push(...sequenceMatches);
      } else {
        for (const event of events) {
          if (this.matchConditions(event, pattern.conditions)) {
            matches.push({
              patternName: pattern.name,
              events: [event],
              timestamp: event.timestamp,
              action: pattern.action,
            });
          }
        }
      }
    }

    return matches;
  }

  private matchConditions(event: StreamEvent, conditions: CEPattern["conditions"]): boolean {
    return conditions.every((cond) => {
      const value = event.data[cond.field];
      switch (cond.operator) {
        case ">":
          return value > cond.value;
        case "<":
          return value < cond.value;
        case "=":
          return value === cond.value;
        case ">=":
          return value >= cond.value;
        case "<=":
          return value <= cond.value;
        case "!=":
          return value !== cond.value;
        default:
          return false;
      }
    });
  }

  private matchSequence(events: StreamEvent[], pattern: CEPattern): CEPMatch[] {
    if (!pattern.sequence || pattern.sequence.length === 0) return [];
    const matches: CEPMatch[] = [];

    for (let i = 0; i <= events.length - pattern.sequence.length; i++) {
      const matchedEvents: StreamEvent[] = [];
      let valid = true;
      let lastTime = events[i].timestamp;

      for (let j = 0; j < pattern.sequence.length; j++) {
        const seqItem = pattern.sequence[j];
        const event = events[i + j];
        if (!event || event.type !== seqItem.type) {
          valid = false;
          break;
        }
        if (event.timestamp - lastTime > seqItem.within) {
          valid = false;
          break;
        }
        matchedEvents.push(event);
        lastTime = event.timestamp;
      }

      if (valid && this.matchConditions(matchedEvents[0], pattern.conditions)) {
        matches.push({
          patternName: pattern.name,
          events: matchedEvents,
          timestamp: matchedEvents[0].timestamp,
          action: pattern.action,
        });
      }
    }

    return matches;
  }

  getMatches(): CEPMatch[] {
    return [...this.matches];
  }

  getStreamStats(streamId: string): { eventCount: number; rate: number; lastEvent: number } {
    const events = this.windows.get(streamId) ?? [];
    if (events.length === 0) return { eventCount: 0, rate: 0, lastEvent: 0 };
    const timeSpan = (Date.now() - events[0].timestamp) / 1000;
    return {
      eventCount: events.length,
      rate: timeSpan > 0 ? events.length / timeSpan : 0,
      lastEvent: events[events.length - 1].timestamp,
    };
  }
}

export default StreamProcessor;
