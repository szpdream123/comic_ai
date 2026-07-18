import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach } from "vitest";
import { createInitialDirectorState, useDirectorStore } from "../store/directorStore";
import { getObjectMotionSnapshot } from "../schema/objectMotion";
import { CharacterPanel } from "./CharacterPanel";

beforeEach(() => {
  useDirectorStore.setState({
    ...useDirectorStore.getState(),
    ...createInitialDirectorState(),
    selectedObjectId: "char_default_a",
  });
});

it("renders the approved role property order", () => {
  render(<CharacterPanel />);

  expect(screen.getByLabelText("角色名称")).toBeInTheDocument();
  expect(screen.getByLabelText("角色位置 X")).toBeInTheDocument();
  expect(screen.getByLabelText("角色旋转 X")).toBeInTheDocument();
  expect(screen.getByLabelText("角色缩放 X")).toBeInTheDocument();
  expect(screen.getByLabelText("角色统一缩放")).toBeInTheDocument();
  expect(screen.getByLabelText("角色颜色")).toBeInTheDocument();
});

it("displays role transform axes with consistent two-decimal precision without rounding stored values", () => {
  const position: [number, number, number] = [-2.8779, 1.4944, 0.8368];
  const rotation: [number, number, number] = [-0.1209, 0.2815, -0.0304];
  const scale: [number, number, number] = [1, 1, 1];
  useDirectorStore.getState().updateObjectTransform("char_default_a", { position, rotation, scale });

  render(<CharacterPanel />);

  const positionX = screen.getByLabelText("角色位置 X") as HTMLInputElement;
  expect(positionX.value).toBe("-2.88");
  expect((screen.getByLabelText("角色位置 Y") as HTMLInputElement).value).toBe("1.49");
  expect((screen.getByLabelText("角色位置 Z") as HTMLInputElement).value).toBe("0.84");
  expect((screen.getByLabelText("角色旋转 X") as HTMLInputElement).value).toBe("-0.12");
  expect((screen.getByLabelText("角色缩放 X") as HTMLInputElement).value).toBe("1.00");

  expect(useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a")?.transform).toMatchObject({
    position,
    rotation,
    scale,
  });

  fireEvent.focus(positionX);
  expect(positionX.value).toBe("-2.8779");
  fireEvent.blur(positionX);
  expect(positionX.value).toBe("-2.88");
});

it("keeps character creation-only body type controls out of the role property panel", () => {
  render(<CharacterPanel />);

  const content = document.querySelector(".right-inspector-content");
  expect(content).toBeInTheDocument();

  const labels = Array.from(content?.querySelectorAll(".inspector-field-label, .inspector-section h3") ?? []).map((item) =>
    item.textContent?.trim()
  );

  expect(labels).toEqual(["名称", "位置", "旋转", "缩放", "统一缩放", "颜色"]);
  expect(screen.queryByText("体型")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "二头身" })).not.toBeInTheDocument();
});

it("keeps role axis labels exactly 10px above their coordinate rows", () => {
  render(<CharacterPanel />);

  ["位置", "旋转", "缩放"].forEach((label) => {
    const group = screen.getByRole("group", { name: label });

    expect(group).toHaveClass("inspector-axis-group");
    expect(group.tagName).toBe("DIV");
  });
});

it("uses the provided right inspector layout for role properties", () => {
  const { container } = render(<CharacterPanel />);

  expect(screen.getByLabelText("角色右侧属性面板")).toHaveClass("right-inspector", "character-inspector");
  expect(container.querySelector(".right-inspector-header")).toBeInTheDocument();
  expect(container.querySelector(".right-inspector-tabs")).toBeInTheDocument();
  expect(container.querySelector(".right-inspector-content")).toBeInTheDocument();

  const positionX = screen.getByLabelText("角色位置 X").closest(".inspector-axis-input");
  const colorRow = screen.getByLabelText("角色颜色 HEX").closest(".inspector-color-row");

  expect(positionX).toBeInTheDocument();
  expect(within(positionX as HTMLElement).getByText("X")).toHaveClass("inspector-axis-prefix");
  expect(colorRow).toBeInTheDocument();
  expect(screen.getByLabelText("角色颜色")).toHaveClass("inspector-color-swatch");
});

