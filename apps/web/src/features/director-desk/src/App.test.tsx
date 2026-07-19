import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { createInitialDirectorState, useDirectorStore } from "./editor/store/directorStore";
import type { DirectorDeskRecord } from "./editor/workspaces/directorDeskRegistry";

vi.mock("./editor/canvas/DirectorCanvas", () => ({
  DirectorCanvas: () => <div data-testid="mock-director-canvas" />,
}));

import App from "./App";

const timestamp = "2026-07-11T12:00:00.000Z";
let apiDirectorDesks: DirectorDeskRecord[];

function createDirectorDeskRecords(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `desk_${index + 1}`,
    name: `导演台 ${index + 1} 号`,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: null,
  }));
}

function apiResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ requestId: "request_test", data }),
  } as Response;
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/#director");
  apiDirectorDesks = createDirectorDeskRecords(4);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(typeof input === "string" ? input : input.toString(), window.location.origin).pathname;
    const method = init?.method ?? "GET";

    if (path === "/api/director-desks" && method === "GET") {
      return apiResponse({ desks: apiDirectorDesks });
    }

    if (path === "/api/director-desks" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { name?: string; deskKey?: string };
      const nextNumber = apiDirectorDesks.reduce((max, desk) => {
        const match = desk.id.match(/^desk_(\d+)$/);
        return Math.max(max, match ? Number(match[1]) : 0);
      }, 0) + 1;
      const desk = {
        id: body.deskKey ?? `desk_${nextNumber}`,
        name: body.name ?? `导演台 ${nextNumber} 号`,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastOpenedAt: null,
      };
      apiDirectorDesks = [...apiDirectorDesks, desk];
      return apiResponse({ desk });
    }

    const sceneMatch = path.match(/^\/api\/director-desks\/([^/]+)\/scene$/);
    if (sceneMatch) {
      const deskKey = decodeURIComponent(sceneMatch[1]);
      return apiResponse({ deskKey, scene: null });
    }

    const match = path.match(/^\/api\/director-desks\/([^/]+)(\/open)?$/);
    const id = decodeURIComponent(match?.[1] ?? "");
    const desk = apiDirectorDesks.find((record) => record.id === id);
    if (!desk) throw new Error(`Unknown director desk: ${id}`);

    if (method === "POST" && match?.[2] === "/open") {
      const openedDesk = { ...desk, lastOpenedAt: timestamp };
      apiDirectorDesks = apiDirectorDesks.map((record) => record.id === id ? openedDesk : record);
      return apiResponse({ desk: openedDesk });
    }

    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { name: string };
      const renamedDesk = { ...desk, name: body.name, updatedAt: timestamp };
      apiDirectorDesks = apiDirectorDesks.map((record) => record.id === id ? renamedDesk : record);
      return apiResponse({ desk: renamedDesk });
    }

    if (method === "DELETE") {
      apiDirectorDesks = apiDirectorDesks.filter((record) => record.id !== id);
      return apiResponse({ deletedDeskKey: id });
    }

    throw new Error(`Unhandled request: ${method} ${path}`);
  }));
  useDirectorStore.setState({
    ...useDirectorStore.getState(),
    ...createInitialDirectorState(),
  });
});

it("opens the director desk home before entering an integrated editor", async () => {
  const user = userEvent.setup();
  render(<App initialScreen="home" />);

  expect(screen.getByRole("heading", { name: "导演台" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "新建导演台" })).toBeInTheDocument();
  expect(screen.queryByTestId("mock-director-canvas")).not.toBeInTheDocument();
  expect((await screen.findAllByText("2026-07-11 20:00"))[0]).toBeInTheDocument();

  await user.click(await screen.findByRole("button", { name: "打开导演台 1 号" }));
  expect(await screen.findByTestId("mock-director-canvas")).toBeInTheDocument();
});

it("renders the anonymous director desk home without requesting desk data", async () => {
  const user = userEvent.setup();
  const onRequireLogin = vi.fn();

  render(<App initialScreen="home" authenticated={false} onRequireLogin={onRequireLogin} />);

  expect(screen.getByRole("heading", { name: "导演台" })).toBeInTheDocument();
  expect(screen.getByText("共 0 个")).toBeInTheDocument();
  await vi.waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  expect(fetch).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "新建导演台" }));
  expect(onRequireLogin).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});

