import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";
import { createInitialDirectorState, useDirectorStore } from "../store/directorStore";
import { setDirectorDeskThemeRoot } from "../theme/themeRoot";
import {
  clearDirectorDeskNotificationHandler,
  setDirectorDeskNotificationHandler,
} from "../io/hostNotification";
import { MotionStudio } from "./MotionStudio";

beforeEach(() => {
  vi.stubGlobal("MediaRecorder", class {
    static isTypeSupported(type: string) {
      return type.startsWith("video/webm");
    }
  });
  useDirectorStore.setState({
    ...useDirectorStore.getState(),
    ...createInitialDirectorState(),
    motionStudioOpen: true,
    cameraPilotMode: "idle",
  });
});

afterEach(() => {
  clearDirectorDeskNotificationHandler();
  setDirectorDeskThemeRoot(null);
  vi.unstubAllGlobals();
});

it("presents a beginner-friendly shooting workflow with the final key bindings", () => {
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  expect(screen.getByRole("region", { name: "运镜工作台" })).toBeInTheDocument();
  expect(screen.getByText(/无需摆放机位/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "播放导演视角预演" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "播放第一视角运镜预演" })).toBeInTheDocument();
  expect(screen.getByText("空格")).toBeInTheDocument();
  expect(screen.getByText("E")).toBeInTheDocument();
  expect(screen.getByText("上升")).toBeInTheDocument();
  expect(screen.getByText("Q")).toBeInTheDocument();
  expect(screen.getByText("下降")).toBeInTheDocument();
  expect(screen.getByText("播放 / 暂停人物")).toBeInTheDocument();
  expect(screen.queryByText("Shift")).not.toBeInTheDocument();
  expect(screen.queryByText("自由录制")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("录制轨迹还原程度")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "锁定后只保持看向主体" })).toHaveAttribute("aria-pressed", "true");
});

it("plays the completed move from the camera first-person view", async () => {
  const user = userEvent.setup();
  useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [0, 2, 8],
    target: [0, 1, 0],
    fov: 50,
  });
  useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [3, 2, 4],
    target: [0, 1, 0],
    fov: 42,
  });
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  await user.click(screen.getByRole("button", { name: "播放第一视角运镜预演" }));

  expect(useDirectorStore.getState().viewMode).toBe("camera");
  expect(useDirectorStore.getState().cameraMotionPlaying).toBe(true);
});

it("automatically creates a hidden motion camera when the scene has no placed camera", async () => {
  const state = useDirectorStore.getState();
  useDirectorStore.setState({
    ...state,
    project: {
      ...state.project,
      cameras: [],
      activeCameraId: null,
      objects: state.project.objects.filter((item) => item.kind !== "camera"),
    },
  });

  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [5, 3, 2], target: [0, 1, 0], fov: 46 })} />);

  await waitFor(() => expect(screen.getByRole("region", { name: "运镜工作台" })).toBeInTheDocument());
  const nextState = useDirectorStore.getState();
  expect(nextState.project.cameras).toHaveLength(1);
  expect(nextState.project.cameras[0]).toMatchObject({
    name: "自动运镜镜头",
    isVirtual: true,
    fov: 46,
    target: [0, 1, 0],
  });
  expect(nextState.project.objects.some((item) => item.kind === "camera")).toBe(false);
  expect(nextState.project.activeCameraId).toBe(nextState.project.cameras[0].id);
});

it("starts pilot mode and records the current view as a numbered waypoint", async () => {
  const user = userEvent.setup();
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [3, 2, 7], target: [0, 1, 0], fov: 44 })} />);

  await user.click(screen.getByRole("button", { name: "手动掌镜" }));
  expect(useDirectorStore.getState().cameraPilotMode).toBe("pilot");

  useDirectorStore.getState().stopCameraPilot();
  await user.click(screen.getByRole("button", { name: "添加当前视角为轨迹点" }));

  expect(screen.getByRole("button", { name: "选择轨迹点 1" })).toBeInTheDocument();
  expect(useDirectorStore.getState().project.cameras[0].motionPath?.keyframes[0]).toMatchObject({
    position: [3, 2, 7],
    target: [0, 1, 0],
    fov: 44,
  });
});

