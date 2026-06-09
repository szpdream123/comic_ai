import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import type {
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";

const defaultEndpoint = "https://api.openai.com/v1/images/generations";
const defaultEditEndpoint = "https://api.openai.com/v1/images/edits";
const defaultModel = "gpt-image-2";
const defaultSize = "1024x1536";
const defaultRequestTimeoutMs = 600_000;

export class OpenAIImagesProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      endpoint?: string;
      editEndpoint?: string;
      fetchImpl?: typeof fetch;
      requestTimeoutMs?: number;
      resultFormat?: string;
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

    const resultFormat = normalizeResultFormat(this.config.resultFormat);
    const requestBody = {
      model: this.config.model ?? defaultModel,
      prompt: buildPrompt(input),
      size: defaultSize,
      ...(resultFormat ? { response_format: resultFormat } : {}),
    };

    const { response, text } = await fetchTextWithTimeout(
      fetchImpl,
      this.config.endpoint ?? defaultEndpoint,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
      this.config.requestTimeoutMs,
    );

    if (!response.ok) {
      throw new Error(`openai_images_${response.status}`);
    }

    const diagnostics = providerResponseDiagnostics(response, text);
    const payload = parseOpenAIImagesResponsePayload(text, diagnostics);

    if (!Array.isArray(payload.data) || payload.data.length < 1) {
      throw providerResponseError("openai_images_invalid_response", diagnostics);
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
    const resultFormat = normalizeResultFormat(this.config.resultFormat);
    if (resultFormat) {
      formData.set("response_format", resultFormat);
    }

    for (const [index, reference] of imageReferences.entries()) {
      const image = await imageReferenceToBlob(reference, fetchImpl);
      formData.append("image[]", image, reference.name || `reference-${index + 1}.${extensionFromMimeType(reference.mimeType)}`);
    }

    const { response, text } = await fetchTextWithTimeout(
      fetchImpl,
      this.config.editEndpoint ?? inferEditEndpoint(this.config.endpoint) ?? defaultEditEndpoint,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: formData,
      },
      this.config.requestTimeoutMs,
    );

    if (!response.ok) {
      throw new Error(`openai_images_${response.status}`);
    }

    const diagnostics = providerResponseDiagnostics(response, text);
    const payload = parseOpenAIImagesResponsePayload(text, diagnostics);

    if (!Array.isArray(payload.data) || payload.data.length < 1) {
      throw providerResponseError("openai_images_invalid_response", diagnostics);
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

function parseOpenAIImagesResponsePayload(text: string, diagnostics: ProviderResponseDiagnostics): {
  created?: number;
  data?: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
} {
  if (!text.trim()) {
    throw providerResponseError("openai_images_empty_response", diagnostics);
  }
  try {
    return JSON.parse(text) as {
      created?: number;
      data?: Array<{
        b64_json?: string;
        url?: string;
        revised_prompt?: string;
      }>;
    };
  } catch {
    throw providerResponseError("openai_images_invalid_json", diagnostics);
  }
}

interface ProviderResponseDiagnostics {
  httpStatus: number;
  contentType: string | null;
  responseBodyLength: number;
  responseBodyPreview: string;
}

function providerResponseDiagnostics(response: Response, text: string): ProviderResponseDiagnostics {
  return {
    httpStatus: response.status,
    contentType: response.headers.get("content-type"),
    responseBodyLength: Buffer.byteLength(text, "utf8"),
    responseBodyPreview: redactResponsePreview(text),
  };
}

function providerResponseError(message: string, diagnostics: ProviderResponseDiagnostics) {
  return Object.assign(new Error(message), {
    providerDiagnostics: diagnostics,
  });
}

function redactResponsePreview(text: string) {
  const preview = text.trim().slice(0, 500);
  if (!preview) return "";
  return preview
    .replace(/"b64_json"\s*:\s*"[^"]+"/gi, '"b64_json":"[redacted]"')
    .replace(/"url"\s*:\s*"[^"]+"/gi, '"url":"[redacted]"');
}

function normalizeResultFormat(value: string | undefined) {
  const normalized = value?.trim();
  return normalized === "b64_json" || normalized === "url"
    ? normalized
    : undefined;
}

async function fetchTextWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs = defaultRequestTimeoutMs,
) {
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : defaultRequestTimeoutMs;
  if (fetchImpl === fetch && /^https?:\/\//i.test(url)) {
    return nodeHttpTextWithTimeout(url, init, timeout);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error("openai_images_timeout"));
  }, timeout);
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    return { response, text };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("openai_images_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function nodeHttpTextWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const target = new URL(url);
  const requestImpl = target.protocol === "http:" ? httpRequest : httpsRequest;
  const requestBody = await requestBodyToBuffer(init.body);
  const headers = headersToRecord(init.headers);
  if (requestBody.contentType && !hasHeader(headers, "content-type")) {
    headers["content-type"] = requestBody.contentType;
  }
  if (requestBody.buffer && !hasHeader(headers, "content-length")) {
    headers["content-length"] = String(requestBody.buffer.length);
  }

  return await new Promise<{ response: Response; text: string }>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      finish(() => {
        req.destroy(new Error("openai_images_timeout"));
        reject(new Error("openai_images_timeout"));
      });
    }, timeoutMs);
    const req = requestImpl(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: init.method ?? "GET",
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const response = new Response(text, {
            status: res.statusCode && res.statusCode >= 200 && res.statusCode <= 599 ? res.statusCode : 599,
            headers: responseHeadersToHeaders(res.headers),
          });
          finish(() => resolve({ response, text }));
        });
      },
    );
    req.on("error", (error) => {
      finish(() => {
        reject(error.message === "openai_images_timeout" ? new Error("openai_images_timeout") : error);
      });
    });
    req.setTimeout(timeoutMs, () => {
      finish(() => {
        req.destroy(new Error("openai_images_timeout"));
        reject(new Error("openai_images_timeout"));
      });
    });
    if (requestBody.buffer) {
      req.write(requestBody.buffer);
    }
    req.end();
  });
}

