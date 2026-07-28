import { afterEach, beforeEach, vi } from "vitest";
import {
  createDefaultDirectorProject,
  createInitialDirectorState,
  useDirectorStore,
  type DirectorState,
} from "./directorStore";
import { selectRightPanelKind } from "./directorSelectors";
import { getCameraRigPositionFromViewSnapshot } from "../schema/cameraGeometry";
import { getObjectMotionSnapshot } from "../schema/objectMotion";
import {
  DEFAULT_VIEWPORT_ROTATE_SENSITIVITY,
  DEFAULT_VIEWPORT_ZOOM_SENSITIVITY,
} from "../schema/viewportSensitivity";

function createMemoryStorage(): Storage {
  const storage = new Map<string, string>();

  return {
    get length() {
      return storage.size;
    },
    clear: () => storage.clear(),
    getItem: (key) => storage.get(key) ?? null,
    key: (index) => Array.from(storage.keys())[index] ?? null,
    removeItem: (key) => {
      storage.delete(key);
    },
    setItem: (key, value) => {
      storage.set(key, String(value));
    },
  };
}

const remoteScenes = new Map<string, unknown>();
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input);
  const match = path.match(/^\/api\/director-desks\/([^/]+)\/scene$/);
  if (!match) throw new Error(`Unexpected request: ${path}`);

  const deskKey = decodeURIComponent(match[1]);
  if (init?.method === "PUT") {
    const body = JSON.parse(String(init.body)) as { scene: unknown };
    remoteScenes.set(deskKey, body.scene);
  }

  return {
    ok: true,
    status: 200,
    json: async () => ({
      requestId: "request_test",
      data: {
        deskKey,
        scene: remoteScenes.get(deskKey) ?? {},
      },
    }),
  } as Response;
});

beforeEach(async () => {
  vi.stubGlobal("localStorage", createMemoryStorage());
  vi.stubGlobal("fetch", fetchMock);
  await useDirectorStore.getState().openScopedScene(null);
  remoteScenes.clear();
  fetchMock.mockClear();
  useDirectorStore.setState({
    ...useDirectorStore.getState(),
    ...createInitialDirectorState(),
    clipboard: [],
    clipboardPasteCount: 0,
    undoStack: [],
    undoBatchDepth: 0,
    undoBatchSnapshot: null,
    undoBatchHasTrackedChanges: false,
    characterRouteDrawingObjectId: null,
  });
});

afterEach(async () => {
  await useDirectorStore.getState().openScopedScene(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("seeds the demo with one mannequin role and one camera", () => {
  const state = createInitialDirectorState();
  const defaultCharacter = state.project.objects.find((item) => item.kind === "character");
  const defaultCameraObject = state.project.objects.find((item) => item.kind === "camera");

  expect(state.viewMode).toBe("director");
  expect(state.directorViewSnapshot).toEqual({
    fov: 50,
    position: [0, 1.55, 5.4],
    target: [0, 1.05, 0],
  });
  expect(state.viewportAspectRatio).toBe("auto");
  expect(state.viewportRuleOfThirdsEnabled).toBe(false);
  expect(state.viewportRotateSensitivity).toBe(DEFAULT_VIEWPORT_ROTATE_SENSITIVITY);
  expect(state.viewportZoomSensitivity).toBe(DEFAULT_VIEWPORT_ZOOM_SENSITIVITY);
  expect(state.project.scene.backgroundColor).toBe("#000000");
  expect(defaultCharacter?.name).toBe("角色01");
  expect(defaultCameraObject?.name).toBe("机位01");
  expect(state.project.cameras[0]?.name).toBe("机位01");
  expect(state.project.objects.some((item) => item.kind === "character")).toBe(true);
  expect(state.project.cameras).toHaveLength(1);
  expect(state.project.cameras[0]?.motionPath).toEqual({
    duration: 6,
    loop: false,
    interpolation: "smooth",
    easing: "ease-in-out",
    keyframes: [],
  });
});

it("records live pilot snapshots as ordered camera waypoints", () => {
  useDirectorStore.setState(createInitialDirectorState());

  const firstId = useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [1, 2, 3],
    target: [0, 1, 0],
    fov: 48,
  });
  const secondId = useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [4, 5, 6],
    target: [2, 1, 0],
    fov: 36,
  });

  expect(firstId).toBe("cam_1_motion_key_1");
  expect(secondId).toBe("cam_1_motion_key_2");
  expect(useDirectorStore.getState().project.cameras[0].motionPath?.keyframes).toMatchObject([
    { id: firstId, time: 0, position: [1, 2, 3], target: [0, 1, 0], fov: 48 },
    { id: secondId, time: 1, position: [4, 5, 6], target: [2, 1, 0], fov: 36 },
  ]);
});

it("updates a waypoint entered for adjustment without appending a duplicate", () => {
  useDirectorStore.setState(createInitialDirectorState());
  const keyframeId = useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", {
    position: [1, 2, 3],
    target: [0, 1, 0],
    fov: 48,
  });

  useDirectorStore.getState().recordCameraMotionSnapshot(
    "cam_1",
    { position: [9, 8, 7], target: [1, 1, 1], fov: 30 },
    keyframeId
  );

  expect(useDirectorStore.getState().project.cameras[0].motionPath?.keyframes).toMatchObject([
    { id: keyframeId, time: 0, position: [9, 8, 7], target: [1, 1, 1], fov: 30 },
  ]);
});

it("records pilot waypoints at the shared action time without pausing playback", () => {
  useDirectorStore.setState({
    ...createInitialDirectorState(),
    cameraMotionPlaying: true,
    cameraMotionProgress: 0.4,
  });

  const firstId = useDirectorStore.getState().recordCameraMotionSnapshot(
    "cam_1",
    { position: [2, 3, 7], target: [0, 1, 0], fov: 46 },
    null,
    0.4
  );
  const secondId = useDirectorStore.getState().recordCameraMotionSnapshot(
    "cam_1",
    { position: [5, 2, 4], target: [1, 1, 0], fov: 38 },
    null,
    0.75
  );

  expect(useDirectorStore.getState().cameraMotionPlaying).toBe(true);
  expect(useDirectorStore.getState().project.cameras[0].motionPath?.keyframes).toMatchObject([
    { id: firstId, time: 0.4, position: [2, 3, 7] },
    { id: secondId, time: 0.75, position: [5, 2, 4] },
  ]);
});

it("appends another waypoint at a nearby shared time unless an edit id was explicitly supplied", () => {
  useDirectorStore.setState({
    ...createInitialDirectorState(),
    cameraMotionPlaying: true,
  });
  const keyframeId = useDirectorStore.getState().recordCameraMotionSnapshot(
    "cam_1",
    { position: [1, 2, 3], target: [0, 1, 0], fov: 48 },
    null,
    0.5
  );

  const updatedId = useDirectorStore.getState().recordCameraMotionSnapshot(
    "cam_1",
    { position: [9, 8, 7], target: [1, 1, 1], fov: 30 },
    null,
    0.503
  );

  expect(updatedId).not.toBe(keyframeId);
  expect(useDirectorStore.getState().cameraMotionPlaying).toBe(true);
  expect(useDirectorStore.getState().project.cameras[0].motionPath?.keyframes).toMatchObject([
    { id: keyframeId, time: 0.5, position: [1, 2, 3], target: [0, 1, 0], fov: 48 },
    { id: updatedId, time: 0.503, position: [9, 8, 7], target: [1, 1, 1], fov: 30 },
  ]);
});