it("copies the previous camera point when appending from the route list", async () => {
  const user = userEvent.setup();
  useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [0, 2, 8], target: [0, 1, 0], fov: 50,
  });
  useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [4, 3, 4], target: [1, 2, 0], fov: 44,
  });
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [99, 99, 99], target: [0, 0, 0], fov: 30 })} />);

  await user.click(screen.getByRole("button", { name: "复制上一轨迹点" }));

  expect(useDirectorStore.getState().project.cameras[0].motionPath?.keyframes).toHaveLength(3);
  expect(useDirectorStore.getState().project.cameras[0].motionPath?.keyframes[2]).toMatchObject({
    position: [4, 3, 4],
    target: [1, 2, 0],
    fov: 44,
  });
});

it("keeps the motion workspace available while a pilot camera route is playing", () => {
  useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [0, 2, 8], target: [0, 1, 0], fov: 50,
  });
  useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [4, 2, 4], target: [0, 1, 0], fov: 44,
  });
  useDirectorStore.setState({
    ...useDirectorStore.getState(),
    cameraPilotMode: "pilot",
    cameraMotionPlaying: true,
  });

  const { container } = render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  expect(container.querySelector(".motion-studio")).not.toHaveClass("is-piloting");
  expect(screen.getByRole("button", { name: "暂停导演视角预演" })).toBeInTheDocument();
});

it("deletes the entire camera route only after confirmation", async () => {
  const user = userEvent.setup();
  useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [0, 2, 8], target: [0, 1, 0], fov: 50,
  });
  useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [4, 2, 3], target: [0, 1, 0], fov: 42,
  });
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  await user.click(screen.getByRole("button", { name: "删除镜头移动点位" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("删除全部镜头移动点位？此操作将移除全部点位。");
  expect(useDirectorStore.getState().project.cameras[0].motionPath?.keyframes).toHaveLength(2);

  await user.click(screen.getByRole("button", { name: "取消" }));
  await user.click(screen.getByRole("button", { name: "删除镜头移动点位" }));
  await user.click(screen.getByRole("button", { name: "确认删除" }));
  expect(useDirectorStore.getState().project.cameras[0].motionPath?.keyframes).toEqual([]);
  expect(screen.getByText("还没有轨迹点")).toBeInTheDocument();
});

it("hands pilot startup to the viewport for direct mouse dragging", async () => {
  const user = userEvent.setup();
  const onStartPilot = vi.fn();
  render(
    <MotionStudio
      getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })}
      onStartPilot={onStartPilot}
    />
  );

  await user.click(screen.getByRole("button", { name: "手动掌镜" }));

  expect(onStartPilot).toHaveBeenCalledWith(null);
});

it("keeps character controls in the dedicated bottom transport instead of duplicating them", () => {
  useDirectorStore.setState({
    ...useDirectorStore.getState(),
    selectedObjectId: "char_default_a",
    selectedObjectIds: ["char_default_a"],
    cameraMotionProgress: 0.4,
  });
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  expect(screen.queryByRole("slider", { name: "全局动作时间轴" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /记录角色01在当前时间的位置/ })).not.toBeInTheDocument();
});

it("keeps reached and approaching waypoint states visible while route preview is paused", () => {
  const state = useDirectorStore.getState();
  useDirectorStore.setState({
    ...state,
    viewMode: "director",
    cameraMotionPlaying: false,
    cameraMotionProgress: 0.5,
    project: {
      ...state.project,
      cameras: state.project.cameras.map((camera) => ({
        ...camera,
        motionPath: {
          duration: 6,
          loop: false,
          interpolation: "smooth",
          easing: "ease-in-out",
          keyframes: [
            { id: "paused_point_1", time: 0, position: [0, 2, 8], target: [0, 1, 0], fov: 50 },
            { id: "paused_point_2", time: 0.5, position: [3, 2, 5], target: [0, 1, 0], fov: 46 },
            { id: "paused_point_3", time: 1, position: [5, 2, 2], target: [0, 1, 0], fov: 42 },
          ],
        },
      })),
    },
  });

  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  expect(screen.getByRole("button", { name: "选择轨迹点 1" })).toHaveClass("is-reached");
  expect(screen.getByRole("button", { name: "选择轨迹点 2" })).toHaveClass("is-reached");
  expect(screen.getByRole("button", { name: "选择轨迹点 3" })).toHaveClass("is-approaching");
});

it("inserts a new waypoint from the plus button between two route points", async () => {
  const user = userEvent.setup();
  useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [0, 2, 8], target: [0, 1, 0], fov: 50,
  });
  useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [6, 2, 2], target: [0, 1, 0], fov: 40,
  });
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  await user.click(screen.getByRole("button", { name: "在轨迹点 1 和 2 之间插入轨迹点" }));

  expect(screen.getByRole("button", { name: "选择轨迹点 3" })).toBeInTheDocument();
  expect(useDirectorStore.getState().project.cameras[0].motionPath?.keyframes).toHaveLength(3);
  expect(useDirectorStore.getState().cameraMotionProgress).toBe(0.5);
});

