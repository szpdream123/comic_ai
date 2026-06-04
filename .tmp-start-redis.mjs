import { RedisMemoryServer } from "redis-memory-server";

const server = new RedisMemoryServer({
  instance: {
    ip: "127.0.0.1",
    port: 6379,
  },
});

const host = await server.getHost();
const port = await server.getPort();
console.log(`[redis-memory-server] listening ${host}:${port}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await server.stop();
    process.exit(0);
  });
}

setInterval(() => {}, 1000);