async function requestBodyToBuffer(body: BodyInit | null | undefined): Promise<{
  buffer?: Buffer;
  contentType?: string;
}> {
  if (!body) {
    return {};
  }
  if (typeof body === "string") {
    return { buffer: Buffer.from(body) };
  }
  if (body instanceof URLSearchParams) {
    return {
      buffer: Buffer.from(body.toString()),
      contentType: "application/x-www-form-urlencoded;charset=UTF-8",
    };
  }
  if (body instanceof FormData) {
    return multipartFormDataToBuffer(body);
  }
  if (body instanceof Blob) {
    return {
      buffer: Buffer.from(await body.arrayBuffer()),
      contentType: body.type || undefined,
    };
  }
  if (body instanceof ArrayBuffer) {
    return { buffer: Buffer.from(body) };
  }
  if (ArrayBuffer.isView(body)) {
    return { buffer: Buffer.from(body.buffer, body.byteOffset, body.byteLength) };
  }
  throw new Error("openai_images_unsupported_request_body");
}

async function multipartFormDataToBuffer(formData: FormData) {
  const boundary = `----comic-ai-${crypto.randomUUID().replaceAll("-", "")}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of formData.entries()) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (value instanceof Blob) {
      const fileName = readBlobFileName(value) ?? "blob";
      const contentType = value.type || "application/octet-stream";
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${escapeMultipartName(name)}"; filename="${escapeMultipartName(fileName)}"\r\n`));
      chunks.push(Buffer.from(`Content-Type: ${contentType}\r\n\r\n`));
      chunks.push(Buffer.from(await value.arrayBuffer()));
      chunks.push(Buffer.from("\r\n"));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${escapeMultipartName(name)}"\r\n\r\n`));
      chunks.push(Buffer.from(String(value)));
      chunks.push(Buffer.from("\r\n"));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    buffer: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function readBlobFileName(value: Blob) {
  const candidate = value as Blob & { name?: unknown };
  return typeof candidate.name === "string" && candidate.name.trim()
    ? candidate.name.trim()
    : undefined;
}

function escapeMultipartName(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "%22").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, value]));
  }
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
}

function hasHeader(headers: Record<string, string>, name: string) {
  const lowerName = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lowerName);
}

function responseHeadersToHeaders(headers: Record<string, string | string[] | undefined>) {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      result.set(key, value.join(", "));
    } else if (typeof value === "string") {
      result.set(key, value);
    }
  }
  return result;
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
