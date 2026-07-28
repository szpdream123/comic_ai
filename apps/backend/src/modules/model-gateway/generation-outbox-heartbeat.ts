export function generationOutboxDispatcherHeartbeatKey(queuePrefix: string) {
  return `${queuePrefix}:generation-outbox-dispatcher:heartbeat`;
}

export function generationOutboxDispatcherHeartbeatTtlMs(dispatchIntervalMs: number) {
  return Math.max(15_000, Math.floor(dispatchIntervalMs) * 5);
}
