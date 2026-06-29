import { describe, expect, it, vi } from "vitest";

import { PriorityTaskQueue } from "./PriorityTaskQueue";

describe("PriorityTaskQueue", () => {
  it("runs heavy tasks one at a time in priority order", async () => {
    const queue = new PriorityTaskQueue();
    const order: string[] = [];

    queue.enqueue({
      id: "heavy-low",
      lane: "heavy",
      priority: 1,
      run: async () => {
        order.push("low-start");
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push("low-end");
      },
    });
    queue.enqueue({
      id: "heavy-high",
      lane: "heavy",
      priority: 10,
      run: async () => {
        order.push("high");
      },
    });

    await vi.waitFor(() => {
      expect(order).toEqual(["high", "low-start", "low-end"]);
    });
  });

  it("coalesces tasks with the same coalesceKey", async () => {
    const queue = new PriorityTaskQueue();
    const runs: string[] = [];

    queue.enqueue({
      id: "a",
      lane: "heavy",
      priority: 1,
      coalesceKey: "tree",
      run: async () => {
        runs.push("first");
      },
    });
    queue.enqueue({
      id: "b",
      lane: "heavy",
      priority: 2,
      coalesceKey: "tree",
      run: async () => {
        runs.push("second");
      },
    });

    await vi.waitFor(() => {
      expect(runs).toEqual(["second"]);
    });
  });

  it("limits light lane concurrency", async () => {
    const queue = new PriorityTaskQueue({ lightMaxConcurrency: 1 });
    let inFlight = 0;
    let maxInFlight = 0;

    const makeTask = (id: string) => ({
      id,
      lane: "light" as const,
      priority: 1,
      run: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      },
    });

    queue.enqueue(makeTask("a"));
    queue.enqueue(makeTask("b"));

    await vi.waitFor(() => {
      expect(maxInFlight).toBe(1);
    });
  });
});