it("marks the pose adjustment section for the compact character inspector layout", async () => {
  const user = userEvent.setup();
  render(<CharacterPanel />);

  await user.click(screen.getByRole("button", { name: "姿势" }));

  expect(screen.getByText("姿势预设").closest(".inspector-section")).toHaveClass("pose-preset-section");
  expect(screen.getByText("姿势调节").closest(".inspector-section")).toHaveClass("pose-adjust-section");
});

it("keeps the pose inspector and viewport pose tool in sync", async () => {
  const user = userEvent.setup();
  render(<CharacterPanel />);

  await user.click(screen.getByRole("button", { name: "姿势" }));
  expect(useDirectorStore.getState().transformMode).toBe("pose");

  await user.click(screen.getByRole("button", { name: "属性" }));
  expect(useDirectorStore.getState().transformMode).toBe("translate");
});

it("adjusts axis values by dragging the gray XYZ prefix handles", () => {
  render(<CharacterPanel />);

  const dragHandle = screen.getByRole("button", { name: "角色位置 X 拖动调整" });

  fireEvent.mouseDown(dragHandle, { button: 0, clientX: 100 });
  fireEvent.mouseMove(window, { clientX: 120 });
  fireEvent.mouseUp(window);

  const role = useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a");
  expect(role?.transform.position[0]).toBe(2);
  expect(screen.getByLabelText("角色位置 X")).toHaveValue(2);
});

it("keeps the property coordinates and a routed character synchronized at the current timeline time", async () => {
  const user = userEvent.setup();
  useDirectorStore.getState().addObjectMotionKeyframe("char_default_a", 0);
  useDirectorStore.getState().updateObjectTransform("char_default_a", { position: [10, 0, 0] });
  useDirectorStore.getState().addObjectMotionKeyframe("char_default_a", 1);
  useDirectorStore.getState().setCameraMotionProgress(0.5);

  render(<CharacterPanel />);

  expect(screen.getByLabelText("角色位置 X")).toHaveValue(5);

  await user.clear(screen.getByLabelText("角色位置 X"));
  await user.type(screen.getByLabelText("角色位置 X"), "7");

  const character = useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a")!;
  expect(screen.getByLabelText("角色位置 X")).toHaveValue(7);
  expect(getObjectMotionSnapshot(character, 0.5).position[0]).toBe(7);
  expect(character.motionPath?.keyframes.map((item) => item.transform.position[0])).toEqual([2, 12]);
});

it("updates the selected role name and uniform scale", async () => {
  const user = userEvent.setup();
  render(<CharacterPanel />);

  await user.clear(screen.getByLabelText("角色名称"));
  await user.type(screen.getByLabelText("角色名称"), "主角");
  await user.clear(screen.getByLabelText("角色统一缩放"));
  await user.type(screen.getByLabelText("角色统一缩放"), "1.2");

  const role = useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a");
  expect(role?.name).toBe("主角");
  expect(role?.transform.scale).toEqual([1.2, 1.2, 1.2]);
});

it("updates role rotation, per-axis scale, and hex color fields", async () => {
  const user = userEvent.setup();
  render(<CharacterPanel />);

  await user.clear(screen.getByLabelText("角色旋转 Y"));
  await user.type(screen.getByLabelText("角色旋转 Y"), "15");
  await user.clear(screen.getByLabelText("角色缩放 Z"));
  await user.type(screen.getByLabelText("角色缩放 Z"), "1.4");
  await user.clear(screen.getByLabelText("角色颜色 HEX"));
  await user.type(screen.getByLabelText("角色颜色 HEX"), "#123456");

  const role = useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a");
  expect(role?.transform.rotation).toEqual([0, 15, 0]);
  expect(role?.transform.scale).toEqual([1, 1, 1.4]);
  expect(role?.color).toBe("#123456");
});

