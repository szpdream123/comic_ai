export const generationTimeoutPolicy = {
  image: 60 * 60 * 1000,
  video: 3 * 60 * 60 * 1000,
  audio: 60 * 60 * 1000,
} as const;

export const generationPollIntervalMs = 30_000;

export type GenerationTimeoutMediaType = keyof typeof generationTimeoutPolicy;

export function generationTimeoutMsFor(mediaType: GenerationTimeoutMediaType): number {
  return generationTimeoutMsForEnv(mediaType, process.env);
}

export function generationTimeoutMsForEnv(
  mediaType: GenerationTimeoutMediaType,
  env: NodeJS.ProcessEnv,
): number {
  if (mediaType !== "image") {
    return generationTimeoutPolicy[mediaType];
  }
  return readPositiveDurationMs(
    env.GENERATION_IMAGE_TIMEOUT_MS,
    generationTimeoutPolicy.image,
  );
}

export function generationPollMaxAttempts(
  mediaType: GenerationTimeoutMediaType,
): number {
  return Math.ceil(generationTimeoutMsFor(mediaType) / generationPollIntervalMs);
}

export function generationPollMaxAttemptsForEnv(
  mediaType: GenerationTimeoutMediaType,
  env: NodeJS.ProcessEnv,
): number {
  return Math.ceil(generationTimeoutMsForEnv(mediaType, env) / generationPollIntervalMs);
}

export function generationProviderHttpTimeoutMsFor(
  mediaType: GenerationTimeoutMediaType,
  _env: NodeJS.ProcessEnv = process.env,
): number {
  return generationTimeoutPolicy[mediaType];
}

function readPositiveDurationMs(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