it("moves a waypoint and retimes the route in its new order", () => {
  useDirectorStore.setState(createInitialDirectorState());
  const store = useDirectorStore.getState();
  const firstId = store.recordCameraMotionSnapshot("cam_1", { position: [1, 0, 0], target: [0, 0, 0], fov: 50 });
  const secondId = useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", { position: [2, 0, 0], target: [0, 0, 0], fov: 50 });
  const thirdId = useDirectorStore.getState().recordCameraMotionSnapshot("cam_1", { position: [3, 0, 0], target: [0, 0, 0], fov: 50 });

  useDirectorStore.getState().moveCameraMotionKeyframe("cam_1", thirdId!, -1);

  expect(useDirectorStore.getState().project.cameras[0].motionPath?.keyframes.map((item) => [item.id, item.time])).toEqual([
    [firstId, 0],
    [thirdId, 0.5],
    [secondId, 1],
  ]);
});

it("records character and prop transforms on the shared camera timeline", () => {
  useDirectorStore.setState(createInitialDirectorState());
  const characterId = "char_default_a";

  useDirectorStore.getState().addObjectMotionKeyframe(characterId, 0);
  useDirectorStore.getState().updateObjectTransform(characterId, { position: [6, 0, -2] });
  useDirectorStore.getState().addObjectMotionKeyframe(characterId, 0.75);

  expect(useDirectorStore.getState().project.objects.find((item) => item.id === characterId)?.motionPath?.keyframes).toMatchObject([
    { time: 0, transform: { position: [0, 0, 0] } },
    { time: 0.75, transform: { position: [6, 0, -2] } },
  ]);
});

it("moves the displayed character and its whole route from the current timeline transform", () => {
  useDirectorStore.setState(createInitialDirectorState());
  const characterId = "char_default_a";
  useDirectorStore.getState().addObjectMotionKeyframe(characterId, 0);
  useDirectorStore.getState().updateObjectTransform(characterId, { position: [10, 0, 0] });
  useDirectorStore.getState().addObjectMotionKeyframe(characterId, 1);
  useDirectorStore.getState().setCameraMotionProgress(0.5);

  useDirectorStore.getState().updateObjectDisplayTransform(characterId, { position: [7, 2, 3] });

  const character = useDirectorStore.getState().project.objects.find((item) => item.id === characterId)!;
  expect(character.motionPath?.keyframes.map((item) => item.transform.position)).toEqual([
    [2, 2, 3],
    [12, 2, 3],
  ]);
  expect(getObjectMotionSnapshot(character, 0.5).position).toEqual([7, 2, 3]);
});

it("updates an object keyframe when recording again at the same time", () => {
  useDirectorStore.setState(createInitialDirectorState());
  const characterId = "char_default_a";
  useDirectorStore.getState().addObjectMotionKeyframe(characterId, 0.4);
  useDirectorStore.getState().updateObjectTransform(characterId, { position: [2, 0, 1] });
  useDirectorStore.getState().addObjectMotionKeyframe(characterId, 0.4);

  const keyframes = useDirectorStore.getState().project.objects.find((item) => item.id === characterId)?.motionPath?.keyframes;
  expect(keyframes).toHaveLength(1);
  expect(keyframes?.[0].transform.position).toEqual([2, 0, 1]);
});

it("inserts and edits a character route point", () => {
  useDirectorStore.setState(createInitialDirectorState());
  const characterId = "char_default_a";
  const startId = useDirectorStore.getState().addObjectMotionKeyframe(characterId, 0)!;
  useDirectorStore.getState().updateObjectTransform(characterId, { position: [6, 0, 0] });
  useDirectorStore.getState().addObjectMotionKeyframe(characterId, 1);

  const insertedId = useDirectorStore.getState().insertObjectMotionKeyframeAfter(characterId, startId)!;
  useDirectorStore.getState().updateObjectMotionKeyframe(characterId, insertedId, {
    actionPresetId: "run-cycle",
    facingMode: "manual",
    transform: { position: [2, 0, 1] },
  });

  const keyframes = useDirectorStore.getState().project.objects.find((item) => item.id === characterId)?.motionPath?.keyframes;
  expect(keyframes).toMatchObject([
    { id: startId, time: 0, facingMode: "path" },
    { id: insertedId, time: .5, actionPresetId: "run-cycle", facingMode: "manual", transform: { position: [2, 0, 1] } },
    { time: 1 },
  ]);
  expect(useDirectorStore.getState().selectedObjectMotionKeyframeId).toBe(insertedId);
});

it("adds character route points without overwriting an existing point", () => {
  useDirectorStore.setState(createInitialDirectorState());
  const characterId = "char_default_a";
  const firstId = useDirectorStore.getState().addCharacterRoutePoint(characterId);
  const secondId = useDirectorStore.getState().addCharacterRoutePoint(characterId);
  const path = useDirectorStore.getState().project.objects.find((item) => item.id === characterId)?.motionPath;

  expect(path?.keyframes).toMatchObject([
    { id: firstId, time: 0, transform: { position: [0, 0, 0] } },
    { id: secondId, time: 1, facingMode: "path", transform: { position: [0, 0, 1.5] } },
  ]);
  expect(useDirectorStore.getState().selectedObjectMotionKeyframeId).toBe(secondId);
});

it("replaces a character route from drawn points and times points by traveled distance", () => {
  useDirectorStore.setState(createInitialDirectorState());

  useDirectorStore.getState().replaceCharacterRouteFromPoints("char_default_a", [
    [0, 0, 0],
    [3, 0, 0],
    [3, 0, 4],
  ]);

  const state = useDirectorStore.getState();
  const character = state.project.objects.find((item) => item.id === "char_default_a");
  expect(character?.motionPath?.interpolation).toBe("linear");
  expect(character?.motionPath?.keyframes.map((item) => item.transform.position)).toEqual([
    [0, 0, 0],
    [3, 0, 0],
    [3, 0, 4],
  ]);
  expect(character?.motionPath?.keyframes[1].time).toBeCloseTo(3 / 7);
  expect(character?.motionPath?.keyframes.every((item) => item.facingMode === "path")).toBe(true);
  expect(state.cameraMotionProgress).toBe(0);
  expect(state.characterRouteDrawingObjectId).toBeNull();
});

it("updates the viewport aspect ratio selection in ui state", () => {
  useDirectorStore.setState(createInitialDirectorState());

  useDirectorStore.getState().setViewportAspectRatio("9:16");

  expect(useDirectorStore.getState().viewportAspectRatio).toBe("9:16");
});

