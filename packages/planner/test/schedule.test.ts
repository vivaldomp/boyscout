import type { ExecutionGraphT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { schedule } from "../src/index.js";

function graph(ordering: string[], edges: [string, string][] = []): ExecutionGraphT {
  return {
    nodes: ordering.map((id) => ({ id, capability: "component" })),
    edges: edges.map(([from, to]) => ({ from, to })),
    ordering,
  };
}

describe("schedule", () => {
  it("returns results indexed by graph ordering, not completion order", async () => {
    // 'a' resolves LAST (longest delay), 'c' first — output must still be [a,b,c].
    const delay: Record<string, number> = { a: 30, b: 15, c: 0 };
    const out = await schedule(
      graph(["a", "b", "c"]),
      (id) => new Promise((r) => setTimeout(() => r(id.toUpperCase()), delay[id])),
      { concurrency: 8 },
    );
    expect(out).toEqual(["A", "B", "C"]);
  });

  it("honors dependency bounds: a node never starts before its deps finish", async () => {
    // edges: a->b->c, plus independent d. Record start/finish; assert ordering constraints.
    const events: string[] = [];
    const run = (id: string) =>
      new Promise<string>((r) => {
        events.push(`start:${id}`);
        setTimeout(() => {
          events.push(`end:${id}`);
          r(id);
        }, 10);
      });
    await schedule(
      graph(
        ["a", "b", "c", "d"],
        [
          ["a", "b"],
          ["b", "c"],
        ],
      ),
      run,
      { concurrency: 8 },
    );
    // b starts only after a ends; c only after b ends.
    expect(events.indexOf("start:b")).toBeGreaterThan(events.indexOf("end:a"));
    expect(events.indexOf("start:c")).toBeGreaterThan(events.indexOf("end:b"));
  });

  it("respects the concurrency cap", async () => {
    let inFlight = 0;
    let peak = 0;
    const run = (id: string) =>
      new Promise<string>((r) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        setTimeout(() => {
          inFlight--;
          r(id);
        }, 10);
      });
    await schedule(graph(["a", "b", "c", "d", "e"]), run, { concurrency: 2 });
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("rejects a cycle", async () => {
    await expect(
      schedule(
        graph(
          ["a", "b"],
          [
            ["a", "b"],
            ["b", "a"],
          ],
        ),
        async (id) => id,
        {
          concurrency: 4,
        },
      ),
    ).rejects.toThrow(/cycle/i);
  });

  it("rejects a non-positive concurrency instead of hanging", async () => {
    await expect(schedule(graph(["a", "b"]), async (id) => id, { concurrency: 0 })).rejects.toThrow(
      /concurrency/i,
    );
  });
});
