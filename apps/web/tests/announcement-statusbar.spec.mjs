import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  handleWorkbenchActionForTest,
  initProductionWorkbench,
  syncAnnouncementsFromApiForTest,
} from "../src/features/production-workbench/index.js";
import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";

const productionWorkbenchCss = readFileSync(
  new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
  "utf8",
);

function createBaseState() {
  return {
    project: { id: "project-1", name: "测试项目", phase: "asset_review", aspectRatio: "9:16" },
    projectDetail: {
      project: { id: "project-1", projectId: "project-1", name: "测试项目" },
      episodes: [],
      assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
      shots: [],
    },
  };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("global statusbar renders announcement bell with unread dot and centered modal content", () => {
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { id: "user-1", phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "home",
      announcementUnread: true,
      announcementPanelOpen: true,
      announcementsLoaded: true,
      announcements: [{
        id: "announcement-1",
        title: "七月活动上线",
        summary: "限时套餐已开放",
        body: "本周开通专业版可获得额外积分。",
        actionLabel: "查看活动",
        actionUrl: "/pricing",
      }],
    },
  });

  assert.match(html, /data-action="open-announcements"/);
  assert.match(html, /announcement-unread-dot/);
  assert.doesNotMatch(html, /announcement-unread-mark/);
  assert.match(html, /aria-label="通知公告，有未读"/);
  assert.match(html, /id="announcement-panel-title"/);
  assert.match(html, /通知公告/);
  assert.match(html, /announcement-panel-dialog/);
  assert.match(html, /announcement-panel-close-icon/);
  assert.doesNotMatch(html, /announcement-panel-count/);
  assert.doesNotMatch(html, />×<\/button>/);
  assert.doesNotMatch(html, /活动、套餐与平台更新会在这里展示。/);
  assert.match(html, /七月活动上线/);
  assert.doesNotMatch(html, /限时套餐已开放/);
  assert.match(html, /本周开通专业版可获得额外积分。/);
  assert.match(html, /查看活动/);
});

test("announcement body typography uses the full card width for long text", () => {
  const itemHeadRule = productionWorkbenchCss.match(/\.announcement-item-head\s*\{[^}]+\}/)?.[0] ?? "";
  const bodyRule = productionWorkbenchCss.match(/\.announcement-body\s*\{[^}]+\}/)?.[0] ?? "";
  const signoffRule = productionWorkbenchCss.match(/\.announcement-signoff\s*\{[^}]+\}/)?.[0] ?? "";

  assert.match(itemHeadRule, /padding-bottom:\s*0\.72rem/);
  assert.match(itemHeadRule, /border-bottom:\s*1px solid/);
  assert.match(bodyRule, /width:\s*100%/);
  assert.match(bodyRule, /max-width:\s*none/);
  assert.match(bodyRule, /white-space:\s*pre-wrap/);
  assert.match(bodyRule, /text-align:\s*start/);
  assert.match(bodyRule, /overflow-wrap:\s*break-word/);
  assert.match(signoffRule, /text-align:\s*right/);
  assert.match(signoffRule, /align-self:\s*stretch/);
  assert.doesNotMatch(bodyRule, /font-family:\s*Consolas/);
  assert.doesNotMatch(bodyRule, /text-align:\s*justify/);
  assert.doesNotMatch(bodyRule, /overflow-wrap:\s*anywhere/);
});

