export interface GenerationWorkerOperationTracker {
  track(operation: Promise<void>): void;
  drain(): Promise<void>;
  pendingCount(): number;
}

export function createGenerationWorkerOperationTracker(): GenerationWorkerOperationTracker {
  const pending = new Set<Promise<void>>();

  return {
    track(operation) {
      pending.add(operation);
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      );
    },
    async drain() {
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
    },
    pendingCount() {
      return pending.size;
    },
  };
}
