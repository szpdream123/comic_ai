import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderLibraryTeam } from "../src/features/library-team/index.js";
import {
  handleTeamAssetLocalUploadFiles,
  removeTeamAssetLocalUpload,
} from "../src/features/production-workbench/index.js";
import { validateTeamAssetLocalUploadFile } from "../src/features/library-team/asset-library-page.js";

function createRoot() {
  return {
    innerHTML: "",
    querySelector() {
      return null;
    },
  };
}

function createWorkbench(overrides = {}) {
  const uploadCalls = [];
  const root = createRoot();
  const workbench = {
    root,
    state: {},
    session: { user: { phone: "13800138000" } },
    api: {
      async uploadFile(file, options = {}) {
        uploadCalls.push({ file, options });
        return {
          upload: {
            provider: "cos",
            uploadSessionId: `session-${uploadCalls.length}`,
            storageObjectId: `storage-${uploadCalls.length}`,
            storageObjectKey: `team-assets/${options.category}/${file.name}`,
            publicUrl: `https://cdn.example.com/${options.category}/${file.name}`,
            sourceUrl: `https://cdn.example.com/${options.category}/${file.name}`,
            mimeType: file.type || "application/octet-stream",
            byteSize: file.size ?? 0,
            originalFileName: file.name,
          },
        };
      },
    },
    ui: {
      activeNavTab: "library",
      busy: false,
      toast: "",
      exportHistory: [],
      storyboards: [],
      libraryTeamAssetScope: "team",
      libraryCategory: "character",
      libraryFolder: "",
      libraryQuery: "",
      libraryEntitlement: {
        hasTeamAssetLibrary: true,
      },
      teamAssetLocalUploads: {
        character: [],
        scene: [],
        prop: [],
        voice: [],
      },
      ...overrides.ui,
    },
  };

  return { workbench, root, uploadCalls };
}