it("updates the viewport rule-of-thirds guide toggle in ui state", () => {
  useDirectorStore.setState(createInitialDirectorState());

  useDirectorStore.getState().setViewportRuleOfThirdsEnabled(true);

  expect(useDirectorStore.getState().viewportRuleOfThirdsEnabled).toBe(true);
});

it("stores and clamps the finished-shot FOV override and can return to waypoint FOV", () => {
  useDirectorStore.getState().setFinishedShotFov(200);
  expect(useDirectorStore.getState().finishedShotFov).toBe(120);

  useDirectorStore.getState().setFinishedShotFov(35);
  expect(useDirectorStore.getState().finishedShotFov).toBe(35);

  useDirectorStore.getState().setFinishedShotFov(null);
  expect(useDirectorStore.getState().finishedShotFov).toBeNull();
});

it("stores the monitor FOV separately from the finished-shot FOV", () => {
  useDirectorStore.getState().setFinishedShotFov(35);
  useDirectorStore.getState().setMotionMonitorFov(200);

  expect(useDirectorStore.getState().finishedShotFov).toBe(35);
  expect(useDirectorStore.getState().motionMonitorFov).toBe(120);

  useDirectorStore.getState().setMotionMonitorFov(null);
  expect(useDirectorStore.getState().motionMonitorFov).toBeNull();
  expect(useDirectorStore.getState().finishedShotFov).toBe(35);
});

it("undoes an active drag batch immediately without leaving the batch stuck", () => {
  const characterId = "char_default_a";
  useDirectorStore.getState().beginUndoBatch();
  useDirectorStore.getState().updateObjectTransform(characterId, { position: [8, 0, 0] });

  useDirectorStore.getState().undo();

  const state = useDirectorStore.getState();
  expect(state.project.objects.find((item) => item.id === characterId)?.transform.position).toEqual([0, 0, 0]);
  expect((state as unknown as { undoBatchDepth: number }).undoBatchDepth).toBe(0);
});

it("updates, clamps, and resets the saved viewport sensitivity", () => {
  useDirectorStore.setState(createInitialDirectorState());

  useDirectorStore.getState().setViewportRotateSensitivity(0.8);
  useDirectorStore.getState().setViewportZoomSensitivity(0.65);

  expect(useDirectorStore.getState().viewportRotateSensitivity).toBe(0.8);
  expect(useDirectorStore.getState().viewportZoomSensitivity).toBe(0.65);

  useDirectorStore.getState().setViewportRotateSensitivity(99);
  useDirectorStore.getState().setViewportZoomSensitivity(-99);

  expect(useDirectorStore.getState().viewportRotateSensitivity).toBe(1.5);
  expect(useDirectorStore.getState().viewportZoomSensitivity).toBe(0.1);

  useDirectorStore.getState().resetViewportSensitivity();

  expect(useDirectorStore.getState().viewportRotateSensitivity).toBe(DEFAULT_VIEWPORT_ROTATE_SENSITIVITY);
  expect(useDirectorStore.getState().viewportZoomSensitivity).toBe(DEFAULT_VIEWPORT_ZOOM_SENSITIVITY);
});

it("toggles the viewport side panel collapse flag in ui state", () => {
  useDirectorStore.setState(createInitialDirectorState());

  type CollapseUiState = ReturnType<typeof useDirectorStore.getState> & {
    viewportPanelsCollapsed?: boolean;
    toggleViewportPanelsCollapsed?: () => void;
  };
  const state = useDirectorStore.getState() as CollapseUiState;

  expect(state.viewportPanelsCollapsed ?? false).toBe(false);

  state.toggleViewportPanelsCollapsed?.();

  expect((useDirectorStore.getState() as CollapseUiState).viewportPanelsCollapsed ?? false).toBe(true);
});

it("routes the right panel by object type and view mode", () => {
  const state = createInitialDirectorState();
  const characterId = state.project.objects.find((item) => item.kind === "character")!.id;
  const cameraObjectId = state.project.objects.find((item) => item.kind === "camera")!.id;
  const propState = {
    ...state,
    selectedObjectId: "prop_model_1",
    project: {
      ...state.project,
      objects: [
        ...state.project.objects,
        {
          id: "prop_model_1",
          name: "自动取款机",
          kind: "prop" as const,
          visible: true,
          locked: false,
          assetRefId: "asset_model_1",
          transform: {
            position: [0, 0, 0] as [number, number, number],
            rotation: [0, 0, 0] as [number, number, number],
            scale: [1, 1, 1] as [number, number, number],
          },
        },
      ],
      assets: [
        ...state.project.assets,
        {
          id: "asset_model_1",
          kind: "prop" as const,
          sourceType: "model" as const,
          fileName: "ATM_low.fbx",
          url: "blob:atm",
        },
      ],
    },
  };

  expect(selectRightPanelKind(state)).toBe("scene");
  expect(selectRightPanelKind({ ...state, selectedObjectId: characterId })).toBe("character");
  expect(selectRightPanelKind({ ...state, selectedObjectId: cameraObjectId })).toBe("camera");
  expect(selectRightPanelKind(propState)).toBe("prop");
  expect(selectRightPanelKind({ ...state, viewMode: "camera", selectedObjectId: null })).toBe("camera");
});

it("routes a selected crowd group to the role panel", () => {
  const state = createInitialDirectorState();

  expect(selectRightPanelKind({ ...state, selectedCrowdId: "crowd_1" })).toBe("character");
});

it("routes older model-backed scene objects to the model panel", () => {
  const state = createInitialDirectorState();

  expect(
    selectRightPanelKind({
      ...state,
      selectedObjectId: "obj_scene_model_1",
      project: {
        ...state.project,
        assets: [
          {
            id: "asset_scene_model_1",
            kind: "scene",
            sourceType: "model",
            fileName: "microwave_low.fbx",
            url: "blob:microwave",
          },
        ],
        objects: [
          ...state.project.objects,
          {
            id: "obj_scene_model_1",
            name: "微波炉",
            kind: "scene",
            visible: true,
            locked: false,
            assetRefId: "asset_scene_model_1",
            transform: {
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            },
          },
        ],
      },
    })
  ).toBe("prop");
});

it("defaults generated characters to the male mannequin body type", () => {
  const project = createDefaultDirectorProject();
  const character = project.objects.find((item) => item.kind === "character");

  expect(character?.bodyType).toBe("mannequin");
});

it("adds preset characters with a requested body type", () => {
  useDirectorStore.setState(createInitialDirectorState());

  useDirectorStore.getState().addPresetCharacter("female");

  const characters = useDirectorStore.getState().project.objects.filter((item) => item.kind === "character");
  const added = characters[characters.length - 1];

  expect(added?.bodyType).toBe("female");
  expect(added?.name).toBe("角色02");
  expect(added?.characterRig?.rigType).toBe("ue4-mannequin");
  expect(useDirectorStore.getState().selectedObjectId).toBe(added?.id);
});

