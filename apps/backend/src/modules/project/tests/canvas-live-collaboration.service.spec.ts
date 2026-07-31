import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  createCanvasLiveCollaborationHub,
  type CanvasLiveEvent,
  type CanvasLiveRevisionMessage,
  type CanvasLiveRevisionTransport,
} from "../canvas-live-collaboration.service.ts";

describe("canvas live collaboration hub", () => {
  it("uses remote-safe Redis timeouts and redacted error summaries", () => {
    const source = readFileSync(
      join(process.cwd(), "apps/backend/src/modules/project/canvas-live-collaboration.service.ts"),
      "utf8",
    );
    assert.match(source, /connectTimeout:\s*2_000/);
    assert.match(source, /commandTimeout:\s*5_000/);
    assert.match(source, /retryStrategy/);
    assert.match(source, /<redacted>/);
    assert.match(source, /safeErrorSummary/);
  });

  it("broadcasts real presence and revision events only within the authorized canvas channel", () => {
    const hub = createCanvasLiveCollaborationHub({ now: () => "2026-07-20T00:00:00.000Z" });
    const first: CanvasLiveEvent[] = [];
    const second: CanvasLiveEvent[] = [];
    const isolated: CanvasLiveEvent[] = [];

    const leaveFirst = hub.subscribe({
      canvasProjectId: "canvas-a",
      member: { memberId: "user:first", displayName: "First" },
      send: (event) => first.push(event),
    });
    const leaveSecond = hub.subscribe({
      canvasProjectId: "canvas-a",
      member: { memberId: "team:second", displayName: "Second" },
      send: (event) => second.push(event),
    });
    hub.subscribe({
      canvasProjectId: "canvas-b",
      member: { memberId: "user:isolated", displayName: "Isolated" },
      send: (event) => isolated.push(event),
    });

    assert.equal(first[0]?.type, "presence");
    assert.equal(first[0]?.action, "snapshot");
    assert.deepEqual(first.at(-1)?.members?.map((member) => member.memberId), ["team:second", "user:first"]);
    assert.deepEqual(second.at(-1)?.members?.map((member) => member.memberId), ["team:second", "user:first"]);

    hub.publishRevision({
      canvasProjectId: "canvas-a",
      actorId: "actor-1",
      serverRevision: 7,
      revisionId: "revision-7",
    });

    assert.equal(first.at(-1)?.type, "revision");
    assert.equal(first.at(-1)?.serverRevision, 7);
    assert.equal(second.at(-1)?.revisionId, "revision-7");
    assert.equal(isolated.some((event) => event.type === "revision"), false);

    leaveSecond();
    assert.equal(first.at(-1)?.action, "left");
    assert.deepEqual(first.at(-1)?.members?.map((member) => member.memberId), ["user:first"]);
    leaveFirst();
  });

  it("closes active transports when the server shuts down", async () => {
    const hub = createCanvasLiveCollaborationHub();
    let closeCount = 0;
    hub.subscribe({
      canvasProjectId: "canvas-a",
      member: { memberId: "user:first", displayName: "First" },
      send: () => undefined,
      close: () => { closeCount += 1; },
    });

    await hub.close();
    assert.equal(closeCount, 1);
  });

  it("replays bounded revision events after Last-Event-ID without crossing Canvas scope", () => {
    const hub = createCanvasLiveCollaborationHub({ instanceId: "replay-instance" });
    const seed: CanvasLiveEvent[] = [];
    hub.subscribe({ canvasProjectId: "canvas-a", member: { memberId: "owner", displayName: "Owner" }, send: (event) => seed.push(event) });
    hub.publishRevision({ canvasProjectId: "canvas-a", actorId: "owner", serverRevision: 1 });
    hub.publishRevision({ canvasProjectId: "canvas-a", actorId: "owner", serverRevision: 2 });
    hub.publishRevision({ canvasProjectId: "canvas-b", actorId: "other", serverRevision: 99 });
    const revisions = seed.filter((event): event is CanvasLiveRevisionMessage => event.type === "revision");
    const resumed: CanvasLiveEvent[] = [];

    hub.subscribe({
      canvasProjectId: "canvas-a",
      member: { memberId: "member", displayName: "Member" },
      afterEventId: revisions[0]?.eventId,
      send: (event) => resumed.push(event),
    });

    assert.deepEqual(resumed.filter((event) => event.type === "revision").map((event) => event.serverRevision), [2]);
    assert.equal(resumed.some((event) => event.serverRevision === 99), false);
  });

  it("broadcasts revisions across hubs, deduplicates transport echoes, and cleans up transport listeners", async () => {
    const bus = createMemoryRevisionBus({ duplicateDelivery: true });
    const firstTransport = bus.createTransport();
    const secondTransport = bus.createTransport();
    const firstHub = createCanvasLiveCollaborationHub({
      instanceId: "instance-first",
      revisionTransport: firstTransport,
    });
    const secondHub = createCanvasLiveCollaborationHub({
      instanceId: "instance-second",
      revisionTransport: secondTransport,
    });
    const first: CanvasLiveEvent[] = [];
    const second: CanvasLiveEvent[] = [];
    let firstConnectionClosed = 0;

    firstHub.subscribe({
      canvasProjectId: "canvas-a",
      member: { memberId: "user:first", displayName: "First" },
      send: (event) => first.push(event),
      close: () => { firstConnectionClosed += 1; },
    });
    secondHub.subscribe({
      canvasProjectId: "canvas-a",
      member: { memberId: "user:second", displayName: "Second" },
      send: (event) => second.push(event),
    });

    firstHub.publishRevision({
      canvasProjectId: "canvas-a",
      actorId: "actor-1",
      serverRevision: 11,
      revisionId: "revision-11",
    });

    assert.equal(first.filter((event) => event.type === "revision").length, 1);
    assert.equal(second.filter((event) => event.type === "revision").length, 1);
    assert.equal(second.at(-1)?.serverRevision, 11);

    await firstHub.close();
    assert.equal(firstConnectionClosed, 1);
    assert.equal(firstTransport.closeCount, 1);
    assert.equal(bus.listenerCount(), 1);

    secondHub.publishRevision({
      canvasProjectId: "canvas-a",
      actorId: "actor-2",
      serverRevision: 12,
    });
    assert.equal(first.filter((event) => event.type === "revision").length, 1);
    assert.equal(second.filter((event) => event.type === "revision").length, 2);

    await secondHub.close();
    assert.equal(secondTransport.closeCount, 1);
    assert.equal(bus.listenerCount(), 0);
  });
});

function createMemoryRevisionBus(options: { duplicateDelivery?: boolean } = {}) {
  const listeners = new Set<(message: CanvasLiveRevisionMessage) => void>();
  return {
    listenerCount: () => listeners.size,
    createTransport(): CanvasLiveRevisionTransport & { closeCount: number } {
      let listener: ((message: CanvasLiveRevisionMessage) => void) | null = null;
      return {
        closeCount: 0,
        subscribe(next) {
          listener = next;
          listeners.add(next);
          return () => {
            if (listener) listeners.delete(listener);
            listener = null;
          };
        },
        publish(message) {
          for (const next of [...listeners]) {
            next(message);
            if (options.duplicateDelivery) next(message);
          }
        },
        close() {
          this.closeCount += 1;
          if (listener) listeners.delete(listener);
          listener = null;
        },
      };
    },
  };
}
