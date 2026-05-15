const sessionSummary = document.querySelector("#session-summary");
const workspaceStatus = document.querySelector("#workspace-status");
const projectSummary = document.querySelector("#project-summary");
const assetReviewSummary = document.querySelector("#asset-review-summary");
const calibrationSummary = document.querySelector("#calibration-summary");
const generationSummary = document.querySelector("#generation-summary");
const shotsList = document.querySelector("#shots-list");
const exportSummary = document.querySelector("#export-summary");

const projectNameInput = document.querySelector("#project-name-input");
const scriptInput = document.querySelector("#script-input");

const buttons = {
  logout: document.querySelector("#logout-button"),
  createProject: document.querySelector("#create-project-button"),
  parseScript: document.querySelector("#parse-script-button"),
  confirmAssets: document.querySelector("#confirm-assets-button"),
  runCalibration: document.querySelector("#run-calibration-button"),
  generateImages: document.querySelector("#generate-images-button"),
  generateVideos: document.querySelector("#generate-videos-button"),
  previewExport: document.querySelector("#preview-export-button"),
};

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error ?? `request_failed:${response.status}`);
  }

  return payload;
}

function renderKeyValueStack(target, rows) {
  if (!target) {
    return;
  }

  target.innerHTML = rows
    .map(
      (row) => `
        <div class="summary-row">
          <span class="summary-label">${row.label}</span>
          <strong class="summary-value">${row.value}</strong>
        </div>`,
    )
    .join("");
}

function renderShots(shots) {
  if (!shotsList) {
    return;
  }

  if (!shots.length) {
    shotsList.innerHTML =
      '<p class="empty-state">No shots yet. Create a project and parse the script first.</p>';
    return;
  }

  shotsList.innerHTML = shots
    .map(
      (shot) => `
        <article class="shot-card">
          <div>
            <p class="shot-title">${shot.title}</p>
            <p class="shot-meta">Revision ${shot.contentRevision}</p>
          </div>
          <div class="shot-tags">
            <span class="shot-tag">Image ${shot.imageStatus}</span>
            <span class="shot-tag">Video ${shot.videoStatus}</span>
          </div>
        </article>`,
    )
    .join("");
}

function setStatus(message) {
  if (workspaceStatus) {
    workspaceStatus.textContent = message;
  }
}

async function loadSession() {
  const payload = await fetchJson("/api/auth/session");
  if (sessionSummary) {
    sessionSummary.textContent = `Signed in as ${payload.user.phone}`;
  }
}

async function refreshState() {
  const state = await fetchJson("/api/creator/state");

  renderKeyValueStack(
    projectSummary,
    state.project
      ? [
          { label: "Project", value: state.project.name },
          { label: "Phase", value: state.project.phase },
          { label: "Aspect", value: state.project.aspectRatio },
          { label: "Resolution", value: state.project.resolution },
        ]
      : [{ label: "Project", value: "Not created yet" }],
  );

  renderKeyValueStack(
    assetReviewSummary,
    state.assetReview
      ? [
          {
            label: "Ready",
            value: state.assetReview.readyForGeneration ? "Yes" : "No",
          },
          {
            label: "Required blockers",
            value: String(state.assetReview.requiredBlockers.length),
          },
          {
            label: "Warnings",
            value: String(state.assetReview.warningBlockers.length),
          },
        ]
      : [{ label: "Assets", value: "Waiting for script parse" }],
  );

  renderKeyValueStack(
    calibrationSummary,
    state.calibration
      ? [
          { label: "Status", value: state.calibration.status },
          { label: "Items", value: String(state.calibration.items.length) },
        ]
      : [{ label: "Calibration", value: "Not started" }],
  );

  renderKeyValueStack(generationSummary, [
    { label: "Shots", value: String(state.shots.length) },
    {
      label: "Shots with image",
      value: String(
        state.shots.filter((shot) => shot.currentImageAssetVersionId).length,
      ),
    },
    {
      label: "Shots with video",
      value: String(
        state.shots.filter((shot) => shot.currentVideoAssetVersionId).length,
      ),
    },
  ]);

  renderShots(state.shots);

  renderKeyValueStack(
    exportSummary,
    state.exportPreview
      ? [
          { label: "Status", value: state.exportPreview.status },
          { label: "Items", value: String(state.exportPreview.items.length) },
          {
            label: "Missing assets",
            value: String(state.exportPreview.missingAssets.length),
          },
        ]
      : [{ label: "Export", value: "No preview yet" }],
  );
}

async function runAction(message, work) {
  setStatus(message);
  try {
    await work();
    await refreshState();
    setStatus("Done.");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_error";
    setStatus(`Failed: ${detail}`);
  }
}

buttons.logout?.addEventListener("click", async () => {
  await fetchJson("/api/auth/logout", {
    method: "POST",
  });
  window.location.href = "/login.html";
});

buttons.createProject?.addEventListener("click", () =>
  runAction("Creating project...", async () => {
    await fetchJson("/api/creator/project/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: projectNameInput?.value ?? "Untitled Project",
        scriptInput: scriptInput?.value ?? "",
        aspectRatio: "9:16",
        resolution: "1080p",
      }),
    });
  }),
);

buttons.parseScript?.addEventListener("click", () =>
  runAction("Parsing script...", async () => {
    await fetchJson("/api/creator/parse", {
      method: "POST",
    });
  }),
);

buttons.confirmAssets?.addEventListener("click", () =>
  runAction("Confirming assets...", async () => {
    await fetchJson("/api/creator/assets/confirm-all", {
      method: "POST",
    });
  }),
);

buttons.runCalibration?.addEventListener("click", () =>
  runAction("Running calibration...", async () => {
    await fetchJson("/api/creator/calibration/run", {
      method: "POST",
    });
  }),
);

buttons.generateImages?.addEventListener("click", () =>
  runAction("Generating images...", async () => {
    await fetchJson("/api/creator/images/generate", {
      method: "POST",
    });
  }),
);

buttons.generateVideos?.addEventListener("click", () =>
  runAction("Generating videos...", async () => {
    await fetchJson("/api/creator/videos/generate", {
      method: "POST",
    });
  }),
);

buttons.previewExport?.addEventListener("click", () =>
  runAction("Building export preview...", async () => {
    await fetchJson("/api/creator/export/preview", {
      method: "POST",
    });
  }),
);

await loadSession();
await refreshState();
