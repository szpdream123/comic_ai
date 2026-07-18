import { getPoseJointControlPatch, getPoseJointRotation } from "./poseHandles";

it("maps body, limb, hinge, hand, and foot controls to joint rotations", () => {
  expect(getPoseJointRotation("body", { "body.pitch": 10, "body.yaw": 20, "body.roll": 30 })).toEqual([
    Math.PI / 18,
    Math.PI / 9,
    Math.PI / 6,
  ]);
  expect(getPoseJointRotation("leftShoulder", {
    "leftShoulder.pitch": 10,
    "leftShoulder.twist": 20,
    "leftShoulder.spread": 30,
  })).toEqual([Math.PI / 18, Math.PI / 9, Math.PI / 6]);
  expect(getPoseJointRotation("rightElbow", { "rightElbow.bend": 45 })).toEqual([Math.PI / 4, 0, 0]);
  expect(getPoseJointRotation("leftHand", {
    "leftHand.pitch": 10,
    "leftHand.twist": 20,
    "leftHand.roll": 30,
  })).toEqual([Math.PI / 18, Math.PI / 9, Math.PI / 6]);
  expect(getPoseJointRotation("rightFoot", {
    "rightFoot.pitch": 10,
    "rightFoot.twist": 20,
    "rightFoot.roll": 30,
  })).toEqual([Math.PI / 18, Math.PI / 9, Math.PI / 6]);
});

it("maps edited joint rotations back to existing rig controls and clamps them", () => {
  expect(getPoseJointControlPatch("torso", [Math.PI / 6, Math.PI / 4, Math.PI / 3])).toEqual({
    "torso.pitch": 30,
    "torso.yaw": 45,
    "torso.roll": 60,
  });
  expect(getPoseJointControlPatch("leftHip", [Math.PI / 6, Math.PI / 4, Math.PI / 3])).toEqual({
    "leftHip.pitch": 30,
    "leftHip.twist": 45,
    "leftHip.spread": 60,
  });
  expect(getPoseJointControlPatch("leftKnee", [Math.PI, Math.PI / 4, Math.PI / 3])).toEqual({
    "leftKnee.bend": 90,
  });
  expect(getPoseJointControlPatch("rightHand", [-Math.PI, Math.PI / 4, Math.PI / 3])).toEqual({
    "rightHand.pitch": -90,
    "rightHand.twist": 45,
    "rightHand.roll": 60,
  });
});
