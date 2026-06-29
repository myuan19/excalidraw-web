export type LoadLane = "heavy" | "light" | "idle";

export type LoadTask = {
  id: string;
  lane: LoadLane;
  priority: number;
  coalesceKey?: string;
  run: () => Promise<void>;
};

export type PriorityTaskQueueOptions = {
  lightMaxConcurrency?: number;
};

/**
 * Lane-aware task queue: one heavy task at a time; light tasks with bounded
 * concurrency; idle tasks drained via requestIdleCallback.
 */
export class PriorityTaskQueue {
  private readonly lightMaxConcurrency: number;
  private readonly pending: LoadTask[] = [];
  private heavyRunning = false;
  private lightRunning = 0;
  private idleCallbackId: number | null = null;
  private pumpScheduled = false;

  constructor(options?: PriorityTaskQueueOptions) {
    this.lightMaxConcurrency = Math.max(1, options?.lightMaxConcurrency ?? 1);
  }

  enqueue(task: LoadTask): void {
    if (task.coalesceKey) {
      const existingIndex = this.pending.findIndex(
        (item) => item.coalesceKey === task.coalesceKey,
      );
      if (existingIndex >= 0) {
        this.pending[existingIndex] = task;
        this.pending.sort((left, right) => right.priority - left.priority);
        this.schedulePump();
        return;
      }
    }
    this.pending.push(task);
    this.pending.sort((left, right) => right.priority - left.priority);
    this.schedulePump();
  }

  private schedulePump(): void {
    if (this.pumpScheduled) {
      return;
    }
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      this.pump();
    });
  }

  enqueueLight(
    task: Omit<LoadTask, "lane"> & { lane?: never },
  ): void {
    this.enqueue({ ...task, lane: "light" });
  }

  enqueueIdle(
    task: Omit<LoadTask, "lane"> & { lane?: never },
  ): void {
    this.enqueue({ ...task, lane: "idle" });
  }

  getPendingCount(): number {
    return this.pending.length;
  }

  private pump(): void {
    if (!this.heavyRunning) {
      let heavyIndex = -1;
      let heavyPriority = Number.NEGATIVE_INFINITY;
      for (let index = 0; index < this.pending.length; index += 1) {
        const task = this.pending[index];
        if (task.lane === "heavy" && task.priority > heavyPriority) {
          heavyPriority = task.priority;
          heavyIndex = index;
        }
      }
      if (heavyIndex >= 0) {
        const [task] = this.pending.splice(heavyIndex, 1);
        this.runHeavy(task);
      }
    }

    while (
      this.lightRunning < this.lightMaxConcurrency &&
      this.pending.some((task) => task.lane === "light")
    ) {
      const lightIndex = this.pending.findIndex((task) => task.lane === "light");
      const [task] = this.pending.splice(lightIndex, 1);
      this.runLight(task);
    }

    if (
      this.pending.some((task) => task.lane === "idle") &&
      this.idleCallbackId == null &&
      typeof requestIdleCallback === "function"
    ) {
      this.idleCallbackId = requestIdleCallback(() => {
        this.idleCallbackId = null;
        this.drainIdle();
        this.pump();
      });
    } else if (
      this.pending.some((task) => task.lane === "idle") &&
      this.idleCallbackId == null
    ) {
      void Promise.resolve().then(() => {
        this.drainIdle();
        this.pump();
      });
    }
  }

  private runHeavy(task: LoadTask): void {
    this.heavyRunning = true;
    void task
      .run()
      .catch(() => {
        /* task errors are handled by callers */
      })
      .finally(() => {
        this.heavyRunning = false;
        this.pump();
      });
  }

  private runLight(task: LoadTask): void {
    this.lightRunning += 1;
    void task
      .run()
      .catch(() => {
        /* task errors are handled by callers */
      })
      .finally(() => {
        this.lightRunning = Math.max(0, this.lightRunning - 1);
        this.pump();
      });
  }

  private drainIdle(): void {
    while (this.pending.length > 0 && this.pending[0]?.lane === "idle") {
      const task = this.pending.shift();
      if (!task) {
        return;
      }
      void task.run().catch(() => {
        /* task errors are handled by callers */
      });
    }
  }
}
