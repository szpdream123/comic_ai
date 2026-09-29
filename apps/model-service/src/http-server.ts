import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ModelServiceError } from "./contracts.ts";
import { maxBodyBytes, type ServiceRequest, type ServiceResponse } from "./service.ts";

export function createModelHttpServer(service: { handle(input: ServiceRequest): Promise<ServiceResponse> }, options: {
  onError?: (error: unknown) => void; maxBodyBytes?: number; maxInFlight?: number;
} = {}) {
  let active = 0;
  const pending = new Set<Promise<void>>();
  const server = createServer((request, response) => {
    if (active >= (options.maxInFlight ?? 16)) {
      request.resume(); write(response, { status: 503, body: { error: "service_busy" } }); return;
    }
    active++;
    const work = (async () => {
      try {
        if (request.method === "POST" && !/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? "")) {
          request.resume(); throw new ModelServiceError(415, "json_content_type_required");
        }
        const body = await readBody(request, options.maxBodyBytes ?? maxBodyBytes);
        let url: URL;
        try { url = new URL(request.url ?? "/", "http://model-service.local"); }
        catch { throw new ModelServiceError(400, "request_target_invalid"); }
        write(response, await service.handle({ method: request.method ?? "GET", url, headers: request.headers, body }));
      } catch (error) {
        if (error instanceof ModelServiceError) write(response, { status: error.status, body: { error: error.code } });
        else { write(response, { status: 503, body: { error: "service_unavailable" } }); options.onError?.(error); }
      } finally { active--; }
    })();
    pending.add(work);
    void work.finally(() => pending.delete(work));
  });
  server.requestTimeout = 150_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  return Object.assign(server, { async drain() {
    while (pending.size) await Promise.allSettled([...pending]);
  } });
}
function write(response: ServerResponse, result: ServiceResponse) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(result.status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(result.body));
}
async function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > limit) { request.resume(); throw new ModelServiceError(413, "body_too_large"); }
  const chunks: Buffer[] = []; let size = 0;
  try {
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > limit) { request.resume(); throw new ModelServiceError(413, "body_too_large"); }
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof ModelServiceError) throw error;
    throw new ModelServiceError(400, "request_body_incomplete");
  }
  return Buffer.concat(chunks);
}
