import { randomUUID } from "node:crypto";
import Redis from "ioredis";

export interface CanvasLiveMember {
  memberId: string;
  displayName: string;
}

export interface CanvasLiveEvent {
  type: "presence" | "revision";
  canvasProjectId: string;
  at: string;
  action?: "snapshot" | "joined" | "left";
  members?: CanvasLiveMember[];
  member?: CanvasLiveMember;
  serverRevision?: number;
  revisionId?: string | null;
  actorId?: string;
}

export interface CanvasLiveRevisionMessage extends CanvasLiveEvent {
  type: "revision";
  eventId: string;
  sourceId: string;
  serverRevision: number;
  actorId: string;
}

export interface CanvasLiveRevisionTransport {
  subscribe(listener: (message: CanvasLiveRevisionMessage) => void): () => void;
  publish(message: CanvasLiveRevisionMessage): void | Promise<void>;
  close(): void | Promise<void>;
}

interface CanvasLiveSubscriber {
  connectionId: string;
  member: CanvasLiveMember;
  send: (event: CanvasLiveEvent) => void;
  close?: () => void;
}

export interface CanvasLiveCollaborationHub {
  subscribe(input: {
    canvasProjectId: string;
    member: CanvasLiveMember;
    send: (event: CanvasLiveEvent) => void;
    close?: () => void;
  }): () => void;
  publishRevision(input: {
    canvasProjectId: string;
    actorId: string;
    serverRevision: number;
    revisionId?: string | null;
    at?: string;
  }): void;
  close(): Promise<void>;
}

interface CanvasLiveCollaborationHubOptions {
  now?: () => string;
  instanceId?: string;
  revisionTransport?: CanvasLiveRevisionTransport;
  onTransportError?: (error: unknown) => void;
}

const revisionEventDedupeLimit = 2_048;
const redisConnectionOptions = {
  connectTimeout: 500,
  commandTimeout: 500,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
} as const;

function sendEvent(subscriber: CanvasLiveSubscriber, event: CanvasLiveEvent) {
  try {
    subscriber.send(event);
  } catch {
    // A disconnected SSE response must not break saves for other clients.
  }
}