it("does not create a director desk when the membership authorization is denied", async () => {
  const user = userEvent.setup();
  const onAuthorizeCreate = vi.fn().mockResolvedValue(false);

  render(<App initialScreen="home" onAuthorizeCreate={onAuthorizeCreate} />);
  await screen.findByRole("button", { name: "打开导演台 1 号" });
  await user.click(screen.getByRole("button", { name: "新建导演台" }));

  expect(onAuthorizeCreate).toHaveBeenCalledWith({ interactive: true });
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
});

it("keeps an empty director desk list without prompting during silent membership authorization", async () => {
  apiDirectorDesks = [];
  const onAuthorizeCreate = vi.fn().mockResolvedValue(false);

  render(<App initialScreen="home" onAuthorizeCreate={onAuthorizeCreate} />);

  await vi.waitFor(() => expect(onAuthorizeCreate).toHaveBeenCalledWith({ interactive: false }));
  expect(screen.getByText("共 0 个")).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
});

it("shows home loading feedback without inserting a placeholder into the desk grid", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.mocked(fetch);
  const defaultFetch = fetchMock.getMockImplementation()!;
  let resolveScene!: (response: Response) => void;
  const sceneResponse = new Promise<Response>((resolve) => {
    resolveScene = resolve;
  });

  render(<App initialScreen="home" />);
  const firstDeskButton = await screen.findByRole("button", { name: "打开导演台 1 号" });
  fetchMock.mockImplementation((input, init) => {
    const path = new URL(typeof input === "string" ? input : input.toString(), window.location.origin).pathname;
    if (path === "/api/director-desks/desk_1/scene") return sceneResponse;
    return defaultFetch(input, init);
  });

  await user.click(firstDeskButton);

  expect(screen.getByRole("status")).toHaveClass("director-home-status-toast");
  const deskList = screen.getByRole("region", { name: "导演台列表" });
  expect(deskList.firstElementChild).toHaveClass("director-desk-card");
  expect(deskList.firstElementChild).toContainElement(firstDeskButton.closest("article"));

  resolveScene(apiResponse({ deskKey: "desk_1", scene: null }));
  expect(await screen.findByTestId("mock-director-canvas")).toBeInTheDocument();
});

it("creates a first integrated director desk through the API when the list is empty", async () => {
  apiDirectorDesks = [];
  localStorage.setItem("standalone-3d-director-desk-registry-v1", "[]");

  render(<App initialScreen="home" />);

  expect(screen.getByRole("heading", { name: "导演台" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "打开导演台 1 号" })).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith("/api/director-desks", expect.objectContaining({
    method: "POST",
    credentials: "include",
  }));
});

it("migrates legacy local director desks before rendering the backend list", async () => {
  localStorage.setItem("lingxi-3d-director-desk-registry-v1", JSON.stringify([{
    id: "desk_legacy",
    name: "旧导演台",
    createdAt: timestamp,
    updatedAt: timestamp,
  }]));
  localStorage.setItem("storyai-3d-director-desk-demo:desk_legacy", JSON.stringify({
    viewMode: "director",
    project: { version: 1, objects: [] },
  }));

  render(<App initialScreen="home" />);

  expect(await screen.findByRole("button", { name: "打开旧导演台" })).toBeInTheDocument();
  const requests = vi.mocked(fetch).mock.calls;
  expect(requests).toEqual(expect.arrayContaining([
    ["/api/director-desks", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ name: "旧导演台", deskKey: "desk_legacy" }),
    })],
    ["/api/director-desks/desk_legacy/scene", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({
        scene: { viewMode: "director", project: { version: 1, objects: [] } },
        onlyIfEmpty: true,
      }),
    })],
  ]));
  expect(localStorage.getItem("lingxi-3d-director-desk-postgres-migration-v1")).toBe("complete");
  expect(localStorage.getItem("storyai-3d-director-desk-demo:desk_legacy")).not.toBeNull();
});

