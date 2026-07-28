import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { MutableRefObject } from "react";
import { PerspectiveCamera, Scene, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraMotionSnapshot } from "../schema/cameraMotion";
import { useDirectorStore } from "../store/directorStore";

const fiberMocks = vi.hoisted(() => ({
  useFrame: vi.fn(),
  useThree: vi.fn(),
}));

vi.mock("@react-three/fiber", () => fiberMocks);

import {
  CameraPilotController,
  getPilotFovAfterPinch,
  getPilotFovAfterWheel,
  getPilotMouseSensitivity,
} from "./CameraPilotController";

type FrameCallback = (state: unknown, delta: number) => void;

const INITIAL_SNAPSHOT: CameraMotionSnapshot = {
  fov: 50,
  position: [0, 2, 5],
  target: [0, 2, 0],
};

let camera: PerspectiveCamera;
let canvas: HTMLCanvasElement;
let frameCallback: FrameCallback;
let pointerLockOwner: Element | null;
let pointerLockDescriptor: PropertyDescriptor | undefined;
let snapshotRef: MutableRefObject<CameraMotionSnapshot>;

function renderController(overrides: {
  active?: boolean;
  onExit?: () => void;
  onRecord?: (snapshot: CameraMotionSnapshot) => void;
  onSnapshotCommit?: (snapshot: CameraMotionSnapshot) => void;
  onToggleActionPlayback?: () => void;
} = {}) {
  const callbacks = {
    onExit: overrides.onExit ?? vi.fn(),
    onRecord: overrides.onRecord ?? vi.fn(),
    onSnapshotCommit: overrides.onSnapshotCommit ?? vi.fn(),
    onToggleActionPlayback: overrides.onToggleActionPlayback ?? vi.fn(),
  };

  const result = render(
    <CameraPilotController
      active={overrides.active ?? true}
      onExit={callbacks.onExit}
      onRecord={callbacks.onRecord}
      onSnapshotCommit={callbacks.onSnapshotCommit}
      onToggleActionPlayback={callbacks.onToggleActionPlayback}
      snapshotRef={snapshotRef}
    />
  );

  return { ...result, ...callbacks };
}

function dispatchPointerMove(clientX: number, clientY: number) {
  const event = new Event("pointermove");
  Object.defineProperties(event, {
    clientX: { configurable: true, value: clientX },
    clientY: { configurable: true, value: clientY },
  });
  window.dispatchEvent(event);
}

function dispatchTouchPointerMove(pointerId: number, clientX: number, clientY: number) {
  const event = new Event("pointermove");
  Object.defineProperties(event, {
    pointerId: { configurable: true, value: pointerId },
    pointerType: { configurable: true, value: "touch" },
    clientX: { configurable: true, value: clientX },
    clientY: { configurable: true, value: clientY },
  });
  window.dispatchEvent(event);
}

