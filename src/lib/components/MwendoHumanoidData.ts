import { createRef, type RefObject } from "react";
import type { RapierRigidBody } from "@react-three/rapier";
import type { MwendoVec3 } from "../types";

export type MwendoHumanoidBodyKey =
  | "pelvis"
  | "chest"
  | "head"
  | "upperArmLeft"
  | "lowerArmLeft"
  | "handLeft"
  | "upperArmRight"
  | "lowerArmRight"
  | "handRight"
  | "upperLegLeft"
  | "lowerLegLeft"
  | "footLeft"
  | "upperLegRight"
  | "lowerLegRight"
  | "footRight";

export type MwendoHumanoidBodyShape =
  | {
      kind: "box";
      size: MwendoVec3;
    }
  | {
      kind: "sphere";
      radius: number;
    };

export type MwendoHumanoidBodyDefinition = {
  key: MwendoHumanoidBodyKey;
  label: string;
  position: MwendoVec3;
  mass: number;
  color: string;
  collider: "cuboid" | "ball";
  shape: MwendoHumanoidBodyShape;
  meshOffset?: MwendoVec3;
  roughness?: number;
};

export type MwendoHumanoidSphericalJointDefinition = {
  key:
    | "spine"
    | "neck"
    | "shoulderLeft"
    | "shoulderRight"
    | "hipLeft"
    | "hipRight";
  kind: "spherical";
  bodyA: MwendoHumanoidBodyKey;
  bodyB: MwendoHumanoidBodyKey;
  anchorA: MwendoVec3;
  anchorB: MwendoVec3;
};

export type MwendoHumanoidRevoluteJointDefinition = {
  key:
    | "elbowLeft"
    | "wristLeft"
    | "elbowRight"
    | "wristRight"
    | "kneeLeft"
    | "ankleLeft"
    | "kneeRight"
    | "ankleRight";
  kind: "revolute";
  bodyA: MwendoHumanoidBodyKey;
  bodyB: MwendoHumanoidBodyKey;
  anchorA: MwendoVec3;
  anchorB: MwendoVec3;
  axis: MwendoVec3;
  limits: [number, number];
};

export type MwendoHumanoidJointDefinition =
  | MwendoHumanoidSphericalJointDefinition
  | MwendoHumanoidRevoluteJointDefinition;

export type MwendoHumanoidBodyRefs = Record<
  MwendoHumanoidBodyKey,
  RefObject<RapierRigidBody | null>
>;

