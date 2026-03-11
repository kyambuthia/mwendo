import {
  RigidBody,
  interactionGroups,
  useRevoluteJoint,
  useSphericalJoint,
  type RapierRigidBody,
} from "@react-three/rapier";
import {
  useEffect,
  useMemo,
  type ComponentProps,
  type MutableRefObject,
  type RefObject,
} from "react";
import type { MwendoVec3 } from "../types";
import {
  MwendoRagdollDebug,
  type MwendoRagdollBodyDescriptor,
  type MwendoRagdollJointDescriptor,
} from "./MwendoRagdollDebug";
import {
  createMwendoHumanoidBodyRefs,
  MWENDO_HUMANOID_BODY_DEFINITIONS,
  MWENDO_HUMANOID_JOINT_DEFINITIONS,
  MWENDO_HUMANOID_REVOLUTE_JOINT_DEFINITIONS,
  MWENDO_HUMANOID_SPHERICAL_JOINT_DEFINITIONS,
  type MwendoHumanoidBodyDefinition,
  type MwendoHumanoidBodyKey,
  type MwendoHumanoidBodyRefs,
  type MwendoHumanoidRevoluteJointKey,
  type MwendoHumanoidRevoluteJointDefinition,
  type MwendoHumanoidRevoluteJointRefs,
  type MwendoHumanoidSphericalJointDefinition,
} from "./MwendoHumanoidData";

const RAGDOLL_COLLISION_GROUPS = interactionGroups([1], [0]);

type MwendoHumanoidBodyOverrides = Omit<
  ComponentProps<typeof RigidBody>,
  "children" | "ref" | "position" | "colliders" | "mass"
>;

export type MwendoHumanoidRagdollProps = {
  position?: MwendoVec3;
  debug?: boolean;
  paused?: boolean;
  timeScale?: number;
  manualStepCount?: number;
  ignoreCameraOcclusion?: boolean;
  bodyRefs?: MwendoHumanoidBodyRefs;
  revoluteJointRefs?: MwendoHumanoidRevoluteJointRefs;
  sharedBodyProps?: MwendoHumanoidBodyOverrides;
  bodyProps?: Partial<Record<MwendoHumanoidBodyKey, MwendoHumanoidBodyOverrides>>;
};

function HumanoidBodyVisual({
  definition,
  ignoreCameraOcclusion,
}: {
  definition: MwendoHumanoidBodyDefinition;
  ignoreCameraOcclusion: boolean;
}) {
  const userData = ignoreCameraOcclusion
    ? { mwendoIgnoreCameraOcclusion: true }
    : undefined;

  return (
    <mesh
      castShadow
      receiveShadow
      position={definition.meshOffset}
      userData={userData}
    >
      {definition.shape.kind === "sphere" ? (
        <sphereGeometry args={[definition.shape.radius, 24, 24]} />
      ) : (
        <boxGeometry args={definition.shape.size} />
      )}
      <meshStandardMaterial
        color={definition.color}
        roughness={definition.roughness ?? 0.82}
      />
    </mesh>
  );
}

function HumanoidRigidBody({
  bodyRef,
  definition,
  ignoreCameraOcclusion,
  sharedBodyProps,
  bodyProps,
}: {
  bodyRef: MwendoHumanoidBodyRefs[MwendoHumanoidBodyKey];
  definition: MwendoHumanoidBodyDefinition;
  ignoreCameraOcclusion: boolean;
  sharedBodyProps?: MwendoHumanoidBodyOverrides;
  bodyProps?: MwendoHumanoidBodyOverrides;
}) {
  return (
    <RigidBody
      additionalSolverIterations={10}
      angularDamping={3.8}
      canSleep
      collisionGroups={RAGDOLL_COLLISION_GROUPS}
      contactSkin={0.008}
      friction={1.2}
      linearDamping={1.6}
      restitution={0.02}
      solverGroups={RAGDOLL_COLLISION_GROUPS}
      {...sharedBodyProps}
      {...bodyProps}
      ref={bodyRef}
      colliders={definition.collider}
      mass={definition.mass}
      position={definition.position}
    >
      <HumanoidBodyVisual
        definition={definition}
        ignoreCameraOcclusion={ignoreCameraOcclusion}
      />
    </RigidBody>
  );
}