beforeEach(() => {
  pointerLockOwner = null;
  pointerLockDescriptor = Object.getOwnPropertyDescriptor(document, "pointerLockElement");
  Object.defineProperty(document, "pointerLockElement", {
    configurable: true,
    get: () => pointerLockOwner,
  });

  canvas = document.createElement("canvas");
  document.body.append(canvas);

  camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(...INITIAL_SNAPSHOT.position);
  camera.lookAt(...INITIAL_SNAPSHOT.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  snapshotRef = {
    current: {
      ...INITIAL_SNAPSHOT,
      position: [...INITIAL_SNAPSHOT.position],
      target: [...INITIAL_SNAPSHOT.target],
    },
  };

  fiberMocks.useThree.mockReturnValue({
    camera,
    gl: { domElement: canvas },
    scene: new Scene(),
  });
  fiberMocks.useFrame.mockImplementation((callback: FrameCallback) => {
    frameCallback = callback;
  });

  useDirectorStore.setState({
    cameraPilotHoveredTargetId: null,
    cameraPilotLockedTargetId: null,
    cameraPilotFollowTarget: false,
  });
});

afterEach(() => {
  cleanup();
  canvas.remove();
  fiberMocks.useFrame.mockReset();
  fiberMocks.useThree.mockReset();
  vi.clearAllMocks();

  if (pointerLockDescriptor) {
    Object.defineProperty(document, "pointerLockElement", pointerLockDescriptor);
  } else {
    Reflect.deleteProperty(document, "pointerLockElement");
  }
});

describe("CameraPilotController", () => {
  it("toggles action playback once for Space and ignores key-repeat events", () => {
    const onToggleActionPlayback = vi.fn();
    renderController({ onToggleActionPlayback });

    fireEvent.keyDown(window, { code: "Space", repeat: false });
    fireEvent.keyDown(window, { code: "Space", repeat: true });

    expect(onToggleActionPlayback).toHaveBeenCalledTimes(1);
  });

  it("records the current camera snapshot when Enter is pressed", () => {
    const onRecord = vi.fn();
    renderController({ onRecord });

    fireEvent.keyDown(window, { code: "Enter" });

    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(onRecord).toHaveBeenCalledWith(snapshotRef.current);
  });

  it("moves the pilot camera in short steps and caps stalled frame jumps", () => {
    useDirectorStore.setState({ viewMode: "director", cameraMotionPlaying: false });
    renderController();

    fireEvent.keyDown(window, { code: "KeyW" });
    act(() => frameCallback({}, 1));
    fireEvent.keyUp(window, { code: "KeyW" });

    const distance = new Vector3(...snapshotRef.current.position).distanceTo(
      new Vector3(...INITIAL_SNAPSHOT.position)
    );
    expect(distance).toBeCloseTo(0.125, 3);
  });

  it("rotates while the left mouse button is held and dragged", () => {
    renderController();

    dispatchPointerMove(220, 70);
    act(() => frameCallback({}, 1 / 60));
    const unlockedSnapshot = structuredClone(snapshotRef.current);

    expect(unlockedSnapshot).toEqual(INITIAL_SNAPSHOT);

    fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100 });
    dispatchPointerMove(220, 70);
    act(() => frameCallback({}, 1 / 60));

    expect(snapshotRef.current.position).toEqual(unlockedSnapshot.position);
    expect(snapshotRef.current.target).not.toEqual(unlockedSnapshot.target);
  });

  it("exits when an already-acquired Pointer Lock is lost", () => {
    pointerLockOwner = canvas;
    const onExit = vi.fn();
    renderController({ onExit });

    pointerLockOwner = null;
    fireEvent(document, new Event("pointerlockchange"));
    fireEvent(document, new Event("pointerlockchange"));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("zooms gently for small wheel deltas and caps unusually large deltas", () => {
    renderController();

    const initialFov = camera.fov;
    fireEvent.wheel(canvas, { deltaY: 1 });
    const smallDeltaChange = camera.fov - initialFov;

    expect(smallDeltaChange).toBeGreaterThan(0);
    expect(smallDeltaChange).toBeLessThanOrEqual(0.1);

    const beforeLargeDelta = camera.fov;
    fireEvent.wheel(canvas, { deltaY: 10_000 });
    const largeDeltaChange = camera.fov - beforeLargeDelta;

    expect(largeDeltaChange).toBeGreaterThan(0);
    expect(largeDeltaChange).toBeLessThanOrEqual(1);
  });

  it("uses one touch to look and a two-finger pinch to adjust pilot FOV", () => {
    const { unmount } = renderController();

    expect(canvas.style.touchAction).toBe("none");
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100 });
    dispatchTouchPointerMove(1, 130, 85);
    act(() => frameCallback({}, 1 / 60));
    expect(snapshotRef.current.target).not.toEqual(INITIAL_SNAPSHOT.target);

    const fovBeforePinch = camera.fov;
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, pointerType: "touch", clientX: 200, clientY: 100 });
    dispatchTouchPointerMove(2, 250, 100);

    expect(camera.fov).toBeLessThan(fovBeforePinch);
    unmount();
    expect(canvas.style.touchAction).toBe("");
  });

  it("scales pilot turning and zooming with the shared viewport sensitivity", () => {
    expect(getPilotMouseSensitivity(0.15)).toBeLessThan(getPilotMouseSensitivity(0.9));

    const slowFov = getPilotFovAfterWheel(50, 100, 0.15);
    const fastFov = getPilotFovAfterWheel(50, 100, 0.9);
    const pinchOutFov = getPilotFovAfterPinch(50, 100, 140, 0.65);
    const pinchInFov = getPilotFovAfterPinch(50, 140, 100, 0.65);

    expect(slowFov).toBeGreaterThan(50);
    expect(fastFov - 50).toBeGreaterThan(slowFov - 50);
    expect(pinchOutFov).toBeLessThan(50);
    expect(pinchInFov).toBeGreaterThan(50);
  });
});