export const MWENDO_HUMANOID_BODY_DEFINITIONS: MwendoHumanoidBodyDefinition[] = [
  {
    key: "pelvis",
    label: "Pelvis",
    position: [0, 0, 0],
    mass: 2.2,
    color: "#87483d",
    collider: "cuboid",
    shape: { kind: "box", size: [0.58, 0.46, 0.32] },
  },
  {
    key: "chest",
    label: "Chest",
    position: [0, 0.68, 0],
    mass: 2.8,
    color: "#cc6f5a",
    collider: "cuboid",
    shape: { kind: "box", size: [0.84, 1, 0.42] },
  },
  {
    key: "head",
    label: "Head",
    position: [0, 1.42, 0],
    mass: 1,
    color: "#f1d7b8",
    collider: "ball",
    shape: { kind: "sphere", radius: 0.32 },
    roughness: 0.9,
  },
  {
    key: "upperArmLeft",
    label: "Upper Arm L",
    position: [-0.44, 0.68, 0],
    mass: 0.7,
    color: "#4a88c7",
    collider: "cuboid",
    shape: { kind: "box", size: [0.24, 0.58, 0.24] },
    meshOffset: [0, -0.05, 0],
  },
  {
    key: "lowerArmLeft",
    label: "Lower Arm L",
    position: [-0.44, 0.2, 0],
    mass: 0.55,
    color: "#3d6b9b",
    collider: "cuboid",
    shape: { kind: "box", size: [0.2, 0.54, 0.2] },
    meshOffset: [0, -0.03, 0],
  },
  {
    key: "handLeft",
    label: "Hand L",
    position: [-0.44, -0.12, 0.02],
    mass: 0.3,
    color: "#f1d7b8",
    collider: "cuboid",
    shape: { kind: "box", size: [0.18, 0.18, 0.26] },
    roughness: 0.9,
  },
  {
    key: "upperArmRight",
    label: "Upper Arm R",
    position: [0.44, 0.68, 0],
    mass: 0.7,
    color: "#4a88c7",
    collider: "cuboid",
    shape: { kind: "box", size: [0.24, 0.58, 0.24] },
    meshOffset: [0, -0.05, 0],
  },
  {
    key: "lowerArmRight",
    label: "Lower Arm R",
    position: [0.44, 0.2, 0],
    mass: 0.55,
    color: "#3d6b9b",
    collider: "cuboid",
    shape: { kind: "box", size: [0.2, 0.54, 0.2] },
    meshOffset: [0, -0.03, 0],
  },
  {
    key: "handRight",
    label: "Hand R",
    position: [0.44, -0.12, 0.02],
    mass: 0.3,
    color: "#f1d7b8",
    collider: "cuboid",
    shape: { kind: "box", size: [0.18, 0.18, 0.26] },
    roughness: 0.9,
  },
  {
    key: "upperLegLeft",
    label: "Upper Leg L",
    position: [-0.18, -0.56, 0],
    mass: 1.5,
    color: "#203244",
    collider: "cuboid",
    shape: { kind: "box", size: [0.3, 0.82, 0.3] },
  },
  {
    key: "lowerLegLeft",
    label: "Lower Leg L",
    position: [-0.18, -1.24, 0.02],
    mass: 1.2,
    color: "#162434",
    collider: "cuboid",
    shape: { kind: "box", size: [0.26, 0.78, 0.26] },
  },
  {
    key: "footLeft",
    label: "Foot L",
    position: [-0.18, -1.74, 0.16],
    mass: 0.5,
    color: "#101826",
    collider: "cuboid",
    shape: { kind: "box", size: [0.24, 0.16, 0.48] },
  },
  {
    key: "upperLegRight",
    label: "Upper Leg R",
    position: [0.18, -0.56, 0],
    mass: 1.5,
    color: "#203244",
    collider: "cuboid",
    shape: { kind: "box", size: [0.3, 0.82, 0.3] },
  },
  {
    key: "lowerLegRight",
    label: "Lower Leg R",
    position: [0.18, -1.24, 0.02],
    mass: 1.2,
    color: "#162434",
    collider: "cuboid",
    shape: { kind: "box", size: [0.26, 0.78, 0.26] },
  },
  {
    key: "footRight",
    label: "Foot R",
    position: [0.18, -1.74, 0.16],
    mass: 0.5,
    color: "#101826",
    collider: "cuboid",
    shape: { kind: "box", size: [0.24, 0.16, 0.48] },
  },
];

export const MWENDO_HUMANOID_SPHERICAL_JOINT_DEFINITIONS: MwendoHumanoidSphericalJointDefinition[] =
  [
    {
      key: "spine",
      kind: "spherical",
      bodyA: "pelvis",
      bodyB: "chest",
      anchorA: [0, 0.28, 0],
      anchorB: [0, -0.4, 0],
    },
    {
      key: "neck",
      kind: "spherical",
      bodyA: "chest",
      bodyB: "head",
      anchorA: [0, 0.46, 0],
      anchorB: [0, -0.28, 0],
    },
    {
      key: "shoulderLeft",
      kind: "spherical",
      bodyA: "chest",
      bodyB: "upperArmLeft",
      anchorA: [-0.44, 0.24, 0],
      anchorB: [0, 0.24, 0],
    },
    {
      key: "shoulderRight",
      kind: "spherical",
      bodyA: "chest",
      bodyB: "upperArmRight",
      anchorA: [0.44, 0.24, 0],
      anchorB: [0, 0.24, 0],
    },
    {
      key: "hipLeft",
      kind: "spherical",
      bodyA: "pelvis",
      bodyB: "upperLegLeft",
      anchorA: [-0.18, -0.22, 0],
      anchorB: [0, 0.34, 0],
    },
    {
      key: "hipRight",
      kind: "spherical",
      bodyA: "pelvis",
      bodyB: "upperLegRight",
      anchorA: [0.18, -0.22, 0],
      anchorB: [0, 0.34, 0],
    },
  ];

