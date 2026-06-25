import { describe, expect, it, vi } from "vitest";

import { createSerializedSaveRunner } from "./serializedSave";

describe("createSerializedSaveRunner", () => {
  it("runs saves sequentially and coalesces pending requests to the latest task", async () => {
    const enqueue = createSerializedSaveRunner<number>();
    const order: string[] = [];

    const first = enqueue(async () => {
      order.push("first-start");
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("first-end");
      return 1;
    });

    const second = enqueue(async () => {
      order.push("second-start");
      return 2;
    });

    const third = enqueue(async () => {
      order.push("third-start");
      return 3;
    });

    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(3);
    await expect(third).resolves.toBe(3);
    expect(order).toEqual([
      "first-start",
      "first-end",
      "third-start",
    ]);
  });

  it("propagates errors without blocking later saves", async () => {
    const enqueue = createSerializedSaveRunner<void>();
    const task = vi.fn(async () => undefined);

    await expect(
      enqueue(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(enqueue(task)).resolves.toBeUndefined();
    expect(task).toHaveBeenCalledTimes(1);
  });
});