it("supports visible arbitrary multi-selection for moving points 1, 3, and 6 together", async () => {
  const user = userEvent.setup();
  for (let index = 0; index < 6; index += 1) {
    useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
      position: [index, 2, 8 - index], target: [0, 1, 0], fov: 50,
    });
  }
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  await user.click(screen.getByRole("button", { name: "批量选择并移动轨迹点" }));
  await user.click(screen.getByRole("button", { name: "清空轨迹点选择" }));
  await user.click(screen.getByRole("button", { name: "批量选择轨迹点 1" }));
  await user.click(screen.getByRole("button", { name: "批量选择轨迹点 3" }));
  await user.click(screen.getByRole("button", { name: "批量选择轨迹点 6" }));

  const keyframes = useDirectorStore.getState().project.cameras[0].motionPath?.keyframes ?? [];
  expect(useDirectorStore.getState().selectedCameraKeyframeIds).toEqual([
    keyframes[0].id,
    keyframes[2].id,
    keyframes[5].id,
  ]);
  expect(screen.getByText("已选 3 个点")).toBeInTheDocument();
});

it("lets every waypoint choose its own moving tracking target", async () => {
  const user = userEvent.setup();
  useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [0, 2, 8], target: [0, 1, 0], fov: 50,
  });
  useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [3, 2, 4], target: [0, 1, 0], fov: 44,
  });
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  await user.click(screen.getByRole("button", { name: "选择轨迹点 1" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "轨迹点跟踪主体" }), "char_default_a");

  let keyframes = useDirectorStore.getState().project.cameras[0].motionPath?.keyframes ?? [];
  expect(keyframes[0]).toMatchObject({ targetMode: "object", targetObjectId: "char_default_a" });
  expect(keyframes[1]).toMatchObject({ targetMode: "manual" });
  expect(screen.getByText("这个点会实时看向所选主体")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "选择轨迹点 2" }));
  expect(screen.getByRole("combobox", { name: "轨迹点跟踪主体" })).toHaveValue("");
  await user.selectOptions(screen.getByRole("combobox", { name: "轨迹点跟踪主体" }), "char_default_a");

  keyframes = useDirectorStore.getState().project.cameras[0].motionPath?.keyframes ?? [];
  expect(keyframes[1]).toMatchObject({ targetMode: "object", targetObjectId: "char_default_a" });
});

it("applies a motion parameter preset without replacing route points", async () => {
  const user = userEvent.setup();
  useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [0, 2, 8], target: [0, 1, 0], fov: 50,
  });
  useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [4, 2, 4], target: [0, 1, 0], fov: 42,
  });
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  await user.selectOptions(screen.getByRole("combobox", { name: "运镜参数预设" }), "fast-follow");

  const path = useDirectorStore.getState().project.cameras[0].motionPath;
  expect(path).toMatchObject({ duration: 3, interpolation: "smooth", easing: "linear" });
  expect(path?.keyframes).toHaveLength(2);
});

it("lets users retime an individual middle waypoint to control segment speed", async () => {
  const user = userEvent.setup();
  for (const position of [[0, 2, 8], [2, 2, 6], [5, 2, 3]] as [number, number, number][]) {
    useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", { position, target: [0, 1, 0], fov: 50 });
  }
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  const timeDisplay = screen.getByRole("button", { name: "轨迹点 2 到达时间，双击修改" });
  const waypointCard = timeDisplay.closest(".motion-waypoint-card");
  expect(waypointCard).not.toBeNull();
  expect(screen.queryByRole("spinbutton", { name: "轨迹点 2 到达时间" })).not.toBeInTheDocument();
  await user.dblClick(timeDisplay);
  const arrival = screen.getByRole("spinbutton", { name: "轨迹点 2 到达时间" });
  expect(waypointCard as HTMLElement).toContainElement(arrival);
  await user.clear(arrival);
  await user.type(arrival, "4");
  await user.tab();

  expect(useDirectorStore.getState().project.cameras[0].motionPath?.keyframes[1].time).toBeCloseTo(4 / 6);
  expect(screen.queryByRole("spinbutton", { name: "当前轨迹点到达时间" })).not.toBeInTheDocument();
});