export const MWENDO_HUMANOID_REVOLUTE_JOINT_DEFINITIONS: MwendoHumanoidRevoluteJointDefinition[] =
  [
    {
      key: "elbowLeft",
      kind: "revolute",
      bodyA: "upperArmLeft",
      bodyB: "lowerArmLeft",
      anchorA: [0, -0.24, 0],
      anchorB: [0, 0.24, 0],
      axis: [1, 0, 0],
      limits: [-2.1, 0.1],
    },
    {
      key: "wristLeft",
      kind: "revolute",
      bodyA: "lowerArmLeft",
      bodyB: "handLeft",
      anchorA: [0, -0.24, 0],
      anchorB: [0, 0.08, 0],
      axis: [1, 0, 0],
      limits: [-0.65, 0.65],
    },
    {
      key: "elbowRight",
      kind: "revolute",
      bodyA: "upperArmRight",
      bodyB: "lowerArmRight",
      anchorA: [0, -0.24, 0],
      anchorB: [0, 0.24, 0],
      axis: [1, 0, 0],
      limits: [-2.1, 0.1],
    },
    {
      key: "wristRight",
      kind: "revolute",
      bodyA: "lowerArmRight",
      bodyB: "handRight",
      anchorA: [0, -0.24, 0],
      anchorB: [0, 0.08, 0],
      axis: [1, 0, 0],
      limits: [-0.65, 0.65],
    },
    {
      key: "kneeLeft",
      kind: "revolute",
      bodyA: "upperLegLeft",
      bodyB: "lowerLegLeft",
      anchorA: [0, -0.34, 0],
      anchorB: [0, 0.34, 0],
      axis: [1, 0, 0],
      limits: [-2.35, 0.15],
    },
    {
      key: "ankleLeft",
      kind: "revolute",
      bodyA: "lowerLegLeft",
      bodyB: "footLeft",
      anchorA: [0, -0.34, 0],
      anchorB: [0, 0.06, -0.14],
      axis: [1, 0, 0],
      limits: [-0.55, 0.45],
    },
    {
      key: "kneeRight",
      kind: "revolute",
      bodyA: "upperLegRight",
      bodyB: "lowerLegRight",
      anchorA: [0, -0.34, 0],
      anchorB: [0, 0.34, 0],
      axis: [1, 0, 0],
      limits: [-2.35, 0.15],
    },
    {
      key: "ankleRight",
      kind: "revolute",
      bodyA: "lowerLegRight",
      bodyB: "footRight",
      anchorA: [0, -0.34, 0],
      anchorB: [0, 0.06, -0.14],
      axis: [1, 0, 0],
      limits: [-0.55, 0.45],
    },
  ];

export const MWENDO_HUMANOID_JOINT_DEFINITIONS: MwendoHumanoidJointDefinition[] = [
  ...MWENDO_HUMANOID_SPHERICAL_JOINT_DEFINITIONS,
  ...MWENDO_HUMANOID_REVOLUTE_JOINT_DEFINITIONS,
];

export function createMwendoHumanoidBodyRefs(): MwendoHumanoidBodyRefs {
  return {
    pelvis: createRef<RapierRigidBody>(),
    chest: createRef<RapierRigidBody>(),
    head: createRef<RapierRigidBody>(),
    upperArmLeft: createRef<RapierRigidBody>(),
    lowerArmLeft: createRef<RapierRigidBody>(),
    handLeft: createRef<RapierRigidBody>(),
    upperArmRight: createRef<RapierRigidBody>(),
    lowerArmRight: createRef<RapierRigidBody>(),
    handRight: createRef<RapierRigidBody>(),
    upperLegLeft: createRef<RapierRigidBody>(),
    lowerLegLeft: createRef<RapierRigidBody>(),
    footLeft: createRef<RapierRigidBody>(),
    upperLegRight: createRef<RapierRigidBody>(),
    lowerLegRight: createRef<RapierRigidBody>(),
    footRight: createRef<RapierRigidBody>(),
  };
}
