export const generationTimeoutPolicy = {
  image: 60 * 60 * 1000,
  video: 3 * 60 * 60 * 1000,
  audio: 60 * 60 * 1000,
} as const;

export const generationPollIntervalMs = 30_000;

export type GenerationTimeoutMediaType = keyof typeof generationTimeoutPolicy;

export function generationTimeoutMsFor(mediaType: GenerationTimeoutMediaType): number {
  return generationTimeoutPolicy[mediaType];
}

export function generationPollMaxAttempts(
  mediaType: GenerationTimeoutMediaType,
): number {
  return Math.ceil(generationTimeoutMsFor(mediaType) / generationPollIntervalMs);
}

export function generationProviderHttpTimeoutMsFor(
  mediaType: GenerationTimeoutMediaType,
  _env: NodeJS.ProcessEnv = process.env,
): number {
  return generationTimeoutMsFor(mediaType);
}
