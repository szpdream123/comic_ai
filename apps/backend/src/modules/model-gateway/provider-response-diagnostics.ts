export interface ProviderResponseDiagnostics {
  httpStatus: number;
  statusText?: string | null;
  contentType: string | null;
  requestId: string | null;
  responseBodyLength: number;
  responseBodyPreview: string;
}

export function providerResponseDiagnostics(
  response: Response,
  text: string,
): ProviderResponseDiagnostics {
  return {
    httpStatus: response.status,
    statusText: response.statusText || null,
    contentType: response.headers.get("content-type"),
    requestId: readProviderRequestId(response),
    responseBodyLength: Buffer.byteLength(text, "utf8"),
    responseBodyPreview: redactProviderResponsePreview(text),
  };
}

export async function readProviderResponseDiagnostics(response: Response) {
  const text = await response.text().catch(() => "");
  return {
    text,
    diagnostics: providerResponseDiagnostics(response, text),
  };
}

export function providerResponseError(message: string, diagnostics: ProviderResponseDiagnostics) {
  return Object.assign(new Error(message), {
    providerDiagnostics: diagnostics,
  });
}

export function redactProviderResponsePreview(text: string) {
  const preview = text.trim().slice(0, 1000);
  if (!preview) return "";
  return preview
    .replace(/"b64_json"\s*:\s*"[^"]+"/gi, '"b64_json":"[redacted]"')
    .replace(/"url"\s*:\s*"[^"]+"/gi, '"url":"[redacted]"')
    .replace(/"image_url"\s*:\s*"[^"]+"/gi, '"image_url":"[redacted]"')
    .replace(/"video_url"\s*:\s*"[^"]+"/gi, '"video_url":"[redacted]"')
    .replace(/"audio_url"\s*:\s*"[^"]+"/gi, '"audio_url":"[redacted]"')
    .replace(/"api[_-]?key"\s*:\s*"[^"]+"/gi, '"api_key":"[redacted]"')
    .replace(/"authorization"\s*:\s*"[^"]+"/gi, '"authorization":"[redacted]"')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
}

function readProviderRequestId(response: Response) {
  return (
    response.headers.get("x-request-id") ||
    response.headers.get("x-tt-logid") ||
    response.headers.get("x-dashscope-request-id") ||
    response.headers.get("request-id") ||
    response.headers.get("x-amzn-requestid") ||
    null
  );
}