test("announcement body renders trailing indented administrator signature as a right aligned signoff", () => {
  const body = "  创作路上，我们一直都在。\n      灵曦AI短剧运营团队";
  const html = renderProjectDetail({
    state: createBaseState(),
    session: { user: { id: "user-1", phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "home",
      announcementPanelOpen: true,
      announcementsLoaded: true,
      announcements: [{
        id: "announcement-1",
        title: "排版公告",
        body,
      }],
    },
  });
  const bodyHtml = html.match(/<p class="announcement-body">([\s\S]*?)<\/p>/)?.[1] ?? "";

  assert.match(bodyHtml, /  创作路上，我们一直都在。/);
  assert.doesNotMatch(bodyHtml, /灵曦AI短剧运营团队/);
  assert.match(html, /<p class="announcement-signoff">灵曦AI短剧运营团队<\/p>/);
  assert.doesNotMatch(html, /      灵曦AI短剧运营团队/);
  assert.doesNotMatch(html, /创作路上，我们一直都在。<br>\s*灵曦AI短剧运营团队/);
});

test("opening announcements stores the seen version for the current user only", async () => {
  const storage = createMemoryStorage();
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  const workbench = {
    root: { innerHTML: "", querySelector() { return null; } },
    state: createBaseState(),
    session: { user: { id: "user-1", phone: "+86 13800138000" } },
    api: {},
    ui: {
      activeNavTab: "home",
      projectPanelMode: "library",
      projectLibrary: [],
      storyboards: [],
      episodeStoryboardMap: {},
      customEpisodes: [],
      announcementVersion: "2026-07-02T10:00:00.000Z",
      announcementSeenVersion: "",
      announcementUnread: true,
      announcementsLoaded: true,
      announcementsLoading: false,
      announcements: [{ id: "announcement-1", title: "七月活动上线" }],
    },
  };

  try {
    await handleWorkbenchActionForTest(workbench, { dataset: { action: "open-announcements" } });
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }

  assert.equal(workbench.ui.announcementPanelOpen, true);
  assert.equal(workbench.ui.announcementSeenVersion, "2026-07-02T10:00:00.000Z");
  assert.equal(workbench.ui.announcementUnread, false);
  assert.equal(
    storage.getItem("comic-ai:announcements:lastSeen:user:user-1"),
    "2026-07-02T10:00:00.000Z",
  );
});

test("opening announcements while they are loading marks the loaded version as seen", async () => {
  const storage = createMemoryStorage();
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  const workbench = {
    root: { innerHTML: "", querySelector() { return null; } },
    state: createBaseState(),
    session: { user: { id: "user-1", phone: "+86 13800138000" } },
    api: {
      getAnnouncements: async () => ({
        announcements: [{ id: "announcement-1", title: "七月活动上线" }],
        version: "2026-07-02T10:00:00.000Z",
      }),
    },
    ui: {
      activeNavTab: "home",
      projectPanelMode: "library",
      projectLibrary: [],
      storyboards: [],
      episodeStoryboardMap: {},
      customEpisodes: [],
      announcementVersion: "",
      announcementSeenVersion: "",
      announcementUnread: false,
      announcementPanelOpen: false,
      announcementsLoaded: false,
      announcementsLoading: true,
      announcements: [],
    },
  };

  try {
    await handleWorkbenchActionForTest(workbench, { dataset: { action: "open-announcements" } });
    await syncAnnouncementsFromApiForTest(workbench);
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }

  assert.equal(workbench.ui.announcementPanelOpen, true);
  assert.equal(workbench.ui.announcementSeenVersion, "2026-07-02T10:00:00.000Z");
  assert.equal(workbench.ui.announcementUnread, false);
  assert.equal(
    storage.getItem("comic-ai:announcements:lastSeen:user:user-1"),
    "2026-07-02T10:00:00.000Z",
  );
});

test("syncing announcements preserves administrator body whitespace from api", async () => {
  const body = "  创作路上，我们一直都在。\n      灵曦AI短剧运营团队";
  const workbench = {
    root: { innerHTML: "", querySelector() { return null; } },
    state: createBaseState(),
    session: { user: { id: "user-1", phone: "+86 13800138000" } },
    api: {
      getAnnouncements: async () => ({
        announcements: [{ id: "announcement-1", title: "排版公告", summary: "旧摘要", body }],
        version: "2026-07-02T10:00:00.000Z",
      }),
    },
    ui: {
      activeNavTab: "home",
      projectPanelMode: "library",
      projectLibrary: [],
      storyboards: [],
      episodeStoryboardMap: {},
      customEpisodes: [],
      announcementVersion: "",
      announcementSeenVersion: "",
      announcementUnread: false,
      announcementPanelOpen: true,
      announcementsLoaded: false,
      announcementsLoading: false,
      announcements: [],
    },
  };

  await syncAnnouncementsFromApiForTest(workbench);
  const html = renderProjectDetail({
    state: createBaseState(),
    session: workbench.session,
    ui: workbench.ui,
  });

  assert.equal(workbench.ui.announcements[0]?.body, body);
  assert.equal("summary" in (workbench.ui.announcements[0] ?? {}), false);
  assert.match(html, /<p class="announcement-body">  创作路上，我们一直都在。<\/p>/);
  assert.match(html, /<p class="announcement-signoff">灵曦AI短剧运营团队<\/p>/);
});

test("older active announcement versions do not become unread after a newer version was seen", async () => {
  const storage = createMemoryStorage();
  storage.setItem("comic-ai:announcements:lastSeen:user:user-1", "2026-07-02T10:00:00.000Z");
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  const workbench = {
    root: { innerHTML: "", querySelector() { return null; } },
    state: createBaseState(),
    session: { user: { id: "user-1", phone: "+86 13800138000" } },
    api: {
      getAnnouncements: async () => ({
        announcements: [{ id: "announcement-older", title: "历史公告" }],
        version: "2026-07-02T09:00:00.000Z",
      }),
    },
    ui: {
      activeNavTab: "home",
      projectPanelMode: "library",
      projectLibrary: [],
      storyboards: [],
      episodeStoryboardMap: {},
      customEpisodes: [],
      announcementVersion: "",
      announcementSeenVersion: "",
      announcementUnread: false,
      announcementPanelOpen: false,
      announcementsLoaded: false,
      announcementsLoading: false,
      announcements: [],
    },
  };

  try {
    await syncAnnouncementsFromApiForTest(workbench);
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }

  assert.equal(workbench.ui.announcementSeenVersion, "2026-07-02T10:00:00.000Z");
  assert.equal(workbench.ui.announcementUnread, false);
});

test("team member announcements use a separate local read key from the owner user", async () => {
  const storage = createMemoryStorage();
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  globalThis.window = {
    location: { hash: "#home" },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.document = {
    body: { classList: { toggle() {} } },
    addEventListener() {},
    removeEventListener() {},
    createElement() {
      return { innerHTML: "", querySelector() { return null; } };
    },
    querySelectorAll() {
      return [];
    },
  };
  globalThis.localStorage = storage;
  globalThis.sessionStorage = createMemoryStorage();
  const root = {
    innerHTML: "",
    addEventListener() {},
    querySelector() { return null; },
  };

  try {
    await initProductionWorkbench({
      root,
      session: {
        user: {
          id: "owner-user",
          actorType: "team_member",
          teamMember: { id: "member-1", memberName: "剪辑师" },
        },
      },
      api: {
        getAnnouncements: async () => ({
          announcements: [{ id: "announcement-1", title: "七月活动上线" }],
          version: "2026-07-02T10:00:00.000Z",
        }),
        getSession: async () => ({ user: { id: "owner-user" } }),
        getMembershipStatus: async () => ({ data: { status: "none" } }),
      },
      onLogout() {},
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
    if (originalLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalLocalStorage;
    }
    if (originalSessionStorage === undefined) {
      delete globalThis.sessionStorage;
    } else {
      globalThis.sessionStorage = originalSessionStorage;
    }
  }

  assert.equal(storage.getItem("comic-ai:announcements:lastSeen:user:owner-user"), null);
  assert.equal(storage.getItem("comic-ai:announcements:lastSeen:team-member:member-1"), null);
  assert.match(root.innerHTML, /announcement-unread-dot/);
});

test("opening announcements as a team member writes the member read key", async () => {
  const storage = createMemoryStorage();
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  const workbench = {
    root: { innerHTML: "", querySelector() { return null; } },
    state: createBaseState(),
    session: {
      user: {
        id: "owner-user",
        actorType: "team_member",
        teamMember: { id: "member-1", memberName: "剪辑师" },
      },
    },
    api: {},
    ui: {
      activeNavTab: "home",
      projectPanelMode: "library",
      projectLibrary: [],
      storyboards: [],
      episodeStoryboardMap: {},
      customEpisodes: [],
      announcementVersion: "2026-07-02T10:00:00.000Z",
      announcementSeenVersion: "",
      announcementUnread: true,
      announcementsLoaded: true,
      announcementsLoading: false,
      announcements: [{ id: "announcement-1", title: "七月活动上线" }],
    },
  };

  try {
    await handleWorkbenchActionForTest(workbench, { dataset: { action: "open-announcements" } });
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }

  assert.equal(storage.getItem("comic-ai:announcements:lastSeen:user:owner-user"), null);
  assert.equal(
    storage.getItem("comic-ai:announcements:lastSeen:team-member:member-1"),
    "2026-07-02T10:00:00.000Z",
  );
});
