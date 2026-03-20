import {
  RigidBody,
  interactionGroups,
  useFixedJoint,
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
import type {
  CharacterCtrlrLocomotionDebugState,
  CharacterCtrlrVec3,
} from "../types";
import {
  CharacterCtrlrRagdollDebug,
  type CharacterCtrlrRagdollBodyDescriptor,
  type CharacterCtrlrRagdollJointDescriptor,
} from "./CharacterCtrlrRagdollDebug";
import {
  createCharacterCtrlrHumanoidBodyRefs,
  CHARACTER_CTRLR_HUMANOID_BODY_DEFINITIONS,
  CHARACTER_CTRLR_HUMANOID_FIXED_JOINT_DEFINITIONS,
  CHARACTER_CTRLR_HUMANOID_JOINT_DEFINITIONS,
  CHARACTER_CTRLR_HUMANOID_REVOLUTE_JOINT_DEFINITIONS,
  CHARACTER_CTRLR_HUMANOID_SPHERICAL_JOINT_DEFINITIONS,
  type CharacterCtrlrHumanoidBodyDefinition,
  type CharacterCtrlrHumanoidBodyKey,
  type CharacterCtrlrHumanoidBodyRefs,
  type CharacterCtrlrHumanoidFixedJointDefinition,
  type CharacterCtrlrHumanoidRevoluteJointKey,
  type CharacterCtrlrHumanoidRevoluteJointDefinition,
  type CharacterCtrlrHumanoidRevoluteJointRefs,
  type CharacterCtrlrHumanoidSphericalJointDefinition,
} from "./CharacterCtrlrHumanoidData";

const RAGDOLL_COLLISION_GROUPS = interactionGroups([1], [0]);

type CharacterCtrlrHumanoidBodyOverrides = Omit<
  ComponentProps<typeof RigidBody>,
  "children" | "ref" | "position" | "colliders" | "mass"
>;

export type CharacterCtrlrHumanoidRagdollProps = {
  position?: CharacterCtrlrVec3;
  debug?: boolean;
  paused?: boolean;
  timeScale?: number;
  manualStepCount?: number;
  ignoreCameraOcclusion?: boolean;
  locomotionDebugRef?: RefObject<CharacterCtrlrLocomotionDebugState | null>;
  bodyRefs?: CharacterCtrlrHumanoidBodyRefs;
  revoluteJointRefs?: CharacterCtrlrHumanoidRevoluteJointRefs;
  sharedBodyProps?: CharacterCtrlrHumanoidBodyOverrides;
  bodyProps?: Partial<Record<CharacterCtrlrHumanoidBodyKey, CharacterCtrlrHumanoidBodyOverrides>>;
};

function HumanoidBodyVisual({
  definition,
  ignoreCameraOcclusion,
}: {
  definition: CharacterCtrlrHumanoidBodyDefinition;
  ignoreCameraOcclusion: boolean;
}) {
  const userData = ignoreCameraOcclusion
    ? { characterCtrlrIgnoreCameraOcclusion: true }
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
  bodyRef: CharacterCtrlrHumanoidBodyRefs[CharacterCtrlrHumanoidBodyKey];
  definition: CharacterCtrlrHumanoidBodyDefinition;
  ignoreCameraOcclusion: boolean;
  sharedBodyProps?: CharacterCtrlrHumanoidBodyOverrides;
  bodyProps?: CharacterCtrlrHumanoidBodyOverrides;
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
  bodyRefs: CharacterCtrlrHumanoidBodyRefs;
  definition: CharacterCtrlrHumanoidSphericalJointDefinition;
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

function HumanoidFixedJoint({
  bodyRefs,
  definition,
}: {
  bodyRefs: CharacterCtrlrHumanoidBodyRefs;
  definition: CharacterCtrlrHumanoidFixedJointDefinition;
}) {
  useFixedJoint(
    bodyRefs[definition.bodyA] as RefObject<RapierRigidBody>,
    bodyRefs[definition.bodyB] as RefObject<RapierRigidBody>,
    [
      definition.anchorA,
      definition.frameA,
      definition.anchorB,
      definition.frameB,
    ],
  );

  return null;
}

function HumanoidRevoluteJoint({
  bodyRefs,
  definition,
  jointRef,
}: {
  bodyRefs: CharacterCtrlrHumanoidBodyRefs;
  definition: CharacterCtrlrHumanoidRevoluteJointDefinition;
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

export function CharacterCtrlrHumanoidRagdoll({
  position = [0, 4.5, 0],
  debug = false,
  paused = false,
  timeScale = 1,
  manualStepCount = 0,
  ignoreCameraOcclusion = false,
  locomotionDebugRef,
  bodyRefs: externalBodyRefs,
  revoluteJointRefs,
  sharedBodyProps,
  bodyProps,
}: CharacterCtrlrHumanoidRagdollProps) {
  const internalBodyRefs = useMemo(() => createCharacterCtrlrHumanoidBodyRefs(), []);
  const bodyRefs = externalBodyRefs ?? internalBodyRefs;
  const bodyDescriptors = useMemo<CharacterCtrlrRagdollBodyDescriptor[]>(
    () =>
      CHARACTER_CTRLR_HUMANOID_BODY_DEFINITIONS.map((definition) => ({
        key: definition.key,
        label: definition.label,
        ref: bodyRefs[definition.key],
        mass: definition.mass,
        color: definition.color,
        shape: definition.shape,
      })),
    [bodyRefs],
  );
  const jointDescriptors = useMemo<CharacterCtrlrRagdollJointDescriptor[]>(
    () =>
      CHARACTER_CTRLR_HUMANOID_JOINT_DEFINITIONS.map((definition) => ({
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
        <CharacterCtrlrRagdollDebug
          bodies={bodyDescriptors}
          joints={jointDescriptors}
          locomotionDebugRef={locomotionDebugRef}
          manualStepCount={manualStepCount}
          origin={position}
          paused={paused}
          timeScale={timeScale}
        />
      ) : null}

      {CHARACTER_CTRLR_HUMANOID_FIXED_JOINT_DEFINITIONS.map((definition) => (
        <HumanoidFixedJoint
          key={definition.key}
          bodyRefs={bodyRefs}
          definition={definition}
        />
      ))}

      {CHARACTER_CTRLR_HUMANOID_SPHERICAL_JOINT_DEFINITIONS.map((definition) => (
        <HumanoidSphericalJoint
          key={definition.key}
          bodyRefs={bodyRefs}
          definition={definition}
        />
      ))}

      {CHARACTER_CTRLR_HUMANOID_REVOLUTE_JOINT_DEFINITIONS.map((definition) => (
        <HumanoidRevoluteJoint
          key={definition.key}
          bodyRefs={bodyRefs}
          definition={definition}
          jointRef={revoluteJointRefs?.[definition.key]}
        />
      ))}

      {CHARACTER_CTRLR_HUMANOID_BODY_DEFINITIONS.map((definition) => (
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
