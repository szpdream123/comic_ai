import { render } from "@testing-library/react";
import {
  BUILTIN_SCENE_EXPANSION_MODEL_IDS,
  BuiltInSceneExpansionModel,
  isBuiltInSceneExpansionModel,
} from "./BuiltInSceneExpansionModel";

it("recognizes every model in the second built-in scene expansion", () => {
  expect(BUILTIN_SCENE_EXPANSION_MODEL_IDS).toHaveLength(32);
  expect(BUILTIN_SCENE_EXPANSION_MODEL_IDS.every((modelId) => isBuiltInSceneExpansionModel(modelId))).toBe(true);
  expect(isBuiltInSceneExpansionModel("unknown_model.fbx")).toBe(false);
});

it.each([
  ["bed_double_low.fbx", "builtin-double-bed", "boxgeometry", 4],
  ["escalator_low.fbx", "builtin-escalator", "boxgeometry", 10],
  ["traffic_light_low.fbx", "builtin-traffic-light", "cylindergeometry", 4],
  ["motorcycle_low.fbx", "builtin-motorcycle", "torusgeometry", 2],
] as const)("renders the expanded scene model %s", (modelId, groupName, geometrySelector, minimumCount) => {
  const { container } = render(<BuiltInSceneExpansionModel modelId={modelId} />);

  expect(container.querySelector(`group[name="${groupName}"]`)).toBeInTheDocument();
  expect(container.querySelectorAll(geometrySelector).length).toBeGreaterThanOrEqual(minimumCount);
});
