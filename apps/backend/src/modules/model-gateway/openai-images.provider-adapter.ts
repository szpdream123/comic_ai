import type {
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";

const defaultEndpoint = "https://api.openai.com/v1/images/generations";
const defaultEditEndpoint = "https://api.openai.com/v1/images/edits";
const defaultModel = "gpt-image-2";
const defaultSize = "1024x1536";

export class OpenAIImagesProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      endpoint?: string;
      editEndpoint?: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async submit(
    input: ProviderSubmissionInput,
  ): Promise<ProviderSubmissionResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const imageReferences = collectImageReferences(input.redactedPayload);
    if (imageReferences.length > 0) {
      return this.submitImageEdit(input, imageReferences, fetchImpl);
    }

    const response = await fetchImpl(this.config.endpoint ?? defaultEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model ?? defaultModel,
        prompt: buildPrompt(input),
        size: defaultSize,
      }),
    });

    if (!response.ok) {
      throw new Error(`openai_images_${response.status}`);
    }

    const payload = (await response.json()) as {
      created?: number;
      data?: Array<{
        b64_json?: string;
        url?: string;
        revised_prompt?: string;
      }>;
    };

    if (!Array.isArray(payload.data) || payload.data.length < 1) {
      throw new Error("openai_images_invalid_response");
    }

    return {
      externalRequestId:
        response.headers.get("x-request-id") ?? input.providerRequestId,
      status: "succeeded",
      redactedResponse: {
        model: this.config.model ?? defaultModel,
        imageCount: payload.data.length,
        outputTypes: Array.from(
          new Set(
            payload.data.flatMap((item) => [
              ...(item.b64_json ? ["b64_json"] : []),
              ...(item.url ? ["url"] : []),
            ]),
          ),
        ),
        created: payload.created ?? null,
        revisedPrompt: payload.data[0]?.revised_prompt ?? null,
      },
      artifacts: payload.data
        .map((item) => imageArtifactFromResponseItem(item))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    };
  }

  private async submitImageEdit(
    input: ProviderSubmissionInput,
    imageReferences: ImageReference[],
    fetchImpl: typeof fetch,
  ): Promise<ProviderSubmissionResult> {
    const formData = new FormData();
    formData.set("model", this.config.model ?? defaultModel);
    formData.set("prompt", buildPrompt(input));
    formData.set("size", defaultSize);

    for (const [index, reference] of imageReferences.entries()) {
      const image = await imageReferenceToBlob(reference, fetchImpl);
      formData.append("image", image, reference.name || `reference-${index + 1}.${extensionFromMimeType(reference.mimeType)}`);
    }

    const response = await fetchImpl(this.config.editEndpoint ?? inferEditEndpoint(this.config.endpoint) ?? defaultEditEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`openai_images_${response.status}`);
    }

    const payload = (await response.json()) as {
      created?: number;
      data?: Array<{
        b64_json?: string;
        url?: string;
        revised_prompt?: string;
      }>;
    };

    if (!Array.isArray(payload.data) || payload.data.length < 1) {
      throw new Error("openai_images_invalid_response");
    }

    return {
      externalRequestId:
        response.headers.get("x-request-id") ?? input.providerRequestId,
      status: "succeeded",
      redactedResponse: {
        model: this.config.model ?? defaultModel,
        imageCount: payload.data.length,
        inputReferenceCount: imageReferences.length,
        outputTypes: Array.from(
          new Set(
            payload.data.flatMap((item) => [
              ...(item.b64_json ? ["b64_json"] : []),
              ...(item.url ? ["url"] : []),
            ]),
          ),
        ),
        created: payload.created ?? null,
        revisedPrompt: payload.data[0]?.revised_prompt ?? null,
      },
      artifacts: payload.data
        .map((item) => imageArtifactFromResponseItem(item))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    };
  }
}

interface ImageReference {
  name?: string;
  mimeType: string;
  b64Json?: string;
  url?: string;
}