it("adds camera shots with two-digit camera names", () => {
  useDirectorStore.setState(createInitialDirectorState());

  useDirectorStore.getState().addCameraShot();

  const state = useDirectorStore.getState();

  expect(state.project.cameras.map((camera) => camera.name)).toEqual(["机位01", "机位02"]);
  expect(state.project.objects.filter((item) => item.kind === "camera").map((item) => item.name)).toEqual([
    "机位01",
    "机位02",
  ]);
  expect(state.project.cameras[1]?.motionPath?.keyframes).toEqual([]);
});

it("creates one hidden motion camera without adding a scene camera object", () => {
  const state = createInitialDirectorState();
  useDirectorStore.setState({
    ...useDirectorStore.getState(),
    ...state,
    project: {
      ...state.project,
      cameras: [],
      activeCameraId: null,
      objects: state.project.objects.filter((item) => item.kind !== "camera"),
    },
  });

  const firstId = useDirectorStore.getState().ensureMotionCamera({
    position: [4, 3, 2],
    target: [0, 1, -1],
    fov: 45,
  });
  const secondId = useDirectorStore.getState().ensureMotionCamera();
  const nextState = useDirectorStore.getState();

  expect(secondId).toBe(firstId);
  expect(nextState.project.cameras).toHaveLength(1);
  expect(nextState.project.cameras[0]).toMatchObject({ id: firstId, isVirtual: true, name: "自动运镜镜头" });
  expect(nextState.project.objects.some((item) => item.kind === "camera")).toBe(false);
});

it("captures camera positions as evenly timed motion keyframes", () => {
  useDirectorStore.setState(createInitialDirectorState());

  const firstKeyframeId = useDirectorStore.getState().addCameraMotionKeyframe("cam_1");
  const camera = useDirectorStore.getState().project.cameras[0];
  useDirectorStore.getState().updateCamera("cam_1", {
    transform: {
      ...camera.transform,
      position: [4, 3, -2],
    },
    fov: 36,
  });
  const secondKeyframeId = useDirectorStore.getState().addCameraMotionKeyframe("cam_1");

  const state = useDirectorStore.getState();
  const keyframes = state.project.cameras[0].motionPath?.keyframes ?? [];

  expect(firstKeyframeId).toBe("cam_1_motion_key_1");
  expect(secondKeyframeId).toBe("cam_1_motion_key_2");
  expect(keyframes.map((keyframe) => keyframe.time)).toEqual([0, 1]);
  expect(keyframes[0].position).toEqual(camera.transform.position);
  expect(keyframes[1]).toMatchObject({ position: [4, 3, -2], fov: 36 });
  expect(state.selectedCameraKeyframeId).toBe(secondKeyframeId);
  expect(state.cameraMotionProgress).toBe(1);
});

it("updates and deletes camera motion keyframes while keeping timing normalized", () => {
  useDirectorStore.setState(createInitialDirectorState());

  const firstKeyframeId = useDirectorStore.getState().addCameraMotionKeyframe("cam_1")!;
  const camera = useDirectorStore.getState().project.cameras[0];
  useDirectorStore.getState().updateCamera("cam_1", {
    transform: { ...camera.transform, position: [2, 4, 1] },
  });
  const middleKeyframeId = useDirectorStore.getState().addCameraMotionKeyframe("cam_1")!;
  useDirectorStore.getState().updateCamera("cam_1", {
    transform: { ...camera.transform, position: [-3, 2, -4] },
  });
  const lastKeyframeId = useDirectorStore.getState().addCameraMotionKeyframe("cam_1")!;

  useDirectorStore.getState().updateCameraMotionKeyframe("cam_1", middleKeyframeId, {
    position: [8, 6, 4],
    fov: 28,
  });

  expect(
    useDirectorStore
      .getState()
      .project.cameras[0].motionPath?.keyframes.find((keyframe) => keyframe.id === middleKeyframeId)
  ).toMatchObject({ position: [8, 6, 4], fov: 28 });

  useDirectorStore.getState().deleteCameraMotionKeyframe("cam_1", middleKeyframeId);

  const remaining = useDirectorStore.getState().project.cameras[0].motionPath?.keyframes ?? [];
  expect(remaining.map((keyframe) => keyframe.id)).toEqual([firstKeyframeId, lastKeyframeId]);
  expect(remaining.map((keyframe) => keyframe.time)).toEqual([0, 1]);
  expect(useDirectorStore.getState().selectedCameraKeyframeId).toBe(lastKeyframeId);
});

it("inserts a camera waypoint halfway between two existing points without retiming the rest", () => {
  useDirectorStore.setState(createInitialDirectorState());
  const firstId = useDirectorStore.getState().recordCameraMotionSnapshot(
    "cam_1",
    { position: [0, 2, 8], target: [0, 1, 0], fov: 50 },
    null,
    0
  )!;
  useDirectorStore.getState().recordCameraMotionSnapshot(
    "cam_1",
    { position: [8, 4, 0], target: [2, 1, 0], fov: 30 },
    null,
    1
  );
  useDirectorStore.getState().updateCameraMotionPath("cam_1", {
    interpolation: "linear",
    easing: "linear",
  });

  const insertedId = useDirectorStore.getState().insertCameraMotionKeyframeAfter("cam_1", firstId);
  const state = useDirectorStore.getState();
  const keyframes = state.project.cameras[0].motionPath?.keyframes ?? [];

  expect(insertedId).toBeTruthy();
  expect(keyframes.map((keyframe) => keyframe.time)).toEqual([0, 0.5, 1]);
  expect(keyframes[1]).toMatchObject({
    id: insertedId,
    position: [4, 3, 4],
    target: [1, 1, 0],
    fov: 40,
  });
  expect(state.selectedCameraKeyframeIds).toEqual([insertedId]);
  expect(state.cameraMotionProgress).toBe(0.5);
});

it("moves any selected camera waypoints together while preserving their direction and timing", () => {
  useDirectorStore.setState(createInitialDirectorState());
  const firstId = useDirectorStore.getState().recordCameraMotionSnapshot(
    "cam_1",
    { position: [0, 2, 8], target: [0, 1, 0], fov: 50 },
    null,
    0
  )!;
  const middleId = useDirectorStore.getState().recordCameraMotionSnapshot(
    "cam_1",
    { position: [3, 3, 4], target: [1, 1, 0], fov: 45 },
    null,
    0.5
  )!;
  const lastId = useDirectorStore.getState().recordCameraMotionSnapshot(
    "cam_1",
    { position: [6, 2, 0], target: [2, 1, 0], fov: 40 },
    null,
    1
  )!;
  useDirectorStore.getState().setCameraMotionKeyframeSelection([firstId, lastId]);

  useDirectorStore.getState().translateSelectedCameraMotionKeyframes("cam_1", [2, -1, 3]);

  const keyframes = useDirectorStore.getState().project.cameras[0].motionPath?.keyframes ?? [];
  expect(keyframes.find((item) => item.id === firstId)).toMatchObject({
    time: 0,
    position: [2, 1, 11],
    target: [2, 0, 3],
  });
  expect(keyframes.find((item) => item.id === middleId)).toMatchObject({
    time: 0.5,
    position: [3, 3, 4],
    target: [1, 1, 0],
  });
  expect(keyframes.find((item) => item.id === lastId)).toMatchObject({
    time: 1,
    position: [8, 1, 3],
    target: [4, 0, 3],
  });
});

