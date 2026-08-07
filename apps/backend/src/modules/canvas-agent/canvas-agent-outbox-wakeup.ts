export const canvasAgentOutboxWakeChannel = "canvas_agent_outbox_ready";

export function createCanvasAgentOutboxWakeSignal() {
  let pending = false;
  let closed = false;
  let waiter: ((reason: "notified" | "closed") => void) | null = null;

  return {
    notify() {
      if (closed) return;
      pending = true;
      waiter?.("notified");
      waiter = null;
    },
    async wait(timeoutMs: number): Promise<"notified" | "timeout" | "closed"> {
      if (closed) return "closed";
      if (pending) {
        pending = false;
        return "notified";
      }
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          waiter = null;
          resolve("timeout");
        }, Math.max(0, timeoutMs));
        waiter = (reason) => {
          clearTimeout(timeout);
          pending = false;
          resolve(reason);
        };
      });
    },
    close() {
      closed = true;
      pending = false;
      waiter?.("closed");
      waiter = null;
    },
  };
}
