/**
 * Serializes async save operations for a single editor instance.
 * While a save is in flight, additional requests coalesce into one follow-up
 * run (latest task wins) so stale snapshots cannot overwrite newer writes.
 */
export function createSerializedSaveRunner<TResult>() {
  let inFlight = false;
  let queuedTask: (() => Promise<TResult>) | null = null;
  let queuedWaiters: Array<{
    resolve: (value: TResult) => void;
    reject: (reason?: unknown) => void;
  }> = [];

  async function drain() {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      while (queuedTask) {
        const task = queuedTask;
        const waiters = queuedWaiters;
        queuedTask = null;
        queuedWaiters = [];
        try {
          const result = await task();
          for (const waiter of waiters) {
            waiter.resolve(result);
          }
        } catch (error) {
          for (const waiter of waiters) {
            waiter.reject(error);
          }
        }
      }
    } finally {
      inFlight = false;
    }
  }

  return function enqueueSerializedSave(
    task: () => Promise<TResult>,
  ): Promise<TResult> {
    return new Promise((resolve, reject) => {
      queuedTask = task;
      queuedWaiters.push({ resolve, reject });
      void drain();
    });
  };
}