it("does not fall back to a cached director desk when the API request fails", async () => {
  localStorage.setItem("lingxi-3d-director-desk-registry-v1", JSON.stringify([{
    id: "desk_cached",
    name: "本地缓存导演台",
    createdAt: timestamp,
    updatedAt: timestamp,
  }]));
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status: 503,
    json: async () => ({}),
  } as Response);

  render(<App initialScreen="home" />);

  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText("导演台接口请求失败（503）")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "打开本地缓存导演台" })).not.toBeInTheDocument();
});

it("paginates director desks and supports renaming and deleting from the card menu", async () => {
  apiDirectorDesks = createDirectorDeskRecords(11);
  const user = userEvent.setup();
  render(<App initialScreen="home" />);

  expect(await screen.findByRole("button", { name: "打开导演台 10 号" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "打开导演台 11 号" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "下一页" }));
  expect(screen.getByRole("button", { name: "打开导演台 11 号" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "编辑导演台 11 号" }));
  await user.click(screen.getByRole("menuitem", { name: "重命名" }));
  const nameInput = screen.getByRole("textbox", { name: "导演台名称" });
  await user.clear(nameInput);
  await user.type(nameInput, "主场景导演台");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByRole("button", { name: "打开主场景导演台" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "编辑主场景导演台" }));
  await user.click(screen.getByRole("menuitem", { name: "删除" }));
  await user.click(screen.getByRole("button", { name: "确认删除" }));

  expect(await screen.findByRole("button", { name: "打开导演台 1 号" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "打开主场景导演台" })).not.toBeInTheDocument();
});

it("waits for the scoped scene before displaying the integrated editor", async () => {
  const fetchMock = vi.mocked(fetch);
  const defaultFetch = fetchMock.getMockImplementation()!;
  let resolveScene!: (response: Response) => void;
  const sceneResponse = new Promise<Response>((resolve) => {
    resolveScene = resolve;
  });
  fetchMock.mockImplementation((input, init) => {
    const path = new URL(typeof input === "string" ? input : input.toString(), window.location.origin).pathname;
    if (path === "/api/director-desks/desk_1/scene") return sceneResponse;
    return defaultFetch(input, init);
  });

  render(<App initialInstanceId="desk_1" />);

  expect(screen.getByRole("status")).toHaveTextContent("正在打开导演台");
  expect(screen.queryByTestId("mock-director-canvas")).not.toBeInTheDocument();

  resolveScene(apiResponse({ deskKey: "desk_1", scene: null }));

  expect(await screen.findByTestId("mock-director-canvas")).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "选择导演台" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "新建" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "操作手册" })).toBeInTheDocument();
  expect(window.location.search).toBe("");
  expect(window.location.hash).toBe("#director");
});

it("renders the director desk header and view mode switch", async () => {
  const { container } = render(<App initialInstanceId="desk_1" />);

  expect(await screen.findByText("3D导演台")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "导演视角" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "第一视角" })).toBeInTheDocument();
  expect(container.querySelector(".top-bar-center .mode-toggle")).toBeInTheDocument();
  expect(container.querySelector(".top-bar-center .viewport-sensitivity-settings")).not.toBeInTheDocument();
  expect(container.querySelector(".left-sidebar .object-tree-sensitivity .viewport-sensitivity-settings")).toBeInTheDocument();
  expect(screen.queryByLabelText("帮助")).not.toBeInTheDocument();
  expect(screen.getByLabelText("关闭")).toBeInTheDocument();
});

it("returns to the director desk home from the editor close action", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();

  render(<App initialInstanceId="desk_1" onClose={onClose} />);

  await user.click(await screen.findByRole("button", { name: "关闭" }));

  expect(screen.getByRole("heading", { name: "导演台" })).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});

it("opens the operation manual and closes it when clicking outside the dialog", async () => {
  const user = userEvent.setup();
  render(<App initialInstanceId="desk_1" />);

  await user.click(await screen.findByRole("button", { name: "操作手册" }));
  expect(screen.getByRole("dialog", { name: "键盘、鼠标与触控板操作" })).toBeInTheDocument();

  await user.click(screen.getByRole("heading", { name: "键盘、鼠标与触控板操作" }));
  expect(screen.getByRole("dialog", { name: "键盘、鼠标与触控板操作" })).toBeInTheDocument();

  await user.click(screen.getByRole("presentation"));
  expect(screen.queryByRole("dialog", { name: "键盘、鼠标与触控板操作" })).not.toBeInTheDocument();
});