it("keeps the default character blue and gives newly added characters distinct colors", () => {
  useDirectorStore.setState(createInitialDirectorState());

  useDirectorStore.getState().addPresetCharacter("female");
  useDirectorStore.getState().addPresetCharacter("teen");

  const characters = useDirectorStore.getState().project.objects.filter((item) => item.kind === "character");

  expect(characters[0].color).toBe("#4F8EF7");
  expect(new Set(characters.map((item) => item.color)).size).toBe(characters.length);
});

it("places newly added preset characters far enough from the default role to avoid overlap", () => {
  useDirectorStore.setState(createInitialDirectorState());

  useDirectorStore.getState().addPresetCharacter("female");
  useDirectorStore.getState().addPresetCharacter("teen");

  const characters = useDirectorStore.getState().project.objects.filter((item) => item.kind === "character");
  const defaultRole = characters.find((item) => item.id === "char_default_a");
  const role02 = characters.find((item) => item.name === "角色02");
  const role03 = characters.find((item) => item.name === "角色03");

  expect(defaultRole?.transform.position).toEqual([0, 0, 0]);
  expect(role02?.transform.position).toEqual([-1.25, 0, 0]);
  expect(role03?.transform.position).toEqual([1.25, 0, 0]);
});

it("adds selected geometry primitives as light blue-white prop objects", () => {
  useDirectorStore.setState(createInitialDirectorState());

  useDirectorStore.getState().addGeometryPrimitive("torus");

  const prop = useDirectorStore.getState().project.objects.find((item) => item.kind === "prop");

  expect(prop?.name).toBe("环状体");
  expect(prop?.geometryType).toBe("torus");
  expect(prop?.color).toBe("#d7e7ff");
  expect(useDirectorStore.getState().selectedObjectId).toBe(prop?.id);
});

it("deletes the selected list object and linked camera data", () => {
  useDirectorStore.setState(createInitialDirectorState());
  useDirectorStore.getState().addCameraShot();

  expect(useDirectorStore.getState().project.cameras).toHaveLength(2);

  useDirectorStore.getState().deleteSelectedObject();

  const state = useDirectorStore.getState();

  expect(state.selectedObjectId).toBeNull();
  expect(state.project.objects.some((item) => item.id === "cam_object_2")).toBe(false);
  expect(state.project.cameras.some((item) => item.id === "cam_2")).toBe(false);
  expect(state.project.activeCameraId).toBe("cam_1");
});

it("supports multi-selecting objects and deleting the selected set", () => {
  useDirectorStore.setState(createInitialDirectorState());
  useDirectorStore.getState().addPresetCharacter("female");

  useDirectorStore.getState().selectObject("char_default_a");
  useDirectorStore.getState().toggleObjectSelection("char_preset_2");

  expect(useDirectorStore.getState().selectedObjectId).toBe("char_preset_2");
  expect(useDirectorStore.getState().selectedObjectIds).toEqual(["char_default_a", "char_preset_2"]);

  useDirectorStore.getState().deleteSelectedObject();

  const state = useDirectorStore.getState();

  expect(state.selectedObjectId).toBeNull();
  expect(state.selectedObjectIds).toEqual([]);
  expect(state.project.objects.some((item) => item.id === "char_default_a")).toBe(false);
  expect(state.project.objects.some((item) => item.id === "char_preset_2")).toBe(false);
});

it("clears every live reference when deleting a routed character", () => {
  useDirectorStore.setState(createInitialDirectorState());
  const routePointId = useDirectorStore.getState().addCharacterRoutePoint("char_default_a");
  useDirectorStore.getState().updateCamera("cam_1", {
    targetMode: "object",
    targetObjectId: "char_default_a",
  });
  useDirectorStore.getState().addCameraMotionKeyframe("cam_1");
  useDirectorStore.setState({
    selectedObjectId: "char_default_a",
    selectedObjectIds: ["char_default_a"],
    selectedObjectMotionKeyframeId: routePointId,
    cameraMotionPlaying: true,
    cameraPilotHoveredTargetId: "char_default_a",
    cameraPilotLockedTargetId: "char_default_a",
    characterRouteDrawingObjectId: "char_default_a",
  });

  useDirectorStore.getState().deleteSelectedObject();

  const state = useDirectorStore.getState();
  const camera = state.project.cameras.find((item) => item.id === "cam_1");
  expect(state.project.objects.some((item) => item.id === "char_default_a")).toBe(false);
  expect(state.selectedObjectMotionKeyframeId).toBeNull();
  expect(state.cameraMotionPlaying).toBe(false);
  expect(state.cameraPilotHoveredTargetId).toBeNull();
  expect(state.cameraPilotLockedTargetId).toBeNull();
  expect(state.characterRouteDrawingObjectId).toBeNull();
  expect(camera).toMatchObject({ targetMode: "manual", targetObjectId: null });
  expect(camera?.motionPath?.keyframes).toMatchObject([
    { targetMode: "manual", targetObjectId: null },
  ]);
});

it("updates a character body type without changing transform or color", () => {
  useDirectorStore.setState(createInitialDirectorState());
  const character = useDirectorStore.getState().project.objects.find((item) => item.kind === "character");
  expect(character).toBeTruthy();

  useDirectorStore.getState().updateObjectColor(character!.id, "#123456");
  useDirectorStore.getState().updateObjectTransform(character!.id, { position: [1, 2, 3] });
  useDirectorStore.getState().updateCharacterBodyType(character!.id, "chibi");

  const updated = useDirectorStore.getState().project.objects.find((item) => item.id === character!.id);
  expect(updated?.bodyType).toBe("chibi");
  expect(updated?.color).toBe("#123456");
  expect(updated?.transform.position).toEqual([1, 2, 3]);
});

it("keeps imported local models separate from procedural body types", () => {
  useDirectorStore.setState(createInitialDirectorState());

  useDirectorStore.getState().addImportedAsset({
    kind: "prop",
    name: "本地道具",
    fileName: "cube.obj",
    url: "blob:local-model",
  });

  const imported = useDirectorStore.getState().project.objects.find((item) => item.assetRefId);

  expect(imported?.kind).toBe("prop");
  expect(imported?.bodyType).toBeUndefined();
  expect(imported?.characterRig).toBeUndefined();
});

it("replaces the active panorama without changing non-panorama assets", () => {
  useDirectorStore.getState().addImportedAsset({
    kind: "prop",
    name: "本地道具",
    fileName: "cube.obj",
    url: "data:model/obj;base64,cube",
  });
  useDirectorStore.getState().addImportedAsset({
    kind: "panorama",
    name: "全景A",
    fileName: "panorama-a.jpg",
    projectionMode: "equirectangular",
    url: "https://cdn.example.com/panorama-a.jpg",
  });
  useDirectorStore.getState().addImportedAsset({
    kind: "panorama",
    name: "全景B",
    fileName: "panorama-b.jpg",
    projectionMode: "equirectangular",
    url: "https://cdn.example.com/panorama-b.jpg",
  });

  const state = useDirectorStore.getState();
  const panoramas = state.project.assets.filter((asset) => asset.kind === "panorama");
  expect(panoramas).toHaveLength(1);
  expect(panoramas[0]).toMatchObject({
    id: state.project.panoramaAssetId,
    sourceType: "image",
    url: "https://cdn.example.com/panorama-b.jpg",
  });
  expect(state.project.assets.some((asset) => asset.kind === "prop")).toBe(true);
  expect(state.directorInspectorMode).toBe("scene");
});

