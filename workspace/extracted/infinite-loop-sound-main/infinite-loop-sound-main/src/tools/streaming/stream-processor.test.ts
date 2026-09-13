import { describe, it, expect } from "vitest";
import { StreamProcessor } from "./stream-processor";

function ev(i: number, ts: number): Parameters<StreamProcessor["process"]>[0] {
  return { id: `e${i}`, streamId: "s1", timestamp: ts, type: "tick", data: { value: i } };
}

describe("StreamProcessor", () => {
  it("does not hang with slideMs of 0", () => {
    const processor = new StreamProcessor({ type: "sliding", sizeMs: 1000, slideMs: 0 });
    const now = Date.now();
    const result = processor.process(ev(1, now - 10));
    expect(result.windowResults.length).toBeGreaterThan(0);
  });

  it("produces tumbling windows containing recent events", () => {
    const processor = new StreamProcessor({ type: "tumbling", sizeMs: 1000 });
    const now = Date.now();
    const r1 = processor.process(ev(1, now - 10));
    expect(r1.windowResults.length).toBeGreaterThan(0);
    const window = r1.windowResults[0];
    expect(window.events).toHaveLength(1);
    expect(window.windowEnd - window.windowStart).toBe(1000);
  });

  it("detects a simple CEP threshold pattern", () => {
    const processor = new StreamProcessor({ type: "tumbling", sizeMs: 5000 });
    processor.addPattern({
      name: "spike",
      conditions: [{ field: "value", operator: ">", value: 10 }],
      action: "alert",
    });
    const now = Date.now();
    const r = processor.process({
      id: "big",
      streamId: "s1",
      timestamp: now,
      type: "tick",
      data: { value: 42 },
    });
    expect(r.cepMatches.some((m) => m.patternName === "spike")).toBe(true);
  });

  it("caps stored matches to avoid unbounded growth", () => {
    const processor = new StreamProcessor({ type: "tumbling", sizeMs: 50 });
    processor.addPattern({
      name: "always",
      conditions: [],
      action: "noop",
    });
    for (let i = 0; i < 1200; i++) {
      processor.process(ev(i, Date.now()));
    }
    // Internal matches list is bounded (1000 → trimmed to 500)
    const internal = (processor as unknown as { matches: unknown[] }).matches;
    expect(internal.length).toBeLessThanOrEqual(600);
  });
});