function normalizeCanvasProjectId(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeMember(member: CanvasLiveMember): CanvasLiveMember {
  return {
    memberId: String(member.memberId ?? "").trim(),
    displayName: String(member.displayName ?? "用户").trim().slice(0, 120) || "用户",
  };
}

export function createCanvasLiveCollaborationHub(
  options: CanvasLiveCollaborationHubOptions = {},
): CanvasLiveCollaborationHub {
  const now = options.now ?? (() => new Date().toISOString());
  const instanceId = options.instanceId?.trim() || randomUUID();
  const subscribersByCanvas = new Map<string, Map<string, CanvasLiveSubscriber>>();
  const seenRevisionEventIds = new Set<string>();
  const revisionEventOrder: string[] = [];
  let closed = false;
  let closePromise: Promise<void> | null = null;

  const subscribersFor = (canvasProjectId: string) => {
    let subscribers = subscribersByCanvas.get(canvasProjectId);
    if (!subscribers) {
      subscribers = new Map();
      subscribersByCanvas.set(canvasProjectId, subscribers);
    }
    return subscribers;
  };

  const membersFor = (subscribers: Map<string, CanvasLiveSubscriber>) => {
    const unique = new Map<string, CanvasLiveMember>();
    for (const subscriber of subscribers.values()) {
      unique.set(subscriber.member.memberId, subscriber.member);
    }
    return Array.from(unique.values()).sort((left, right) => left.memberId.localeCompare(right.memberId));
  };

  const broadcastPresence = (canvasProjectId: string, action: "joined" | "left", member: CanvasLiveMember) => {
    const subscribers = subscribersByCanvas.get(canvasProjectId);
    if (!subscribers?.size) return;
    const event: CanvasLiveEvent = {
      type: "presence",
      canvasProjectId,
      at: now(),
      action,
      member,
      members: membersFor(subscribers),
    };
    for (const subscriber of subscribers.values()) sendEvent(subscriber, event);
  };

  const broadcastRevision = (message: CanvasLiveRevisionMessage) => {
    const subscribers = subscribersByCanvas.get(message.canvasProjectId);
    if (!subscribers?.size) return;
    for (const subscriber of subscribers.values()) sendEvent(subscriber, message);
  };

  const rememberRevisionEvent = (eventId: string) => {
    if (seenRevisionEventIds.has(eventId)) return false;
    seenRevisionEventIds.add(eventId);
    revisionEventOrder.push(eventId);
    if (revisionEventOrder.length > revisionEventDedupeLimit) {
      const expired = revisionEventOrder.shift();
      if (expired) seenRevisionEventIds.delete(expired);
    }
    return true;
  };

  const reportTransportError = (error: unknown) => {
    if (options.onTransportError) {
      options.onTransportError(error);
      return;
    }
    console.error(`[canvas-live] Revision transport failed: ${safeErrorCode(error)}`);
  };

  let stopRevisionTransport: (() => void) | undefined;
  try {
    stopRevisionTransport = options.revisionTransport?.subscribe((message) => {
      if (closed || !isCanvasLiveRevisionMessage(message) || !rememberRevisionEvent(message.eventId)) return;
      broadcastRevision(message);
    });
  } catch (error) {
    reportTransportError(error);
  }

  return {
    subscribe(input) {
      if (closed) throw new Error("canvas_live_hub_closed");
      const canvasProjectId = normalizeCanvasProjectId(input.canvasProjectId);
      if (!canvasProjectId) throw new Error("canvas_live_canvas_project_id_required");
      const member = normalizeMember(input.member);
      if (!member.memberId) throw new Error("canvas_live_member_id_required");
      const subscribers = subscribersFor(canvasProjectId);
      const connectionId = randomUUID();
      const subscriber: CanvasLiveSubscriber = { connectionId, member, send: input.send, close: input.close };
      subscribers.set(connectionId, subscriber);
      sendEvent(subscriber, {
        type: "presence",
        canvasProjectId,
        at: now(),
        action: "snapshot",
        member,
        members: membersFor(subscribers),
      });
      broadcastPresence(canvasProjectId, "joined", member);

      let closed = false;
      return () => {
        if (closed) return;
        closed = true;
        subscribers.delete(connectionId);
        broadcastPresence(canvasProjectId, "left", member);
        if (!subscribers.size) subscribersByCanvas.delete(canvasProjectId);
      };
    },

    publishRevision(input) {
      const canvasProjectId = normalizeCanvasProjectId(input.canvasProjectId);
      if (!canvasProjectId || closed) return;
      const event: CanvasLiveRevisionMessage = {
        type: "revision",
        eventId: randomUUID(),
        sourceId: instanceId,
        canvasProjectId,
        at: input.at ?? now(),
        serverRevision: Number(input.serverRevision),
        revisionId: input.revisionId ?? null,
        actorId: String(input.actorId ?? "").trim(),
      };
      rememberRevisionEvent(event.eventId);
      broadcastRevision(event);
      try {
        const published = options.revisionTransport?.publish(event);
        if (published && typeof published.then === "function") {
          void published.catch(reportTransportError);
        }
      } catch (error) {
        reportTransportError(error);
      }
    },

    close() {
      if (closePromise) return closePromise;
      closed = true;
      stopRevisionTransport?.();
      for (const subscribers of subscribersByCanvas.values()) {
        for (const subscriber of subscribers.values()) subscriber.close?.();
      }
      subscribersByCanvas.clear();
      seenRevisionEventIds.clear();
      revisionEventOrder.length = 0;
      closePromise = Promise.resolve(options.revisionTransport?.close()).catch(reportTransportError);
      return closePromise;
    },
  };
}

export function createCanvasLiveRevisionTransportFromEnv(
  env: NodeJS.ProcessEnv,
): CanvasLiveRevisionTransport | undefined {
  if (env.NODE_ENV?.trim().toLowerCase() === "test") return undefined;
  const redisUrl = env.REDIS_URL?.trim();
  if (!redisUrl) return undefined;
  assertRedisUrl(redisUrl);

  const channelPrefix = env.REDIS_KEY_PREFIX?.trim() || "comic-ai";
  const channel = `${channelPrefix}:canvas-live:revisions:v1`;
  const publisher = new Redis(redisUrl, redisConnectionOptions);
  const subscriber = new Redis(redisUrl, redisConnectionOptions);
  const listeners = new Set<(message: CanvasLiveRevisionMessage) => void>();
  let closed = false;
  let failureReported = false;

  const reportConnectionFailure = (error: unknown) => {
    if (closed || failureReported) return;
    failureReported = true;
    console.error(
      `[canvas-live] Redis pub/sub connection failed for REDIS_URL (${safeErrorCode(error)}). Local subscribers remain active.`,
    );
  };
  const reportReady = () => {
    failureReported = false;
    void subscriber.subscribe(channel).catch(reportConnectionFailure);
  };
  const deliver = (incomingChannel: string, raw: string) => {
    if (closed || incomingChannel !== channel) return;
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isCanvasLiveRevisionMessage(message)) return;
    for (const listener of listeners) listener(message);
  };

  publisher.on("error", reportConnectionFailure);
  subscriber.on("error", reportConnectionFailure);
  subscriber.on("ready", reportReady);
  subscriber.on("message", deliver);

  return {
    subscribe(listener) {
      if (closed) throw new Error("canvas_live_revision_transport_closed");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async publish(message) {
      if (closed) return;
      try {
        await publisher.publish(channel, JSON.stringify(message));
      } catch (error) {
        reportConnectionFailure(error);
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      listeners.clear();
      publisher.removeListener("error", reportConnectionFailure);
      subscriber.removeListener("error", reportConnectionFailure);
      subscriber.removeListener("ready", reportReady);
      subscriber.removeListener("message", deliver);
      await Promise.allSettled([
        subscriber.unsubscribe(channel),
        subscriber.quit(),
        publisher.quit(),
      ]);
      subscriber.disconnect();
      publisher.disconnect();
    },
  };
}

function isCanvasLiveRevisionMessage(value: unknown): value is CanvasLiveRevisionMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<CanvasLiveRevisionMessage>;
  return Boolean(
    message.type === "revision" &&
    typeof message.eventId === "string" &&
    message.eventId.trim() &&
    typeof message.sourceId === "string" &&
    message.sourceId.trim() &&
    typeof message.canvasProjectId === "string" &&
    message.canvasProjectId.trim() &&
    typeof message.at === "string" &&
    Number.isFinite(message.serverRevision) &&
    typeof message.actorId === "string",
  );
}

function assertRedisUrl(redisUrl: string) {
  try {
    const parsed = new URL(redisUrl);
    if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") throw new Error();
  } catch {
    throw new Error("canvas_live_invalid_REDIS_URL");
  }
}

function safeErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "").trim();
    if (code) return code.slice(0, 80);
  }
  return error instanceof Error ? error.name : "unknown_error";
}