describe("team asset local uploads", () => {
  it("renders uploaded image previews and persists cloud storage metadata", async () => {
    const globals = globalThis;
    const originalFileReader = globals.FileReader;
    const originalWindow = globals.window;
    const originalDocument = globals.document;

    class TestFileReader {
      result = "";
      error = null;
      onload = null;
      onerror = null;

      readAsDataURL(file) {
        this.result = `data:${file.type || "application/octet-stream"};base64,cHJldmlldw==`;
        queueMicrotask(() => this.onload?.());
      }
    }

    globals.FileReader = TestFileReader;
    globals.window = { scrollX: 0, scrollY: 0 };
    globals.document = {
      scrollingElement: { scrollLeft: 0, scrollTop: 0 },
      documentElement: { scrollLeft: 0, scrollTop: 0 },
    };

    try {
      const { workbench, root, uploadCalls } = createWorkbench();

      await handleTeamAssetLocalUploadFiles(workbench, "character", [
        { name: "hero.png", type: "image/png", size: 1536, lastModified: 1 },
      ]);

      const [upload] = workbench.ui.teamAssetLocalUploads.character;
      assert.equal(uploadCalls.length, 1);
      assert.equal(uploadCalls[0].options.category, "team-assets/character");
      assert.equal(upload.storageObjectId, "storage-1");
      assert.equal(upload.uploadSessionId, "session-1");
      assert.equal(upload.sourceUrl, "https://cdn.example.com/team-assets/character/hero.png");
      assert.match(upload.previewUrl, /^data:image\/png;base64,/);
      assert.match(root.innerHTML, /hero/);
      assert.match(root.innerHTML, /data:image\/png;base64,cHJldmlldw==/);
      assert.match(root.innerHTML, /data-action="delete-team-asset-local-upload"/);
      assert.doesNotMatch(root.innerHTML, /本地上传，待同步/);
      assert.doesNotMatch(root.innerHTML, /已同步到团队云端/);
      assert.doesNotMatch(root.innerHTML, /library-team-local-upload-status/);
    } finally {
      if (originalFileReader) {
        globals.FileReader = originalFileReader;
      } else {
        delete globals.FileReader;
      }
      if (originalWindow) {
        globals.window = originalWindow;
      } else {
        delete globals.window;
      }
      if (originalDocument) {
        globals.document = originalDocument;
      } else {
        delete globals.document;
      }
    }
  });

  it("renders uploaded voice previews and removes them from the visible list", async () => {
    const urlApi = globalThis.URL;
    const originalCreateObjectURL = urlApi.createObjectURL;
    urlApi.createObjectURL = () => "blob:http://localhost/team-voice";

    try {
      const { workbench, root, uploadCalls } = createWorkbench({
        ui: {
          libraryCategory: "voice",
        },
      });

      await handleTeamAssetLocalUploadFiles(workbench, "voice", [
        { name: "narrator.mp3", type: "audio/mpeg", size: 2048, lastModified: 2 },
      ]);

      const [upload] = workbench.ui.teamAssetLocalUploads.voice;
      assert.equal(uploadCalls.length, 1);
      assert.equal(uploadCalls[0].options.category, "team-assets/voice");
      assert.equal(upload.storageObjectId, "storage-1");
      assert.match(root.innerHTML, /narrator/);
      assert.match(root.innerHTML, /<audio[^>]+controls/);
      assert.match(root.innerHTML, /blob:http:\/\/localhost\/team-voice/);
      assert.match(root.innerHTML, /data-action="delete-team-asset-local-upload"/);

      assert.equal(removeTeamAssetLocalUpload(workbench.ui, "voice", upload.id), true);
      assert.deepEqual(workbench.ui.teamAssetLocalUploads.voice, []);
    } finally {
      if (originalCreateObjectURL) {
        urlApi.createObjectURL = originalCreateObjectURL;
      } else {
        delete urlApi.createObjectURL;
      }
    }
  });

  it("hides upload controls when team asset library membership is locked", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      libraryCategory: "character",
      libraryEntitlement: {
        hasTeamAssetLibrary: false,
        blockReason: "team_asset_library_entitlement_required",
      },
      teamAssetLocalUploads: {
        character: [
          {
            id: "local-locked",
            name: "locked-hero",
            previewUrl: "data:image/png;base64,locked",
          },
        ],
      },
    });

    assert.doesNotMatch(html, /data-action="pick-team-asset-local-upload"/);
    assert.doesNotMatch(html, /class="team-asset-local-upload-input"/);
    assert.doesNotMatch(html, /locked-hero/);
    assert.match(html, /open-pricing/);
  });

  it("keeps the team asset library separate from the official asset browser", () => {
    const html = renderLibraryTeam({
      route: "assets",
      assetScope: "team",
      libraryCategory: "character",
      libraryFolder: "国内仿真人-现代都市",
      libraryFolders: ["国内仿真人-现代都市", "国内仿真人-东方古代"],
      libraryEntitlement: {
        hasTeamAssetLibrary: true,
      },
      teamAssetLocalUploads: {
        character: [
          {
            id: "team-cloud-asset",
            category: "character",
            name: "团队角色",
            previewUrl: "https://cdn.example.com/team-assets/character/hero.png",
            sourceUrl: "https://cdn.example.com/team-assets/character/hero.png",
            storageObjectId: "storage-1",
            sizeLabel: "53 KB",
            mimeType: "image/jpeg",
          },
        ],
      },
    });

    assert.match(html, /团队角色/);
    assert.doesNotMatch(html, /本地上传，待同步/);
    assert.doesNotMatch(html, /已同步到团队云端/);
    assert.doesNotMatch(html, /library-team-local-upload-status/);
    assert.doesNotMatch(html, /library-team-folder-list/);
    assert.doesNotMatch(html, /国内仿真人-现代都市/);
  });

  it("blocks locked team uploads without creating previews or calling cloud storage", async () => {
    const globals = globalThis;
    const originalFileReader = globals.FileReader;
    const originalWindow = globals.window;
    const originalDocument = globals.document;

    class TestFileReader {
      result = "";
      error = null;
      onload = null;
      onerror = null;

      readAsDataURL(file) {
        this.result = `data:${file.type || "application/octet-stream"};base64,bG9jYWw=`;
        queueMicrotask(() => this.onload?.());
      }
    }

    globals.FileReader = TestFileReader;
    globals.window = { scrollX: 0, scrollY: 0 };
    globals.document = {
      scrollingElement: { scrollLeft: 0, scrollTop: 0 },
      documentElement: { scrollLeft: 0, scrollTop: 0 },
    };

    try {
      const { workbench, root, uploadCalls } = createWorkbench({
        ui: {
          libraryEntitlement: {
            hasTeamAssetLibrary: false,
            blockReason: "team_asset_library_entitlement_required",
          },
        },
      });

      await handleTeamAssetLocalUploadFiles(workbench, "character", [
        { name: "locked-hero.png", type: "image/png", size: 1024, lastModified: 3 },
      ]);

      assert.equal(uploadCalls.length, 0);
      assert.deepEqual(workbench.ui.teamAssetLocalUploads.character, []);
      assert.equal(workbench.ui.isLibraryPricingModalOpen, true);
      assert.doesNotMatch(root.innerHTML, /locked-hero/);
      assert.doesNotMatch(root.innerHTML, /data-action="delete-team-asset-local-upload"/);
    } finally {
      if (originalFileReader) {
        globals.FileReader = originalFileReader;
      } else {
        delete globals.FileReader;
      }
      if (originalWindow) {
        globals.window = originalWindow;
      } else {
        delete globals.window;
      }
      if (originalDocument) {
        globals.document = originalDocument;
      } else {
        delete globals.document;
      }
    }
  });

  it("accepts extension-only files but rejects mismatched MIME disguises", () => {
    assert.equal(
      validateTeamAssetLocalUploadFile("scene", { name: "street.webp", type: "" }).ok,
      true,
    );
    assert.equal(
      validateTeamAssetLocalUploadFile("character", { name: "renamed.jpg", type: "application/pdf" }).ok,
      false,
    );
    assert.equal(
      validateTeamAssetLocalUploadFile("voice", { name: "narrator.aac", type: "" }).ok,
      true,
    );
  });
});
