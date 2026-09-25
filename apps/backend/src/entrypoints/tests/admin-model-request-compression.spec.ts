import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { test } from "node:test";
import { promisify } from "node:util";
import vm from "node:vm";
import { brotliCompress, brotliDecompressSync, constants, gunzipSync, gzip } from "node:zlib";
import { transformSync } from "esbuild";

// Exercise the actual route and response writer without starting unrelated runtime services.
const source = readFileSync(new URL("../phone-auth-dev-server.ts", import.meta.url), "utf8");
const routeStart = source.indexOf("      const adminUserModelRequestsMatch =");
const routeEnd = source.indexOf('      if (request.method === "GET" && pathname === "/api/admin/risks")', routeStart);
const writerStart = source.indexOf("function writeJson(");
const writerEnd = source.indexOf("function writeText(", writerStart);
const encodingStart = source.indexOf("function acceptsContentEncoding(");
const encodingEnd = source.indexOf("async function minifyStaticAsset(", encodingStart);
assert.ok(routeStart >= 0 && routeEnd > routeStart && writerStart >= 0 && writerEnd > writerStart
  && encodingStart >= 0 && encodingEnd > encodingStart);

test("model record responses compress losslessly and respect encoding negotiation", async (t) => {
  const requestBody = { prompt: "完整请求内容\n".repeat(20_000), image: "ABCD".repeat(25_000) };
  const payload = {
    data: [{ requestBody, providerRequestBody: requestBody, preparedProviderRequestBody: requestBody,
      providerResponseBody: { data: [{ b64_json: "ZYXW".repeat(25_000) }] } }],
    meta: { page: 1, pageSize: 15, total: 537, totalPages: 36 },
  };
  const jsonResponseStartedAt = new WeakMap();
  let serviceCalls = 0;
  const handle = vm.runInNewContext(transformSync(`
    ${source.slice(writerStart, writerEnd)}
    ${source.slice(encodingStart, encodingEnd)}
    (async function(request, response) {
      const url = new URL(request.url, "http://localhost");
      const pathname = url.pathname;
      ${source.slice(routeStart, routeEnd)}
    })
  `, { loader: "ts" }).code, {
    URL, process, jsonResponseStartedAt, db: {},
    gzip: promisify(gzip), brotliCompress: promisify(brotliCompress), zlibConstants: constants,
    requireAdminRouteSession: async ({ cookieHeader }) => cookieHeader === "test-admin=1"
      ? { ok: true } : { ok: false, response: { status: 401, body: { error: "unauthorized" } } },
    createAdminUserService: () => ({ async listUserModelRequestLogs(input) {
      serviceCalls += 1;
      assert.equal(input.pageSize, 15);
      return payload;
    } }),
  });
  const server = createServer((request, response) => {
    jsonResponseStartedAt.set(response, process.hrtime.bigint());
    response.setHeader("vary", "Origin");
    handle(request, response).catch((error) => response.destroy(error));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  async function get(acceptEncoding: string, authenticated = true) {
    return new Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }>((resolve, reject) => {
      const request = httpRequest(`${origin}/api/admin/users/test-user/model-requests?pageSize=15`, {
        headers: { "accept-encoding": acceptEncoding, ...(authenticated ? { cookie: "test-admin=1" } : {}) },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode!, headers: response.headers, body: Buffer.concat(chunks) }));
        response.on("error", reject);
      });
      request.on("error", reject);
      request.end();
    });
  }
  for (const [acceptEncoding, encoding] of [
    ["br, gzip", "br"], ["gzip", "gzip"], ["br;q=0, gzip", "gzip"],
    ["gzip;q=0, identity", undefined], ["br;q=0, gzip;q=0", undefined], ["", undefined],
  ]) {
    await t.test(acceptEncoding || "no encoding header", async () => {
      const response = await get(acceptEncoding!);
      assert.equal(response.status, 200);
      assert.equal(response.headers["content-encoding"], encoding);
      assert.match(String(response.headers.vary), /Origin/);
      assert.match(String(response.headers.vary), /Accept-Encoding/);
      assert.match(String(response.headers["server-timing"]), /total;dur=/);
      const decoded = encoding === "br" ? brotliDecompressSync(response.body)
        : encoding === "gzip" ? gunzipSync(response.body) : response.body;
      assert.deepEqual(JSON.parse(decoded.toString()), payload);
      if (encoding) assert.ok(response.body.length < decoded.length / 4);
    });
  }
  await t.test("unauthenticated requests do not load model records", async () => {
    const before = serviceCalls;
    const response = await get("br, gzip", false);
    assert.equal(response.status, 401);
    assert.equal(serviceCalls, before);
    assert.equal(response.headers["content-encoding"], undefined);
  });
});