it("uses a full-width director desk frame instead of floating card columns", async () => {
  const { container } = render(<App initialInstanceId="desk_1" />);
  await screen.findByLabelText("3D视口");
  const shell = container.querySelector(".director-shell.director-shell-fullbleed");

  expect(shell).toBeInTheDocument();
  expect(shell?.firstElementChild).toHaveClass("viewport-column");
  expect(screen.getByLabelText("场景")).toHaveClass("left-sidebar");
  expect(screen.getByLabelText("3D视口")).toHaveClass("viewport-column");
  expect(screen.getByLabelText("属性")).toHaveClass("right-sidebar");
});

it("collapses both side panels from the fullscreen toolbar action", async () => {
  const { container, rerender } = render(<App initialInstanceId="desk_1" />);
  await screen.findByLabelText("3D视口");

  expect(container.querySelector(".director-shell-fullbleed.is-sidebars-collapsed")).not.toBeInTheDocument();

  act(() => {
    useDirectorStore.setState({
      ...useDirectorStore.getState(),
      viewportPanelsCollapsed: true,
    } as ReturnType<typeof useDirectorStore.getState>);
  });
  rerender(<App initialInstanceId="desk_1" />);

  expect(container.querySelector(".director-shell-fullbleed.is-sidebars-collapsed")).toBeInTheDocument();
  expect(screen.getByLabelText("场景")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByLabelText("属性")).toHaveAttribute("aria-hidden", "true");
});

it("switches from director mode to camera mode", async () => {
  const user = userEvent.setup();
  render(<App initialInstanceId="desk_1" />);

  const directorButton = await screen.findByRole("button", { name: "导演视角" });
  const cameraButton = screen.getByRole("button", { name: "第一视角" });

  expect(directorButton).toHaveAttribute("aria-pressed", "true");
  expect(cameraButton).toHaveAttribute("aria-pressed", "false");

  await user.click(cameraButton);

  expect(directorButton).toHaveAttribute("aria-pressed", "false");
  expect(cameraButton).toHaveAttribute("aria-pressed", "true");
});

it("supports Cmd/Ctrl+C and Cmd/Ctrl+V to duplicate the selected object", async () => {
  const user = userEvent.setup();
  render(<App initialInstanceId="desk_1" />);

  await user.click(await screen.findByRole("button", { name: "角色01" }));
  await user.keyboard("{Control>}c{/Control}");
  await user.keyboard("{Control>}v{/Control}");

  const state = useDirectorStore.getState();
  const characters = state.project.objects.filter((item) => item.kind === "character");

  expect(characters).toHaveLength(2);
  expect(characters[1]?.id).not.toBe("char_default_a");
  expect(state.selectedObjectId).toBe(characters[1]?.id ?? null);
});

it("supports Cmd/Ctrl+Z to undo the latest scene edit", async () => {
  const user = userEvent.setup();
  render(<App initialInstanceId="desk_1" />);
  await screen.findByRole("button", { name: "角色01" });

  act(() => {
    useDirectorStore.getState().addPresetCharacter("female");
  });
  expect(useDirectorStore.getState().project.objects.some((item) => item.name === "角色02")).toBe(true);

  await user.keyboard("{Control>}z{/Control}");

  expect(useDirectorStore.getState().project.objects.some((item) => item.name === "角色02")).toBe(false);
});

it("ignores repeated Cmd/Ctrl+Z keydown events so holding the shortcut only undoes once", async () => {
  render(<App initialInstanceId="desk_1" />);
  await screen.findByRole("button", { name: "角色01" });
  act(() => {
    useDirectorStore.getState().addPresetCharacter("female");
    useDirectorStore.getState().addPresetCharacter("broad");
  });

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, repeat: false }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, repeat: true }));

  const characters = useDirectorStore.getState().project.objects.filter((item) => item.kind === "character");
  expect(characters).toHaveLength(2);
});
