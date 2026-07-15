export interface ImageGenerationTargetRequest {
  kind: string;
  [key: string]: unknown;
}

export interface ImageGenerationTargetAdapter<TContext, TPrepared> {
  kind: string;
  prepare(input: {
    target: ImageGenerationTargetRequest;
    context: TContext;
  }): Promise<TPrepared>;
}

export class ImageGenerationTargetRegistry<TContext, TPrepared> {
  readonly #adapters = new Map<string, ImageGenerationTargetAdapter<TContext, TPrepared>>();

  constructor(adapters: Array<ImageGenerationTargetAdapter<TContext, TPrepared>>) {
    for (const adapter of adapters) {
      const kind = normalizeKind(adapter.kind);
      if (!kind) {
        throw new Error("image_generation_target_kind_required");
      }
      if (this.#adapters.has(kind)) {
        throw new Error(`image_generation_target_duplicate:${kind}`);
      }
      this.#adapters.set(kind, adapter);
    }
  }

  get kinds() {
    return [...this.#adapters.keys()];
  }

  async prepare(target: unknown, context: TContext): Promise<TPrepared> {
    const request = parseTargetRequest(target);
    const adapter = this.#adapters.get(request.kind);
    if (!adapter) {
      throw new ImageGenerationTargetError(
        "image_generation_target_unsupported",
        `Unsupported image generation target: ${request.kind}`,
      );
    }
    return adapter.prepare({ target: request, context });
  }
}

export class ImageGenerationTargetError extends Error {
  constructor(
    readonly code:
      | "image_generation_target_required"
      | "image_generation_target_unsupported",
    message: string,
  ) {
    super(message);
  }
}

function parseTargetRequest(value: unknown): ImageGenerationTargetRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ImageGenerationTargetError(
      "image_generation_target_required",
      "Image generation target is required",
    );
  }
  const target = value as Record<string, unknown>;
  const kind = normalizeKind(target.kind);
  if (!kind) {
    throw new ImageGenerationTargetError(
      "image_generation_target_required",
      "Image generation target kind is required",
    );
  }
  return { ...target, kind };
}

function normalizeKind(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