function HumanoidSphericalJoint({
  bodyRefs,
  definition,
}: {
  bodyRefs: MwendoHumanoidBodyRefs;
  definition: MwendoHumanoidSphericalJointDefinition;
}) {
  useSphericalJoint(
    bodyRefs[definition.bodyA] as RefObject<RapierRigidBody>,
    bodyRefs[definition.bodyB] as RefObject<RapierRigidBody>,
    [
      definition.anchorA,
      definition.anchorB,
    ],
  );

  return null;
}

function HumanoidRevoluteJoint({
  bodyRefs,
  definition,
  jointRef,
}: {
  bodyRefs: MwendoHumanoidBodyRefs;
  definition: MwendoHumanoidRevoluteJointDefinition;
  jointRef?: MutableRefObject<ReturnType<typeof useRevoluteJoint>["current"] | null>;
}) {
  const internalJointRef = useRevoluteJoint(
    bodyRefs[definition.bodyA] as RefObject<RapierRigidBody>,
    bodyRefs[definition.bodyB] as RefObject<RapierRigidBody>,
    [
      definition.anchorA,
      definition.anchorB,
      definition.axis,
      definition.limits,
    ],
  );

  useEffect(() => {
    if (!jointRef) {
      return;
    }

    jointRef.current = internalJointRef.current ?? null;

    return () => {
      jointRef.current = null;
    };
  }, [internalJointRef, jointRef]);

  return null;
}

export function MwendoHumanoidRagdoll({
  position = [0, 4.5, 0],
  debug = false,
  paused = false,
  timeScale = 1,
  manualStepCount = 0,
  ignoreCameraOcclusion = false,
  bodyRefs: externalBodyRefs,
  revoluteJointRefs,
  sharedBodyProps,
  bodyProps,
}: MwendoHumanoidRagdollProps) {
  const internalBodyRefs = useMemo(() => createMwendoHumanoidBodyRefs(), []);
  const bodyRefs = externalBodyRefs ?? internalBodyRefs;
  const bodyDescriptors = useMemo<MwendoRagdollBodyDescriptor[]>(
    () =>
      MWENDO_HUMANOID_BODY_DEFINITIONS.map((definition) => ({
        key: definition.key,
        label: definition.label,
        ref: bodyRefs[definition.key],
        mass: definition.mass,
        color: definition.color,
        shape: definition.shape,
      })),
    [bodyRefs],
  );
  const jointDescriptors = useMemo<MwendoRagdollJointDescriptor[]>(
    () =>
      MWENDO_HUMANOID_JOINT_DEFINITIONS.map((definition) => ({
        key: definition.key,
        kind: definition.kind,
        bodyA: bodyRefs[definition.bodyA],
        bodyB: bodyRefs[definition.bodyB],
        anchorA: definition.anchorA,
        anchorB: definition.anchorB,
        axis: definition.kind === "revolute" ? definition.axis : undefined,
        limits: definition.kind === "revolute" ? definition.limits : undefined,
      })),
    [bodyRefs],
  );

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

      {MWENDO_HUMANOID_SPHERICAL_JOINT_DEFINITIONS.map((definition) => (
        <HumanoidSphericalJoint
          key={definition.key}
          bodyRefs={bodyRefs}
          definition={definition}
        />
      ))}

      {MWENDO_HUMANOID_REVOLUTE_JOINT_DEFINITIONS.map((definition) => (
        <HumanoidRevoluteJoint
          key={definition.key}
          bodyRefs={bodyRefs}
          definition={definition}
          jointRef={revoluteJointRefs?.[definition.key]}
        />
      ))}

      {MWENDO_HUMANOID_BODY_DEFINITIONS.map((definition) => (
        <HumanoidRigidBody
          key={definition.key}
          bodyRef={bodyRefs[definition.key]}
          bodyProps={bodyProps?.[definition.key]}
          definition={definition}
          ignoreCameraOcclusion={ignoreCameraOcclusion}
          sharedBodyProps={sharedBodyProps}
        />
      ))}
    </group>
  );
}
