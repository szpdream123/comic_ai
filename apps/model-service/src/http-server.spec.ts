import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createModelHttpServer } from "./http-server.ts";

test("standalone HTTP server preserves signed raw bytes and serializes only service responses", async t => {
  const body = Buffer.from('{"prompt":"中文"}'); let received: Buffer | undefined;
  const server = createModelHttpServer({ handle: async input => { received = input.body; return { status: 202, body: { requestId: "r", status: "queued" } }; } });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); t.after(() => server.close());
  const result = await request(server, body);
  assert.equal(result.status, 202); assert.deepEqual(received, body);
  assert.equal(result.body.requestId, "r");
});
test("HTTP boundary rejects bad content type/size and sanitizes internal errors", async t => {
  let errorReported = false;
  const server = createModelHttpServer({ handle: async () => { throw new Error("secret SQL connection"); } }, { onError: () => { errorReported = true; }, maxBodyBytes: 100 });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); t.after(() => server.close());
  assert.equal((await request(server, Buffer.from("{}"), "text/plain")).status, 415);
  assert.equal((await request(server, Buffer.alloc(101))).status, 413);
  const result = await request(server, Buffer.from("{}"));
  assert.equal(result.status, 503); assert.equal(errorReported, true); assert.equal(JSON.stringify(result).includes("secret"), false);
});
test("a client abort or malformed target cannot stop the standalone service", async t => {
  let failures = 0;
  const server = createModelHttpServer({ handle: async () => ({ status: 200, body: { ok: true } }) }, { onError: () => { failures++; } });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); t.after(() => server.close());
  const port = (server.address() as any).port;
  await new Promise<void>(resolve => {
    const req = http.request({ host: "127.0.0.1", port, path: "/", method: "POST", headers: { "content-type": "application/json", "content-length": 100 } });
    req.on("error", () => resolve()); req.write("{");
    server.once("request", incoming => { incoming.once("aborted", () => setImmediate(resolve)); req.destroy(); });
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failures, 0);
  assert.equal((await request(server, Buffer.from("{}"))).status, 200);
});
test("draining waits for paid work after the client disconnects", async t => {
  let started!: () => void; let release!: () => void;
  const begun = new Promise<void>(resolve => { started = resolve; });
  const finish = new Promise<void>(resolve => { release = resolve; });
  const server = createModelHttpServer({ handle: async () => { started(); await finish; return { status: 200, body: { done: true } }; } });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); t.after(() => { release(); server.close(); });
  const req = http.request({ host: "127.0.0.1", port: (server.address() as any).port, path: "/", method: "POST", headers: { "content-type": "application/json" } });
  req.on("error", () => {}); req.end("{}"); await begun; req.destroy();
  await new Promise<void>(resolve => server.close(() => resolve()));
  let drained = false;
  const draining = server.drain().then(() => { drained = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(drained, false);
  release(); await draining; assert.equal(drained, true);
});
function request(server: http.Server, bytes: Buffer, contentType = "application/json"): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: (server.address() as any).port, path: "/api/integrations/promo-agent/text-completions", method: "POST", headers: { "content-type": contentType, "content-length": bytes.length } }, res => {
      const parts: Buffer[] = []; res.on("data", part => parts.push(part)); res.on("end", () => resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(parts).toString()) }));
    }); req.on("error", reject); req.end(bytes);
  });
}