it("preserves a valid panorama when replacing a loaded project", () => {
  const project = createDefaultDirectorProject();
  project.assets.push({
    id: "asset_panorama_cloud",
    kind: "panorama",
    sourceType: "image",
    fileName: "persisted.jpg",
    projectionMode: "equirectangular",
    url: "https://cdn.example.com/persisted.jpg",
  });
  project.panoramaAssetId = "asset_panorama_cloud";

  useDirectorStore.getState().replaceProject(project);

  expect(useDirectorStore.getState().project.panoramaAssetId).toBe("asset_panorama_cloud");
  expect(useDirectorStore.getState().project.assets).toContainEqual(
    expect.objectContaining({ id: "asset_panorama_cloud", url: "https://cdn.example.com/persisted.jpg" })
  );
});

it("adds an empty animation asset collection when replacing a legacy project", () => {
  const legacyProject = createDefaultDirectorProject();
  delete legacyProject.animationAssets;

  useDirectorStore.getState().replaceProject(legacyProject);

  expect(useDirectorStore.getState().project.animationAssets).toEqual([]);
});

it("keeps imported model object ids unique after deleting an earlier model", () => {
  useDirectorStore.setState(createInitialDirectorState());

  useDirectorStore.getState().addImportedAsset({
    kind: "prop",
    name: "模型A",
    fileName: "model-a.fbx",
    url: "blob:model-a",
  });
  const firstModelId = useDirectorStore.getState().selectedObjectId;

  useDirectorStore.getState().addImportedAsset({
    kind: "prop",
    name: "模型B",
    fileName: "model-b.fbx",
    url: "blob:model-b",
  });
  const secondModelId = useDirectorStore.getState().selectedObjectId;

  useDirectorStore.getState().selectObject(firstModelId);
  useDirectorStore.getState().deleteSelectedObject();

  useDirectorStore.getState().addImportedAsset({
    kind: "prop",
    name: "模型C",
    fileName: "model-c.fbx",
    url: "blob:model-c",
  });
  const thirdModelId = useDirectorStore.getState().selectedObjectId;
  const modelObjectIds = useDirectorStore
    .getState()
    .project.objects.filter((item) => item.assetRefId)
    .map((item) => item.id);

  expect(thirdModelId).not.toBe(secondModelId);
  expect(modelObjectIds).toHaveLength(2);
  expect(new Set(modelObjectIds).size).toBe(modelObjectIds.length);
});

it("adds a new camera from the current viewport snapshot", () => {
  useDirectorStore.setState(createInitialDirectorState());

  useDirectorStore.getState().addCameraShot({
    fov: 62,
    position: [4, 3, 2],
    target: [0.5, 1.1, -2],
  });

  const state = useDirectorStore.getState();
  const addedCamera = state.project.cameras[state.project.cameras.length - 1];
  const addedObject = state.project.objects.find((item) => item.linkedCameraId === addedCamera?.id);
  const rigPosition = getCameraRigPositionFromViewSnapshot({
    fov: 62,
    position: [4, 3, 2],
    target: [0.5, 1.1, -2],
  });

  expect(addedCamera?.fov).toBe(62);
  expect(addedCamera?.transform.position).toEqual(rigPosition);
  expect(addedCamera?.target).toEqual([0.5, 1.1, -2]);
  expect(addedObject?.transform.position).toEqual(rigPosition);
  expect(state.project.activeCameraId).toBe(addedCamera?.id);
  expect(state.selectedObjectId).toBe(addedObject?.id);
});

it("keeps object-focused cameras centered when the target model moves", () => {
  useDirectorStore.setState(createInitialDirectorState());

  useDirectorStore.getState().addGeometryPrimitive("box");
  const targetObject = useDirectorStore.getState().project.objects.find((item) => item.name === "立方体");
  expect(targetObject).toBeTruthy();

  useDirectorStore.getState().updateCamera("cam_1", {
    targetMode: "object",
    targetObjectId: targetObject!.id,
    target: [-1.725, 0.5, 1.15],
  });
  useDirectorStore.getState().updateObjectTransform(targetObject!.id, { position: [2, 0, -3] });

  const camera = useDirectorStore.getState().project.cameras[0];

  expect(camera.targetMode).toBe("object");
  expect(camera.targetObjectId).toBe(targetObject!.id);
  expect(camera.target).toEqual([2, 0.5, -3]);
});

it("appends camera captures with sequential camera-shot names", () => {
  useDirectorStore.setState(createInitialDirectorState());

  useDirectorStore.getState().addCameraCaptures("cam_1", ["data:image/png;base64,a"]);
  useDirectorStore.getState().addCameraCaptures("cam_1", [
    "data:image/png;base64,b",
    "data:image/png;base64,c",
  ]);

  const camera = useDirectorStore.getState().project.cameras[0];

  expect(camera.captures).toEqual([
    {
      id: "cam_1-capture-01",
      index: 1,
      name: "机位01-截图01",
      dataUrl: "data:image/png;base64,a",
    },
    {
      id: "cam_1-capture-02",
      index: 2,
      name: "机位01-截图02",
      dataUrl: "data:image/png;base64,b",
    },
    {
      id: "cam_1-capture-03",
      index: 3,
      name: "机位01-截图03",
      dataUrl: "data:image/png;base64,c",
    },
  ]);
  expect(camera.lastCaptureUrl).toBe("data:image/png;base64,c");
});

it("auto-persists the latest director scene snapshot through the backend API", async () => {
  await useDirectorStore.getState().openScopedScene("desk_auto_save");
  fetchMock.mockClear();
  vi.useFakeTimers();

  useDirectorStore.getState().setViewportAspectRatio("16:9");
  useDirectorStore.getState().setViewportRotateSensitivity(0.75);
  useDirectorStore.getState().setViewportZoomSensitivity(0.6);
  useDirectorStore.getState().toggleViewportPanelsCollapsed();
  useDirectorStore.getState().setDirectorViewSnapshot({
    fov: 42,
    position: [8, 6, 12],
    target: [1, 1.5, -2],
  });
  useDirectorStore.getState().addPresetCharacter("female");
  useDirectorStore.getState().updateScene({ backgroundColor: "#151515" });

  expect(localStorage.getItem("storyai-3d-director-desk-demo:desk_auto_save")).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(200);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

  const request = fetchMock.mock.calls[0];
  const parsed = JSON.parse(String(request[1]?.body)) as { scene?: {
    viewportAspectRatio?: string;
    viewportPanelsCollapsed?: boolean;
    viewportRotateSensitivity?: number;
    viewportZoomSensitivity?: number;
    directorViewSnapshot?: {
      fov?: number;
      position?: number[];
      target?: number[];
    };
    project?: {
      scene?: {
        backgroundColor?: string;
      };
      objects?: Array<{ id: string; name: string }>;
    };
  } };

  expect(request[0]).toBe("/api/director-desks/desk_auto_save/scene");
  expect(request[1]).toMatchObject({ method: "PUT", credentials: "include", keepalive: true });
  expect(parsed.scene?.viewportAspectRatio).toBe("16:9");
  expect(parsed.scene?.viewportPanelsCollapsed).toBe(true);
  expect(parsed.scene?.viewportRotateSensitivity).toBe(0.75);
  expect(parsed.scene?.viewportZoomSensitivity).toBe(0.6);
  expect(parsed.scene?.directorViewSnapshot).toEqual({
    fov: 42,
    position: [8, 6, 12],
    target: [1, 1.5, -2],
  });
  expect(parsed.scene?.project?.scene?.backgroundColor).toBe("#151515");
  expect(parsed.scene?.project?.objects?.some((item) => item.name === "角色02")).toBe(true);
});

