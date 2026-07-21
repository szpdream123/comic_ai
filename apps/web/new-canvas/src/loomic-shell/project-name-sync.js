export function normalizeCanvasProjectName(value) {
  return String(value || "未命名创意画布").trim().slice(0, 50) || "未命名创意画布";
}

export function mergeCanvasSaveStates(documentState = "saved", projectNameState = "saved") {
  const states = [documentState, projectNameState];
  return ["conflict", "error", "retrying", "local", "saving", "dirty", "loading"]
    .find((state) => states.includes(state)) ?? "saved";
}

export function initialCanvasProjectNameSaveState(pendingTitle = "") {
  return normalizePendingTitle(pendingTitle) ? "local" : "saved";
}

export function createCanvasProjectNameSync({
  save,
  initialPendingTitle = "",
  onPendingChange = () => {},
  onStateChange = () => {},
} = {}) {
  let pendingTitle = normalizePendingTitle(initialPendingTitle);
  let chain = Promise.resolve({ status: pendingTitle ? "pending" : "idle" });
  let conflictError = null;

  const persistPending = async (scheduledTitle) => {
    const title = normalizePendingTitle(scheduledTitle);
    if (!title) return { status: "idle" };
    if (typeof save !== "function") throw new Error("canvas_project_name_save_unavailable");
    if (conflictError) throw conflictError;
    onStateChange("saving");
    try {
      await save(title);
      if (pendingTitle === title) {
        pendingTitle = "";
        onPendingChange("");
      }
      onStateChange(pendingTitle ? "saving" : "saved");
      return { status: "saved", title };
    } catch (error) {
      if (error?.errorCode === "canvas_project_title_conflict") conflictError = error;
      onStateChange(error?.errorCode === "canvas_project_title_conflict" ? "conflict" : "error", error);
      throw error;
    }
  };

  const enqueue = (title) => {
    const operation = chain.catch(() => undefined).then(() => persistPending(title));
    chain = operation;
    operation.catch(() => undefined);
    return operation;
  };

  return {
    pendingTitle() {
      return pendingTitle;
    },
    schedule(value) {
      pendingTitle = normalizeCanvasProjectName(value);
      onPendingChange(pendingTitle);
      return enqueue(pendingTitle);
    },
    async flush() {
      await chain.catch(() => undefined);
      return pendingTitle ? enqueue(pendingTitle) : { status: "idle" };
    },
    discard() {
      conflictError = null;
      pendingTitle = "";
      onPendingChange("");
      onStateChange("saved");
      return { status: "discarded" };
    },
    async retryConflict() {
      await chain.catch(() => undefined);
      conflictError = null;
      return pendingTitle ? enqueue(pendingTitle) : { status: "idle" };
    },
  };
}

function normalizePendingTitle(value) {
  const title = String(value ?? "").trim();
  return title ? normalizeCanvasProjectName(title) : "";
}
