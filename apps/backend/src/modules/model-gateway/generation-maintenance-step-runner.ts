export class GenerationMaintenanceStepTimeoutError extends Error {
  constructor(
    readonly stepName: string,
    readonly timeoutMs: number,
  ) {
    super(`generation_maintenance_step_timeout:${stepName}:${timeoutMs}`);
    this.name = "GenerationMaintenanceStepTimeoutError";
  }
}

export async function runIsolatedGenerationMaintenanceStep<T>(input: {
  name: string;
  run(signal: AbortSignal): Promise<T>;
  runInContext<TValue>(run: () => Promise<TValue>): Promise<TValue>;
  onError(name: string, error: unknown): void;
  timeoutMs?: number;
}): Promise<T | null> {
  const timeoutMs = Math.max(1, Math.floor(input.timeoutMs ?? 60_000));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new GenerationMaintenanceStepTimeoutError(input.name, timeoutMs);
        controller.abort(error);
        reject(error);
      }, timeoutMs);
    });
    return await Promise.race([
      input.runInContext(() => input.run(controller.signal)),
      timeout,
    ]);
  } catch (error) {
    input.onError(input.name, error);
    if (error instanceof GenerationMaintenanceStepTimeoutError) throw error;
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
