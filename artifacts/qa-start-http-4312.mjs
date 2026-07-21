import { createPhoneAuthDevServer } from "../apps/backend/src/entrypoints/phone-auth-dev-server.ts";

process.env.GENERATION_QUEUE_REQUIRED = "false";
process.env.BULLMQ_OUTBOX_DISPATCHER_ENABLED = "false";
process.env.BULLMQ_WORKERS_ENABLED = "false";
process.env.PHONE_AUTH_HTTP_ONLY = "true";

const server = createPhoneAuthDevServer();
await server.listen(4312);
console.log(`QA HTTP server listening on ${server.origin}`);
setInterval(() => {}, 1_000);
