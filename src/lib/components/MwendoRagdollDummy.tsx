import {
  RigidBody,
  useRevoluteJoint,
  useSphericalJoint,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useRef } from "react";
import type { MwendoVec3 } from "../types";
import {
  MwendoRagdollDebug,
  type MwendoRagdollBodyDescriptor,
  type MwendoRagdollJointDescriptor,
} from "./MwendoRagdollDebug";

export type MwendoRagdollDummyProps = {
  position?: MwendoVec3;
  debug?: boolean;
  paused?: boolean;
  timeScale?: number;
  manualStepCount?: number;
};

function LimbBox(props: { color: string; scale: [number, number, number] }) {
  return (
    <mesh castShadow receiveShadow scale={props.scale}>
      <boxGeometry />
      <meshStandardMaterial color={props.color} roughness={0.82} />
    </mesh>
  );
}

export function MwendoRagdollDummy({
  position = [0, 4.5, 0],
  debug = false,
  paused = false,
  timeScale = 1,
  manualStepCount = 0,
}: MwendoRagdollDummyProps) {
  const torso = useRef<RapierRigidBody>(null!);
  const head = useRef<RapierRigidBody>(null!);
  const upperArmLeft = useRef<RapierRigidBody>(null!);
  const lowerArmLeft = useRef<RapierRigidBody>(null!);
  const upperArmRight = useRef<RapierRigidBody>(null!);
  const lowerArmRight = useRef<RapierRigidBody>(null!);
  const upperLegLeft = useRef<RapierRigidBody>(null!);
  const lowerLegLeft = useRef<RapierRigidBody>(null!);
  const upperLegRight = useRef<RapierRigidBody>(null!);
  const lowerLegRight = useRef<RapierRigidBody>(null!);

  const bodyDescriptors: MwendoRagdollBodyDescriptor[] = [
    {
      key: "torso",
      label: "Torso",
      ref: torso,
      mass: 4.5,
      color: "#cc6f5a",
      shape: { kind: "box", size: [0.9, 1.5, 0.45] },
    },
    {
      key: "head",
      label: "Head",
      ref: head,
      mass: 1.1,
      color: "#f1d7b8",
      shape: { kind: "sphere", radius: 0.32 },
    },
    {
      key: "upperArmLeft",
      label: "Upper Arm L",
      ref: upperArmLeft,
      mass: 0.9,
      color: "#4a88c7",
      shape: { kind: "box", size: [0.28, 0.7, 0.28] },
    },
    {
      key: "lowerArmLeft",
      label: "Lower Arm L",
      ref: lowerArmLeft,
      mass: 0.8,
      color: "#3d6b9b",
      shape: { kind: "box", size: [0.24, 0.68, 0.24] },
    },
    {
      key: "upperArmRight",
      label: "Upper Arm R",
      ref: upperArmRight,
      mass: 0.9,
      color: "#4a88c7",
      shape: { kind: "box", size: [0.28, 0.7, 0.28] },
    },
    {
      key: "lowerArmRight",
      label: "Lower Arm R",
      ref: lowerArmRight,
      mass: 0.8,
      color: "#3d6b9b",
      shape: { kind: "box", size: [0.24, 0.68, 0.24] },
    },
    {
      key: "upperLegLeft",
      label: "Upper Leg L",
      ref: upperLegLeft,
      mass: 1.4,
      color: "#203244",
      shape: { kind: "box", size: [0.32, 0.92, 0.32] },
    },
    {
      key: "lowerLegLeft",
      label: "Lower Leg L",
      ref: lowerLegLeft,
      mass: 1.1,
      color: "#162434",
      shape: { kind: "box", size: [0.28, 0.88, 0.28] },
    },
    {
      key: "upperLegRight",
      label: "Upper Leg R",
      ref: upperLegRight,
      mass: 1.4,
      color: "#203244",
      shape: { kind: "box", size: [0.32, 0.92, 0.32] },
    },
    {
      key: "lowerLegRight",
      label: "Lower Leg R",
      ref: lowerLegRight,
      mass: 1.1,
      color: "#162434",
      shape: { kind: "box", size: [0.28, 0.88, 0.28] },
    },
  ];

  const jointDescriptors: MwendoRagdollJointDescriptor[] = [
    {
      key: "neck",
      kind: "spherical",
      bodyA: torso,
      bodyB: head,
      anchorA: [0, 0.8, 0],
      anchorB: [0, -0.28, 0],
    },
    {
      key: "shoulderLeft",
      kind: "spherical",
      bodyA: torso,
      bodyB: upperArmLeft,
      anchorA: [-0.5, 0.55, 0],
      anchorB: [0, 0.28, 0],
    },
    {
      key: "shoulderRight",
      kind: "spherical",
      bodyA: torso,
      bodyB: upperArmRight,
      anchorA: [0.5, 0.55, 0],
      anchorB: [0, 0.28, 0],
    },
    {
      key: "hipLeft",
      kind: "spherical",
      bodyA: torso,
      bodyB: upperLegLeft,
      anchorA: [-0.22, -0.72, 0],
      anchorB: [0, 0.44, 0],
    },
    {
      key: "hipRight",
      kind: "spherical",
      bodyA: torso,
      bodyB: upperLegRight,
      anchorA: [0.22, -0.72, 0],
      anchorB: [0, 0.44, 0],
    },
    {
      key: "elbowLeft",
      kind: "revolute",
      bodyA: upperArmLeft,
      bodyB: lowerArmLeft,
      anchorA: [0, -0.34, 0],
      anchorB: [0, 0.34, 0],
      axis: [1, 0, 0],
      limits: [-2.1, 0.16],
    },
    {
      key: "elbowRight",
      kind: "revolute",
      bodyA: upperArmRight,
      bodyB: lowerArmRight,
      anchorA: [0, -0.34, 0],
      anchorB: [0, 0.34, 0],
      axis: [1, 0, 0],
      limits: [-2.1, 0.16],
    },
    {
      key: "kneeLeft",
      kind: "revolute",
      bodyA: upperLegLeft,
      bodyB: lowerLegLeft,
      anchorA: [0, -0.44, 0],
      anchorB: [0, 0.44, 0],
      axis: [1, 0, 0],
      limits: [-2.35, 0.2],
    },
    {
      key: "kneeRight",
      kind: "revolute",
      bodyA: upperLegRight,
      bodyB: lowerLegRight,
      anchorA: [0, -0.44, 0],
      anchorB: [0, 0.44, 0],
      axis: [1, 0, 0],
      limits: [-2.35, 0.2],
    },
  ];

  useSphericalJoint(torso, head, [[0, 0.8, 0], [0, -0.28, 0]]);
  useSphericalJoint(torso, upperArmLeft, [[-0.5, 0.55, 0], [0, 0.28, 0]]);
  useSphericalJoint(torso, upperArmRight, [[0.5, 0.55, 0], [0, 0.28, 0]]);
  useSphericalJoint(torso, upperLegLeft, [[-0.22, -0.72, 0], [0, 0.44, 0]]);
  useSphericalJoint(torso, upperLegRight, [[0.22, -0.72, 0], [0, 0.44, 0]]);

  useRevoluteJoint(upperArmLeft, lowerArmLeft, [[0, -0.34, 0], [0, 0.34, 0], [1, 0, 0], [-2.1, 0.16]]);
  useRevoluteJoint(upperArmRight, lowerArmRight, [[0, -0.34, 0], [0, 0.34, 0], [1, 0, 0], [-2.1, 0.16]]);
  useRevoluteJoint(upperLegLeft, lowerLegLeft, [[0, -0.44, 0], [0, 0.44, 0], [1, 0, 0], [-2.35, 0.2]]);
  useRevoluteJoint(upperLegRight, lowerLegRight, [[0, -0.44, 0], [0, 0.44, 0], [1, 0, 0], [-2.35, 0.2]]);

  return (
    <group position={position}>
      {debug ? (
        <MwendoRagdollDebug
          bodies={bodyDescriptors}
          joints={jointDescriptors}
          manualStepCount={manualStepCount}
          origin={position}
          paused={paused}
          timeScale={timeScale}
        />
      ) : null}

      <RigidBody ref={torso} colliders="cuboid" mass={4.5} position={[0, 0, 0]}>
        <LimbBox color="#cc6f5a" scale={[0.9, 1.5, 0.45]} />
      </RigidBody>

      <RigidBody ref={head} colliders="ball" mass={1.1} position={[0, 1.2, 0]}>
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.32, 24, 24]} />
          <meshStandardMaterial color="#f1d7b8" roughness={0.9} />
        </mesh>
      </RigidBody>

      <RigidBody ref={upperArmLeft} colliders="cuboid" mass={0.9} position={[-0.92, 0.4, 0]}>
        <LimbBox color="#4a88c7" scale={[0.28, 0.7, 0.28]} />
      </RigidBody>
      <RigidBody ref={lowerArmLeft} colliders="cuboid" mass={0.8} position={[-0.92, -0.34, 0]}>
        <LimbBox color="#3d6b9b" scale={[0.24, 0.68, 0.24]} />
      </RigidBody>

      <RigidBody ref={upperArmRight} colliders="cuboid" mass={0.9} position={[0.92, 0.4, 0]}>
        <LimbBox color="#4a88c7" scale={[0.28, 0.7, 0.28]} />
      </RigidBody>
      <RigidBody ref={lowerArmRight} colliders="cuboid" mass={0.8} position={[0.92, -0.34, 0]}>
        <LimbBox color="#3d6b9b" scale={[0.24, 0.68, 0.24]} />
      </RigidBody>

      <RigidBody ref={upperLegLeft} colliders="cuboid" mass={1.4} position={[-0.24, -1.55, 0]}>
        <LimbBox color="#203244" scale={[0.32, 0.92, 0.32]} />
      </RigidBody>
      <RigidBody ref={lowerLegLeft} colliders="cuboid" mass={1.1} position={[-0.24, -2.44, 0]}>
        <LimbBox color="#162434" scale={[0.28, 0.88, 0.28]} />
      </RigidBody>

      <RigidBody ref={upperLegRight} colliders="cuboid" mass={1.4} position={[0.24, -1.55, 0]}>
        <LimbBox color="#203244" scale={[0.32, 0.92, 0.32]} />
      </RigidBody>
      <RigidBody ref={lowerLegRight} colliders="cuboid" mass={1.1} position={[0.24, -2.44, 0]}>
        <LimbBox color="#162434" scale={[0.28, 0.88, 0.28]} />
      </RigidBody>
    </group>
  );
}
