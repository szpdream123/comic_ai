import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { createInitialDirectorState, useDirectorStore } from "./editor/store/directorStore";
import { writeDirectorDeskRecords } from "./editor/workspaces/directorDeskRegistry";

vi.mock("./editor/canvas/DirectorCanvas", () => ({
  DirectorCanvas: () => <div data-testid="mock-director-canvas" />,
}));

import App from "./App";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/#director");
  useDirectorStore.setState({
    ...useDirectorStore.getState(),
    ...createInitialDirectorState(),
  });
});

it("opens the integrated editor directly without a standalone director desk home", () => {
  const timestamp = "2026-07-11T12:00:00.000Z";
  writeDirectorDeskRecords([1, 2, 3, 4].map((number) => ({
    id: `desk_${number}`,
    name: `导演台 ${number} 号`,
    createdAt: timestamp,
    updatedAt: timestamp,
  })));
  render(<App />);

  expect(screen.getByTestId("mock-director-canvas")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "选择导演台" })).toHaveValue("desk_1");
  expect(screen.queryByRole("heading", { name: "选择一个导演台开始摆场景" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "新建导演台" })).not.toBeInTheDocument();
});

it("creates a first integrated director desk when an old empty registry is restored", () => {
  localStorage.setItem("standalone-3d-director-desk-registry-v1", "[]");

  render(<App />);

  expect(screen.getByRole("combobox", { name: "选择导演台" })).toHaveValue("desk_1");
  expect(screen.getByRole("option", { name: "导演台 1 号" })).toBeInTheDocument();
});

it("switches director desks inside the integrated editor without creating a standalone URL route", async () => {
  const user = userEvent.setup();
  const timestamp = "2026-07-11T12:00:00.000Z";
  writeDirectorDeskRecords([1, 2, 3, 4].map((number) => ({
    id: `desk_${number}`,
    name: `导演台 ${number} 号`,
    createdAt: timestamp,
    updatedAt: timestamp,
  })));

  render(<App />);
  await user.selectOptions(screen.getByRole("combobox", { name: "选择导演台" }), "desk_4");

  expect(screen.getByRole("combobox", { name: "选择导演台" })).toHaveValue("desk_4");
  expect(window.location.search).toBe("");
  expect(window.location.hash).toBe("#director");
});

it("renders the director desk header and view mode switch", () => {
  const { container } = render(<App />);

  expect(screen.getByText("3D导演台")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "导演视角" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "第一视角" })).toBeInTheDocument();
  expect(container.querySelector(".top-bar-center .mode-toggle")).toBeInTheDocument();
  expect(screen.queryByLabelText("帮助")).not.toBeInTheDocument();
  expect(screen.getByLabelText("关闭")).toBeInTheDocument();
});

it("returns to the Lingxi Theater host from both home and close actions", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();

  render(<App onClose={onClose} />);

  await user.click(screen.getByRole("button", { name: "返回首页" }));
  await user.click(screen.getByRole("button", { name: "关闭" }));

  expect(onClose).toHaveBeenCalledTimes(2);
});

it("uses a full-width director desk frame instead of floating card columns", () => {
  const { container } = render(<App />);
  const shell = container.querySelector(".director-shell.director-shell-fullbleed");

  expect(shell).toBeInTheDocument();
  expect(shell?.firstElementChild).toHaveClass("viewport-column");
  expect(screen.getByLabelText("场景")).toHaveClass("left-sidebar");
  expect(screen.getByLabelText("3D视口")).toHaveClass("viewport-column");
  expect(screen.getByLabelText("属性")).toHaveClass("right-sidebar");
});

it("collapses both side panels from the fullscreen toolbar action", async () => {
  const { container, rerender } = render(<App />);

  expect(container.querySelector(".director-shell-fullbleed.is-sidebars-collapsed")).not.toBeInTheDocument();

  act(() => {
    useDirectorStore.setState({
      ...useDirectorStore.getState(),
      viewportPanelsCollapsed: true,
    } as ReturnType<typeof useDirectorStore.getState>);
  });
  rerender(<App />);

  expect(container.querySelector(".director-shell-fullbleed.is-sidebars-collapsed")).toBeInTheDocument();
  expect(screen.getByLabelText("场景")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByLabelText("属性")).toHaveAttribute("aria-hidden", "true");
});

it("switches from director mode to camera mode", async () => {
  const user = userEvent.setup();
  render(<App />);

  const directorButton = screen.getByRole("button", { name: "导演视角" });
  const cameraButton = screen.getByRole("button", { name: "第一视角" });

  expect(directorButton).toHaveAttribute("aria-pressed", "true");
  expect(cameraButton).toHaveAttribute("aria-pressed", "false");

  await user.click(cameraButton);

  expect(directorButton).toHaveAttribute("aria-pressed", "false");
  expect(cameraButton).toHaveAttribute("aria-pressed", "true");
});

it("supports Cmd/Ctrl+C and Cmd/Ctrl+V to duplicate the selected object", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole("button", { name: "角色01" }));
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
  render(<App />);

  act(() => {
    useDirectorStore.getState().addPresetCharacter("female");
  });
  expect(useDirectorStore.getState().project.objects.some((item) => item.name === "角色02")).toBe(true);

  await user.keyboard("{Control>}z{/Control}");

  expect(useDirectorStore.getState().project.objects.some((item) => item.name === "角色02")).toBe(false);
});

it("ignores repeated Cmd/Ctrl+Z keydown events so holding the shortcut only undoes once", () => {
  render(<App />);
  act(() => {
    useDirectorStore.getState().addPresetCharacter("female");
    useDirectorStore.getState().addPresetCharacter("broad");
  });

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, repeat: false }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, repeat: true }));

  const characters = useDirectorStore.getState().project.objects.filter((item) => item.kind === "character");
  expect(characters).toHaveLength(2);
});
