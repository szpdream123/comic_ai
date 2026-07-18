import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { createInitialDirectorState, useDirectorStore } from "../store/directorStore";
import { AnimationTimeline } from "./AnimationTimeline";

beforeEach(() => {
  const initialState = createInitialDirectorState();
  useDirectorStore.setState({
    ...useDirectorStore.getState(),
    ...initialState,
    cameraMotionProgress: 0,
    cameraMotionPlaying: false,
  });
});

it("uses the shared animation progress and camera loop controls", async () => {
  const user = userEvent.setup();
  render(<AnimationTimeline onClose={() => undefined} />);

  expect(screen.getByRole("region", { name: "时间动画轴" })).toBeInTheDocument();
  expect(screen.getByRole("slider", { name: "时间轴游标" })).toHaveValue("0");

  fireEvent.change(screen.getByRole("slider", { name: "时间轴游标" }), {
    target: { value: "0.5" },
  });
  expect(useDirectorStore.getState().cameraMotionProgress).toBe(0.5);
  expect(screen.getByLabelText("时间轴当前时间")).toHaveTextContent("00:03.0");

  await user.click(screen.getByRole("button", { name: "循环播放" }));
  expect(useDirectorStore.getState().project.cameras[0].motionPath?.loop).toBe(true);
});

it("records a keyframe for the selected prop at the current playhead", async () => {
  const user = userEvent.setup();
  useDirectorStore.getState().addGeometryPrimitive("box");
  useDirectorStore.getState().setCameraMotionProgress(0.4);
  const selectedObjectId = useDirectorStore.getState().selectedObjectId;

  render(<AnimationTimeline onClose={() => undefined} />);
  await user.click(screen.getByRole("button", { name: "在当前时间记录关键帧" }));

  const selectedObject = useDirectorStore.getState().project.objects.find(
    (object) => object.id === selectedObjectId
  );
  expect(selectedObject?.motionPath?.keyframes).toHaveLength(1);
  expect(selectedObject?.motionPath?.keyframes[0].time).toBe(0.4);
});

it("exposes a toolbar-style close action", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<AnimationTimeline onClose={onClose} />);

  await user.click(screen.getByRole("button", { name: "收起时间轴" }));
  expect(onClose).toHaveBeenCalledOnce();
});