it("deletes each waypoint from its own route card", async () => {
  const user = userEvent.setup();
  for (const position of [[0, 2, 8], [2, 2, 6], [5, 2, 3]] as [number, number, number][]) {
    useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", { position, target: [0, 1, 0], fov: 50 });
  }
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  expect(screen.getByRole("button", { name: "删除轨迹点 1" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "删除轨迹点 2" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "删除轨迹点 3" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "删除当前轨迹点" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "选择轨迹点 2" }).closest(".motion-waypoint-card"))
    .toContainElement(screen.getByRole("button", { name: "删除轨迹点 2" }));

  await user.click(screen.getByRole("button", { name: "删除轨迹点 2" }));
  await user.click(screen.getByRole("button", { name: "确认删除" }));

  expect(useDirectorStore.getState().project.cameras[0].motionPath?.keyframes).toHaveLength(2);
});

it("shows a reference video export entry", async () => {
  const user = userEvent.setup();
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  await user.click(screen.getByRole("button", { name: "导出运镜" }));
  expect(screen.getByRole("region", { name: "导出运镜设置" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "参考视频画质" })).toHaveValue("720p");
  expect(screen.getByRole("option", { name: "4K" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "2K" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "参考视频帧率" })).toHaveValue("30");
  expect(screen.getByRole("combobox", { name: "参考视频格式" })).toHaveValue("webm");
  expect(screen.getByText("当前浏览器不支持 MP4 格式导出，已显示当前可用格式。")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "导出 WebM" })).toBeInTheDocument();
});

it("explains why reference video export is unavailable", async () => {
  const user = userEvent.setup();
  const onNotify = vi.fn();
  setDirectorDeskNotificationHandler(onNotify);
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  await user.click(screen.getByRole("button", { name: "导出运镜" }));
  const exportButton = screen.getByRole("button", { name: "导出 WebM" });
  expect(exportButton).toHaveAttribute("aria-disabled", "true");
  expect(exportButton).not.toBeDisabled();

  await user.click(exportButton);

  expect(onNotify).toHaveBeenCalledWith("至少在运镜中添加两个跟拍", "error");
  expect(screen.queryByText("至少在运镜中添加两个跟拍")).not.toBeInTheDocument();
});

it("prefers MP4 when the browser supports it", async () => {
  vi.stubGlobal("MediaRecorder", class {
    static isTypeSupported(type: string) {
      return type.startsWith("video/mp4") || type.startsWith("video/webm");
    }
  });
  const user = userEvent.setup();
  render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

  await user.click(screen.getByRole("button", { name: "导出运镜" }));

  expect(screen.getByRole("combobox", { name: "参考视频格式" })).toHaveValue("mp4");
  expect(screen.queryByText(/当前浏览器不支持 MP4/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "导出 MP4" })).toBeInTheDocument();
});

it("places export controls in the top view switcher when it is available", async () => {
  const user = userEvent.setup();
  const directorDeskHost = document.createElement("div");
  const shadowRoot = directorDeskHost.attachShadow({ mode: "open" });
  const topBarCenter = document.createElement("div");
  topBarCenter.className = "top-bar-center";
  topBarCenter.dataset.directorExportHost = "true";
  shadowRoot.append(topBarCenter);
  document.body.append(directorDeskHost);
  setDirectorDeskThemeRoot(directorDeskHost);

  try {
    render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);
    const exportButton = within(topBarCenter).getByRole("button", { name: "导出运镜" });
    expect(topBarCenter).toContainElement(exportButton);

    await user.click(exportButton);

    expect(within(topBarCenter).getByRole("region", { name: "导出运镜设置" })).toBeInTheDocument();
  } finally {
    directorDeskHost.remove();
  }
});

it("keeps the export control visible when the motion studio is closed", () => {
  const directorDeskHost = document.createElement("div");
  const shadowRoot = directorDeskHost.attachShadow({ mode: "open" });
  const topBarCenter = document.createElement("div");
  topBarCenter.dataset.directorExportHost = "true";
  shadowRoot.append(topBarCenter);
  document.body.append(directorDeskHost);
  setDirectorDeskThemeRoot(directorDeskHost);
  useDirectorStore.setState({ ...useDirectorStore.getState(), motionStudioOpen: false });

  try {
    render(<MotionStudio getViewportCameraSnapshot={() => ({ position: [0, 2, 8], target: [0, 1, 0], fov: 50 })} />);

    expect(within(topBarCenter).getByRole("button", { name: "导出运镜" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "运镜工作台" })).not.toBeInTheDocument();
  } finally {
    directorDeskHost.remove();
  }
});
