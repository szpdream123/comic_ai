import { Bone, BoxGeometry, MeshBasicMaterial, Skeleton, SkinnedMesh } from "three";
import { expect, it } from "vitest";
import { inspectCharacterAsset } from "./characterAssetInspection";

it("inspects a rigged humanoid model and produces an automatic bone map", () => {
  const names = [
    "Hips", "Spine2", "Head", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand",
    "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot",
  ];
  const bones = names.map((name) => {
    const bone = new Bone();
    bone.name = name;
    return bone;
  });
  const mesh = new SkinnedMesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial());
  mesh.add(bones[0]);
  mesh.bind(new Skeleton(bones));

  const report = inspectCharacterAsset(mesh);

  expect(report.readiness).toBe("ready");
  expect(report.skinnedMeshCount).toBe(1);
  expect(report.boneMap).toMatchObject({ head: "Head", leftFoot: "LeftFoot", rightFoot: "RightFoot" });
});