it("flushes the previous backend scene before switching director desks", async () => {
  remoteScenes.set("node_director_a", createInitialDirectorState());
  remoteScenes.set("node_director_b", {
    ...createInitialDirectorState(),
    project: {
      ...createDefaultDirectorProject(),
      scene: { ...createDefaultDirectorProject().scene, backgroundColor: "#303640" },
    },
  });

  await useDirectorStore.getState().openScopedScene("node_director_a");
  useDirectorStore.getState().setViewportAspectRatio("16:9");
  useDirectorStore.getState().updateScene({ backgroundColor: "#151515" });

  await useDirectorStore.getState().openScopedScene("node_director_b");

  expect(useDirectorStore.getState().viewportAspectRatio).toBe("auto");
  expect(useDirectorStore.getState().project.scene.backgroundColor).toBe("#303640");
  expect((remoteScenes.get("node_director_a") as DirectorState).project.scene.backgroundColor).toBe("#151515");
  expect(localStorage.getItem("storyai-3d-director-desk-demo:node_director_a")).toBeNull();

  useDirectorStore.getState().updateScene({ backgroundColor: "#454545" });
  await useDirectorStore.getState().openScopedScene("node_director_a");

  expect(useDirectorStore.getState().project.scene.backgroundColor).toBe("#151515");
  expect((remoteScenes.get("node_director_b") as DirectorState).project.scene.backgroundColor).toBe("#454545");
});

it("loads the director state from the backend without a local scene fallback", async () => {
  localStorage.setItem(
    "storyai-3d-director-desk-demo",
    JSON.stringify({ ...createInitialDirectorState(), viewMode: "director" })
  );
  remoteScenes.set("desk_remote", {
    ...createInitialDirectorState(),
    viewMode: "camera",
    directorViewSnapshot: {
      fov: 38,
      position: [7, 5, 9],
      target: [0, 1, -1],
    },
    selectedObjectId: "char_default_a",
    selectedObjectIds: ["char_default_a"],
    transformMode: "rotate",
    viewportAspectRatio: "9:16",
    viewportRuleOfThirdsEnabled: true,
    viewportRotateSensitivity: 0.9,
    viewportZoomSensitivity: 1.1,
    viewportPanelsCollapsed: true,
    project: {
      ...createDefaultDirectorProject(),
      scene: { ...createDefaultDirectorProject().scene, backgroundColor: "#303640" },
    },
  });

  await useDirectorStore.getState().openScopedScene("desk_remote");
  const state = useDirectorStore.getState();

  expect(state.viewMode).toBe("camera");
  expect(state.directorViewSnapshot).toEqual({
    fov: 38,
    position: [7, 5, 9],
    target: [0, 1, -1],
  });
  expect(state.transformMode).toBe("rotate");
  expect(state.viewportAspectRatio).toBe("9:16");
  expect(state.viewportRuleOfThirdsEnabled).toBe(true);
  expect(state.viewportRotateSensitivity).toBe(0.9);
  expect(state.viewportZoomSensitivity).toBe(1.1);
  expect(state.viewportPanelsCollapsed).toBe(true);
  expect(state.selectedObjectId).toBe("char_default_a");
  expect(state.project.scene.backgroundColor).toBe("#303640");
});

it("rejects a director desk switch when the backend scene cannot be loaded", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    json: async () => ({}),
  } as Response);

  await expect(useDirectorStore.getState().openScopedScene("desk_load_failure")).rejects.toThrow(
    "导演台场景接口请求失败（500）"
  );

  expect(useDirectorStore.getState().project.scene.backgroundColor).toBe("#000000");
  expect(consoleError).toHaveBeenCalled();
});

it("rejects a director desk switch when the pending scene cannot be saved", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await useDirectorStore.getState().openScopedScene("desk_save_failure");
  useDirectorStore.getState().updateScene({ backgroundColor: "#151515" });
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    json: async () => ({}),
  } as Response);

  await expect(useDirectorStore.getState().openScopedScene("desk_not_opened")).rejects.toThrow(
    "导演台场景保存失败"
  );

  expect(useDirectorStore.getState().project.scene.backgroundColor).toBe("#151515");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(consoleError).toHaveBeenCalled();
});

it("adds an empty motion path when loading a legacy camera from the backend", async () => {
  const legacyProject = createDefaultDirectorProject();
  delete legacyProject.cameras[0].motionPath;
  remoteScenes.set("desk_legacy_camera", { ...createInitialDirectorState(), project: legacyProject });
  await useDirectorStore.getState().openScopedScene("desk_legacy_camera");

  expect(useDirectorStore.getState().project.cameras[0].motionPath).toEqual({
    duration: 6,
    loop: false,
    interpolation: "smooth",
    easing: "ease-in-out",
    keyframes: [],
  });
});

it("keeps motion playback state transient when saving the backend snapshot", async () => {
  await useDirectorStore.getState().openScopedScene("desk_transient_state");
  fetchMock.mockClear();
  useDirectorStore.getState().setCameraMotionProgress(0.625);
  useDirectorStore.getState().setCameraMotionPlaying(true);
  useDirectorStore.getState().selectCameraMotionKeyframe("motion_key_preview");
  useDirectorStore.getState().saveLatestSnapshot();

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { scene: Record<string, unknown> };
  const persisted = body.scene;

  expect(persisted).not.toHaveProperty("cameraMotionProgress");
  expect(persisted).not.toHaveProperty("cameraMotionPlaying");
  expect(persisted).not.toHaveProperty("selectedCameraKeyframeId");
  expect((persisted.project as { cameras?: unknown[] } | undefined)?.cameras).toHaveLength(1);
});

