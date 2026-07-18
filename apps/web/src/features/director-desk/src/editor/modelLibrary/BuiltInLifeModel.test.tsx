import { render } from "@testing-library/react";
import { BuiltInLifeModel } from "./BuiltInLifeModel";

it.each([
  ["bus_shelter_low.fbx", "boxgeometry", 5],
  ["office_chair_low.fbx", "boxgeometry", 7],
  ["coffee_machine_low.fbx", "cylindergeometry", 2],
  ["wheelchair_low.fbx", "torusgeometry", 2],
  ["cinema_camera_low.fbx", "cylindergeometry", 2],
  ["rock_low.fbx", "dodecahedrongeometry", 1],
] as const)("renders a recognizable procedural shape for %s", (modelId, selector, minimumCount) => {
  const { container } = render(<BuiltInLifeModel modelId={modelId} />);

  expect(container.querySelectorAll(selector).length).toBeGreaterThanOrEqual(minimumCount);
});