function imageArtifactFromResponseItem(item: {
  b64_json?: string;
  url?: string;
}) {
  if (typeof item.b64_json === "string" && item.b64_json.trim()) {
    return {
      mediaType: "image" as const,
      mimeType: "image/png",
      fileExtension: "png",
      b64Json: item.b64_json,
    };
  }
  if (typeof item.url === "string" && item.url.trim()) {
    return {
      mediaType: "image" as const,
      mimeType: "image/png",
      fileExtension: "png",
      url: item.url.trim(),
    };
  }
  return null;
}

function buildPrompt(input: ProviderSubmissionInput) {
  const payload = input.redactedPayload;
  const prompt =
    typeof payload.prompt === "string" && payload.prompt.trim().length > 0
      ? payload.prompt.trim()
      : undefined;

  if (prompt) {
    return prompt;
  }

  const title =
    typeof payload.title === "string" && payload.title.trim().length > 0
      ? payload.title.trim()
      : "Untitled shot";
  const shotId =
    typeof payload.shotId === "string" && payload.shotId.trim().length > 0
      ? payload.shotId.trim()
      : "unknown-shot";
  const contentRevision =
    typeof payload.contentRevision === "number"
      ? String(payload.contentRevision)
      : "unknown";

  return [
    `Storyboard frame for "${title}".`,
    `Shot ID: ${shotId}.`,
    `Content revision: ${contentRevision}.`,
    "Generate a polished vertical comic frame with strong visual consistency.",
  ].join(" ");
}

function collectImageReferences(payload: Record<string, unknown>): ImageReference[] {
  const parameters = readObject(payload.parameters);
  const candidates = [
    ...readArray(payload.referenceImages),
    ...readArray(payload.references),
    ...readArray(parameters.referenceImages),
    ...readArray(parameters.quickReferences),
    ...readArray(parameters.references),
    parameters.firstFrame,
    parameters.imageReference,
  ];
  const references: ImageReference[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const reference = normalizeImageReference(candidate);
    if (!reference) {
      continue;
    }
    const key = reference.b64Json ? `b64:${reference.b64Json}` : `url:${reference.url}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    references.push(reference);
  }

  return references;
}

function normalizeImageReference(value: unknown): ImageReference | null {
  const object = readObject(value);
  if (!object) {
    return null;
  }
  const mimeType = readString(object.mimeType) ?? readString(object.type) ?? "image/png";
  const b64Json =
    readString(object.b64Json) ??
    readString(object.b64_json) ??
    b64JsonFromDataUrl(readString(object.dataUrl) ?? readString(object.url));
  const url = readString(object.url) ?? readString(object.sourceUrl) ?? readString(object.preview);
  const name = readString(object.name) ?? readString(object.fileName) ?? undefined;

  if (b64Json) {
    return { name, mimeType, b64Json };
  }
  if (url && !url.startsWith("data:")) {
    return { name, mimeType, url };
  }
  return null;
}

async function imageReferenceToBlob(reference: ImageReference, fetchImpl: typeof fetch) {
  if (reference.b64Json) {
    return new Blob([Buffer.from(reference.b64Json, "base64")], {
      type: reference.mimeType,
    });
  }
  if (!reference.url) {
    throw new Error("openai_images_reference_missing");
  }
  const response = await fetchImpl(reference.url);
  if (!response.ok) {
    throw new Error(`openai_images_reference_${response.status}`);
  }
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || reference.mimeType;
  return new Blob([await response.arrayBuffer()], { type: contentType });
}

function b64JsonFromDataUrl(value: string | undefined) {
  if (!value?.startsWith("data:")) {
    return undefined;
  }
  const marker = ";base64,";
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }
  return value.slice(markerIndex + marker.length).trim() || undefined;
}

function inferEditEndpoint(endpoint: string | undefined) {
  if (!endpoint) {
    return undefined;
  }
  return endpoint.replace(/\/images\/generations$/i, "/images/edits");
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return "jpg";
  }
  if (mimeType.includes("webp")) {
    return "webp";
  }
  if (mimeType.includes("avif")) {
    return "avif";
  }
  return "png";
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