it("updates every member in a selected crowd group from the property panel", async () => {
  const user = userEvent.setup();
  useDirectorStore.getState().addCrowdCharacters({ rows: 2, columns: 2, spacing: 1.2 });
  useDirectorStore.getState().selectCrowd("crowd_1");

  render(<CharacterPanel />);

  await user.clear(screen.getByLabelText("角色颜色 HEX"));
  await user.type(screen.getByLabelText("角色颜色 HEX"), "#123456");

  const crowdMembers = useDirectorStore
    .getState()
    .project.objects.filter((item) => item.kind === "character" && item.crowdId === "crowd_1");

  expect(crowdMembers).toHaveLength(4);
  expect(new Set(crowdMembers.map((item) => item.color))).toEqual(new Set(["#123456"]));
});

it("applies pose presets to every member in a selected crowd group", async () => {
  const user = userEvent.setup();
  useDirectorStore.getState().addCrowdCharacters({ rows: 2, columns: 2, spacing: 1.2 });
  useDirectorStore.getState().selectCrowd("crowd_1");

  render(<CharacterPanel />);

  await user.click(screen.getByRole("button", { name: "姿势" }));
  await user.click(screen.getByRole("button", { name: "T型" }));

  const crowdMembers = useDirectorStore
    .getState()
    .project.objects.filter((item) => item.kind === "character" && item.crowdId === "crowd_1");

  expect(crowdMembers).toHaveLength(4);
  expect(new Set(crowdMembers.map((item) => item.characterRig?.posePresetId))).toEqual(new Set(["t-pose"]));
  expect(new Set(crowdMembers.map((item) => item.characterRig?.controls["leftShoulder.spread"]))).toEqual(new Set([-70]));
});

it("selects and starts a character action preset", async () => {
  const user = userEvent.setup();
  render(<CharacterPanel />);

  await user.click(screen.getByRole("button", { name: "动作" }));
  await user.click(screen.getByRole("button", { name: "播放动作 正常行走" }));

  const state = useDirectorStore.getState();
  const role = state.project.objects.find((item) => item.id === "char_default_a");
  expect(role?.characterRig?.actionPresetId).toBe("walk-cycle");
  expect(state.cameraMotionPlaying).toBe(true);
  expect(state.cameraMotionProgress).toBe(0);
});

it("adds and edits a route point from the character route tab", async () => {
  const user = userEvent.setup();
  render(<CharacterPanel />);

  await user.click(screen.getByRole("button", { name: "路线" }));
  await user.click(screen.getByRole("button", { name: "添加点" }));

  expect(screen.getByRole("button", { name: "选择路线点 1" })).toHaveAttribute("aria-pressed", "true");
  await user.selectOptions(screen.getByLabelText("路线点本段动作"), "run-cycle");
  await user.selectOptions(screen.getByLabelText("路线点朝向方式"), "path");

  const point = useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a")?.motionPath?.keyframes[0];
  expect(point?.actionPresetId).toBe("run-cycle");
  expect(point?.facingMode).toBe("path");
});

it("toggles freehand route drawing for the selected character", async () => {
  const user = userEvent.setup();
  render(<CharacterPanel />);

  await user.click(screen.getByRole("button", { name: "路线" }));
  const drawButton = screen.getByRole("button", { name: "绘制人物路线" });

  expect(drawButton).toHaveAttribute("aria-pressed", "false");
  expect(drawButton).toHaveTextContent("手绘人物路线");
  await user.click(drawButton);
  expect(drawButton).toHaveAttribute("aria-pressed", "true");
  expect(drawButton).toHaveTextContent("结束手绘路线");
  expect(useDirectorStore.getState().characterRouteDrawingObjectId).toBe("char_default_a");

  await user.click(drawButton);
  expect(useDirectorStore.getState().characterRouteDrawingObjectId).toBeNull();
});