it("migrates backend procedural characters to the built-in UE4 mannequin rig", async () => {
  const legacyProject = createDefaultDirectorProject();
  const legacyCharacter = legacyProject.objects.find((item) => item.kind === "character");

  if (!legacyCharacter) {
    throw new Error("Expected default character");
  }

  legacyCharacter.color = "#4F8EF7";
  legacyCharacter.transform.position = [1, 0, -2];
  legacyCharacter.characterRig = {
    rigType: "mannequin",
    posePresetId: "stand",
    controls: {
      "head.yaw": 12,
    },
  };

  remoteScenes.set("desk_legacy_character", { ...createInitialDirectorState(), project: legacyProject });
  await useDirectorStore.getState().openScopedScene("desk_legacy_character");
  const migratedCharacter = useDirectorStore.getState().project.objects.find((item) => item.id === legacyCharacter.id);

  expect(migratedCharacter?.transform.position).toEqual([1, 0, -2]);
  expect(migratedCharacter?.color).toBe("#4F8EF7");
  expect(migratedCharacter?.characterRig).toEqual({
    rigType: "ue4-mannequin",
    posePresetId: "stand",
    controls: {
      "head.yaw": 12,
    },
  });
});

it("preserves an imported character rig and its animation assets during project migration", () => {
  const project = createDefaultDirectorProject();
  project.objects[0] = {
    ...project.objects[0],
    assetRefId: "asset_character_1",
    characterRig: { rigType: "mixamo", posePresetId: "stand", controls: {} },
  };
  project.assets = [{
    id: "asset_character_1",
    kind: "character",
    sourceType: "model",
    fileName: "actor.glb",
    url: "data:model/gltf-binary;base64,AA==",
    modelFormat: "glb",
    characterRigProfile: "mixamo",
  }];
  project.animationAssets = [{
    id: "animation_1",
    name: "walk",
    fileName: "walk.glb",
    url: "data:model/gltf-binary;base64,AA==",
    modelFormat: "glb",
    rigProfile: "mixamo",
    clips: [{ name: "Walk", duration: 1, trackCount: 1 }],
  }];

  useDirectorStore.getState().replaceProject(project);

  expect(useDirectorStore.getState().project.objects[0]?.characterRig?.rigType).toBe("mixamo");
  expect(useDirectorStore.getState().project.animationAssets).toEqual(project.animationAssets);
});

it("returns backend characters from impossible elevated positions to the scene ground", async () => {
  const state = createInitialDirectorState();
  const character = state.project.objects.find((item) => item.kind === "character");

  if (!character) throw new Error("Expected default character");
  character.transform.position = [0, 120, 0];

  remoteScenes.set("desk_elevated_character", state);
  await useDirectorStore.getState().openScopedScene("desk_elevated_character");
  expect(useDirectorStore.getState().project.objects.find((item) => item.id === character.id)?.transform.position).toEqual([0, 0, 0]);

  useDirectorStore.getState().updateObjectTransform(character.id, { position: [0, 120, 0] });
  expect(useDirectorStore.getState().project.objects.find((item) => item.id === character.id)?.transform.position).toEqual([0, 0, 0]);
});

it("adds the built-in UE4 mannequin rig to backend characters that predate rig metadata", async () => {
  const legacyProject = createDefaultDirectorProject();
  const legacyCharacter = legacyProject.objects.find((item) => item.kind === "character");

  if (!legacyCharacter) {
    throw new Error("Expected default character");
  }

  delete legacyCharacter.characterRig;

  remoteScenes.set("desk_missing_rig", { ...createInitialDirectorState(), project: legacyProject });
  await useDirectorStore.getState().openScopedScene("desk_missing_rig");
  const migratedCharacter = useDirectorStore.getState().project.objects.find((item) => item.id === legacyCharacter.id);

  expect(migratedCharacter?.characterRig).toEqual({
    rigType: "ue4-mannequin",
    posePresetId: "stand",
    controls: {},
  });
});

it("copies and pastes the current selection as new scene objects", () => {
  useDirectorStore.getState().selectObject("char_default_a");

  useDirectorStore.getState().copySelectedObjects();
  useDirectorStore.getState().pasteClipboardObjects();

  const state = useDirectorStore.getState();
  const characters = state.project.objects.filter((item) => item.kind === "character");
  const pastedCharacter = characters.find((item) => item.id !== "char_default_a");

  expect(characters).toHaveLength(2);
  expect(pastedCharacter?.id).not.toBe("char_default_a");
  expect(pastedCharacter?.transform.position).toEqual([0.6, 0, 0.6]);
  expect(state.selectedObjectId).toBe(pastedCharacter?.id ?? null);
  expect(state.selectedObjectIds).toEqual(pastedCharacter ? [pastedCharacter.id] : []);
});

it("undoes the latest scene mutation", () => {
  useDirectorStore.getState().addPresetCharacter("female");

  expect(useDirectorStore.getState().project.objects.some((item) => item.name === "角色02")).toBe(true);

  useDirectorStore.getState().undo();

  expect(useDirectorStore.getState().project.objects.some((item) => item.name === "角色02")).toBe(false);
  expect(useDirectorStore.getState().project.objects.filter((item) => item.kind === "character")).toHaveLength(1);
});

it("groups repeated transform updates into one undo step while batching", () => {
  useDirectorStore.getState().beginUndoBatch();
  useDirectorStore.getState().updateObjectTransform("char_default_a", { position: [1, 0, 0] });
  useDirectorStore.getState().updateObjectTransform("char_default_a", { position: [2, 0, 0] });
  useDirectorStore.getState().updateObjectTransform("char_default_a", { position: [3, 0, 0] });
  useDirectorStore.getState().endUndoBatch();

  expect(useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a")?.transform.position).toEqual([
    3, 0, 0,
  ]);

  useDirectorStore.getState().undo();

  expect(useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a")?.transform.position).toEqual([
    0, 0, 0,
  ]);
});

it("groups pose gizmo updates into one undo step and clears active presets", () => {
  const initial = useDirectorStore.getState();
  useDirectorStore.setState({
    ...initial,
    project: {
      ...initial.project,
      objects: initial.project.objects.map((item) =>
        item.id === "char_default_a" && item.characterRig
          ? {
              ...item,
              characterRig: {
                ...item.characterRig,
                posePresetId: "stand",
                actionPresetId: "walk-cycle",
              },
            }
          : item
      ),
    },
  });

  useDirectorStore.getState().beginUndoBatch();
  useDirectorStore.getState().updatePoseControls("char_default_a", {
    "leftShoulder.pitch": 20,
    "leftShoulder.twist": 10,
  });
  useDirectorStore.getState().updatePoseControls("char_default_a", {
    "leftShoulder.pitch": 35,
  });
  useDirectorStore.getState().endUndoBatch();

  let rig = useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a")?.characterRig;
  expect(rig?.posePresetId).toBeNull();
  expect(rig?.actionPresetId).toBeNull();
  expect(rig?.controls["leftShoulder.pitch"]).toBe(35);
  expect(rig?.controls["leftShoulder.twist"]).toBe(10);

  useDirectorStore.getState().undo();

  rig = useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a")?.characterRig;
  expect(rig?.posePresetId).toBe("stand");
  expect(rig?.actionPresetId).toBe("walk-cycle");
  expect(rig?.controls["leftShoulder.pitch"]).toBeUndefined();
});