it("selects a route point without moving the scene preview until explicitly requested", async () => {
  const user = userEvent.setup();
  useDirectorStore.getState().addCharacterRoutePoint("char_default_a");
  useDirectorStore.getState().addCharacterRoutePoint("char_default_a");
  useDirectorStore.getState().setCameraMotionProgress(0.25);
  render(<CharacterPanel />);

  await user.click(screen.getByRole("button", { name: "路线" }));
  await user.click(screen.getByRole("button", { name: "选择路线点 2" }));
  expect(useDirectorStore.getState().cameraMotionProgress).toBe(0.25);

  await user.click(screen.getByRole("button", { name: "预览当前路线点" }));
  expect(useDirectorStore.getState().cameraMotionProgress).toBe(1);
});

it("marquee-selects route points and deletes them together", async () => {
  const user = userEvent.setup();
  const pointIds = Array.from({ length: 4 }, () => useDirectorStore.getState().addCharacterRoutePoint("char_default_a"));
  render(<CharacterPanel />);

  await user.click(screen.getByRole("button", { name: "路线" }));
  const pointList = screen.getByRole("group", { name: "人物路线点列表" });
  const pointButtons = Array.from({ length: 4 }, (_, index) => screen.getByRole("button", { name: `选择路线点 ${index + 1}` }));
  Object.defineProperty(pointList, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 220, bottom: 80, width: 220, height: 80, x: 0, y: 0, toJSON: () => ({}) }),
  });
  pointButtons.forEach((button, index) => {
    const left = 10 + index * 50;
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left, top: 10, right: left + 40, bottom: 42, width: 40, height: 32, x: left, y: 10, toJSON: () => ({}) }),
    });
  });

  fireEvent.pointerDown(pointList, { pointerId: 1, button: 0, clientX: 5, clientY: 5 });
  fireEvent.pointerMove(pointList, { pointerId: 1, clientX: 105, clientY: 50 });
  fireEvent.pointerUp(pointList, { pointerId: 1, clientX: 105, clientY: 50 });

  expect(pointButtons[0]).toHaveAttribute("aria-pressed", "true");
  expect(pointButtons[1]).toHaveAttribute("aria-pressed", "true");
  expect(pointButtons[2]).toHaveAttribute("aria-pressed", "false");
  expect(pointButtons[3]).toHaveAttribute("aria-pressed", "false");

  await user.click(screen.getByRole("button", { name: "删除选中的 2 个路线点" }));
  await user.click(screen.getByRole("button", { name: "确认删除" }));

  const remainingIds = useDirectorStore.getState().project.objects
    .find((item) => item.id === "char_default_a")
    ?.motionPath?.keyframes.map((point) => point.id);
  expect(remainingIds).toEqual(pointIds.slice(2));

  useDirectorStore.getState().undo();
  expect(useDirectorStore.getState().project.objects
    .find((item) => item.id === "char_default_a")
    ?.motionPath?.keyframes.map((point) => point.id)).toEqual(pointIds);
});

it("switches the character route between smooth curve and straight line", async () => {
  const user = userEvent.setup();
  render(<CharacterPanel />);

  await user.click(screen.getByRole("button", { name: "路线" }));
  await user.click(screen.getByRole("button", { name: "直线" }));

  let role = useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a");
  expect(role?.motionPath?.interpolation).toBe("linear");
  expect(screen.getByRole("button", { name: "直线" })).toHaveAttribute("aria-pressed", "true");

  await user.click(screen.getByRole("button", { name: "平滑曲线" }));
  role = useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a");
  expect(role?.motionPath?.interpolation).toBe("smooth");
});
