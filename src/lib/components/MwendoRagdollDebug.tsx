import { Billboard, Line, Text } from "@react-three/drei";
import {
  useAfterPhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { Color, DoubleSide, Quaternion, Vector3 } from "three";
import type { MwendoVec3 } from "../types";

type DebugShape =
  | {
      kind: "box";
      size: MwendoVec3;
    }
  | {
      kind: "sphere";
      radius: number;
    };

export type MwendoRagdollBodyDescriptor = {
  key: string;
  label: string;
  ref: RefObject<RapierRigidBody | null>;
  mass: number;
  color: string;
  shape: DebugShape;
};

export type MwendoRagdollJointDescriptor = {
  key: string;
  kind: "spherical" | "revolute";
  bodyA: RefObject<RapierRigidBody | null>;
  bodyB: RefObject<RapierRigidBody | null>;
  anchorA: MwendoVec3;
  anchorB: MwendoVec3;
  axis?: MwendoVec3;
  limits?: [number, number];
};

export type MwendoRagdollDebugProps = {
  bodies: MwendoRagdollBodyDescriptor[];
  joints: MwendoRagdollJointDescriptor[];
  origin?: MwendoVec3;
  paused?: boolean;
  timeScale?: number;
  manualStepCount?: number;
};

type BodySnapshot = {
  key: string;
  label: string;
  shape: DebugShape;
  color: string;
  mass: number;
  sleeping: boolean;
  position: MwendoVec3;
  quaternion: [number, number, number, number];
  linearVelocity: MwendoVec3;
  angularVelocity: MwendoVec3;
  linearSpeed: number;
  angularSpeed: number;
};

type TrailSnapshot = {
  key: string;
  sleeping: boolean;
  points: MwendoVec3[];
};

type JointSnapshot = {
  key: string;
  kind: "spherical" | "revolute";
  anchorA: MwendoVec3;
  anchorB: MwendoVec3;
  frameAxes: [MwendoVec3, MwendoVec3, MwendoVec3];
  axisWorld?: MwendoVec3;
  error: number;
  limits?: [number, number];
};

type ContactSnapshot = {
  key: string;
  point: MwendoVec3;
  normalEnd: MwendoVec3;
  intensity: number;
};

type GhostSnapshot = {
  id: number;
  bodies: Array<
    Pick<BodySnapshot, "key" | "shape" | "position" | "quaternion" | "sleeping">
  >;
};

type RagdollDebugSnapshot = {
  bodies: BodySnapshot[];
  joints: JointSnapshot[];
  contacts: ContactSnapshot[];
  centerOfMass: MwendoVec3;
  trails: TrailSnapshot[];
  ghosts: GhostSnapshot[];
  liveStepCount: number;
};

const EMPTY_DEBUG_SNAPSHOT: RagdollDebugSnapshot = {
  bodies: [],
  joints: [],
  contacts: [],
  centerOfMass: [0, 0, 0],
  trails: [],
  ghosts: [],
  liveStepCount: 0,
};

const tempVector = new Vector3();
const tempVectorB = new Vector3();
const tempQuaternion = new Quaternion();
type RapierCollider = ReturnType<RapierRigidBody["collider"]>;

function toTuple3(value: { x: number; y: number; z: number }): MwendoVec3 {
  return [value.x, value.y, value.z];
}

function toTuple4(value: { x: number; y: number; z: number; w: number }) {
  return [value.x, value.y, value.z, value.w] as [number, number, number, number];
}

function localize(point: { x: number; y: number; z: number }, origin: MwendoVec3): MwendoVec3 {
  return [point.x - origin[0], point.y - origin[1], point.z - origin[2]];
}

function isValidRigidBody(
  body: RapierRigidBody | null | undefined,
): body is RapierRigidBody {
  return !!body && body.isValid();
}

function isValidCollider(
  collider: RapierCollider | null | undefined,
): collider is RapierCollider {
  return !!collider && collider.isValid();
}

function worldPointFromLocal(
  body: RapierRigidBody,
  localPoint: MwendoVec3,
  origin: MwendoVec3,
) {
  const translation = body.translation();
  const rotation = body.rotation();

  tempQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  tempVector.set(localPoint[0], localPoint[1], localPoint[2]);
  tempVector.applyQuaternion(tempQuaternion);
  tempVector.add(
    tempVectorB.set(translation.x, translation.y, translation.z),
  );

  return localize(tempVector, origin);
}

function rotateLocalAxis(body: RapierRigidBody, axis: MwendoVec3): MwendoVec3 {
  const rotation = body.rotation();

  tempQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  tempVector.set(axis[0], axis[1], axis[2]);
  tempVector.applyQuaternion(tempQuaternion).normalize();

  return toTuple3(tempVector);
}

function buildFrameAxes(body: RapierRigidBody): [MwendoVec3, MwendoVec3, MwendoVec3] {
  return [
    rotateLocalAxis(body, [1, 0, 0]),
    rotateLocalAxis(body, [0, 1, 0]),
    rotateLocalAxis(body, [0, 0, 1]),
  ];
}

function distance(a: MwendoVec3, b: MwendoVec3) {
  tempVector.set(a[0], a[1], a[2]);
  tempVectorB.set(b[0], b[1], b[2]);

  return tempVector.distanceTo(tempVectorB);
}

function mixColor(from: string, to: string, amount: number) {
  return new Color(from)
    .lerp(new Color(to), Math.max(0, Math.min(1, amount)))
    .getStyle();
}

function activityColor(body: BodySnapshot) {
  if (body.sleeping) {
    return "#5e7388";
  }

  const energy = Math.min(1, body.linearSpeed / 4 + body.angularSpeed / 10);
  return mixColor("#8cf0c6", "#ff7b60", energy);
}

function buildArcPoints(
  center: MwendoVec3,
  axis: MwendoVec3,
  reference: MwendoVec3,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const axisVector = new Vector3(axis[0], axis[1], axis[2]).normalize();
  const referenceVector = new Vector3(reference[0], reference[1], reference[2]);
  const projectedReference = referenceVector.sub(
    axisVector.clone().multiplyScalar(referenceVector.dot(axisVector)),
  );

  if (projectedReference.lengthSq() < 0.0001) {
    const fallback = Math.abs(axisVector.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    projectedReference.copy(fallback).sub(
      axisVector.clone().multiplyScalar(fallback.dot(axisVector)),
    );
  }

  projectedReference.normalize();

  const bitangent = axisVector.clone().cross(projectedReference).normalize();
  const centerVector = new Vector3(center[0], center[1], center[2]);
  const steps = Math.max(10, Math.ceil(Math.abs(endAngle - startAngle) / (Math.PI / 14)));

  return Array.from({ length: steps + 1 }, (_, index) => {
    const alpha = index / steps;
    const angle = startAngle + (endAngle - startAngle) * alpha;
    const point = centerVector
      .clone()
      .add(projectedReference.clone().multiplyScalar(Math.cos(angle) * radius))
      .add(bitangent.clone().multiplyScalar(Math.sin(angle) * radius));

    return toTuple3(point);
  });
}

function ShapeMesh({ shape }: { shape: DebugShape }) {
  if (shape.kind === "sphere") {
    return <sphereGeometry args={[shape.radius, 18, 18]} />;
  }

  return <boxGeometry args={shape.size} />;
}

function ColliderShell({ body }: { body: BodySnapshot }) {
  const color = activityColor(body);

  return (
    <mesh
      position={body.position}
      quaternion={body.quaternion}
      scale={body.shape.kind === "box" ? [1.06, 1.06, 1.06] : undefined}
      renderOrder={8}
    >
      <ShapeMesh shape={body.shape} />
      <meshBasicMaterial
        color={color}
        depthTest={false}
        depthWrite={false}
        opacity={body.sleeping ? 0.18 : 0.42}
        transparent
        wireframe
      />
    </mesh>
  );
}

function GhostShape({
  shape,
  position,
  quaternion,
  opacity,
}: {
  shape: DebugShape;
  position: MwendoVec3;
  quaternion: [number, number, number, number];
  opacity: number;
}) {
  return (
    <mesh position={position} quaternion={quaternion} renderOrder={4}>
      <ShapeMesh shape={shape} />
      <meshBasicMaterial
        color="#cfe7ff"
        depthTest={false}
        depthWrite={false}
        opacity={opacity}
        transparent
      />
    </mesh>
  );
}

function MassMarker({ body }: { body: BodySnapshot }) {
  const color = activityColor(body);
  const radius = 0.05 + body.mass * 0.015;

  return (
    <mesh position={body.position} renderOrder={10}>
      <sphereGeometry args={[radius, 10, 10]} />
      <meshBasicMaterial
        color={color}
        depthTest={false}
        depthWrite={false}
        opacity={0.72}
        transparent
      />
    </mesh>
  );
}

function CenterOfMassMarker({ position }: { position: MwendoVec3 }) {
  const top: MwendoVec3 = [position[0], position[1] + 0.7, position[2]];
  const right: MwendoVec3 = [position[0] + 0.2, position[1], position[2]];
  const left: MwendoVec3 = [position[0] - 0.2, position[1], position[2]];
  const front: MwendoVec3 = [position[0], position[1], position[2] + 0.2];
  const back: MwendoVec3 = [position[0], position[1], position[2] - 0.2];

  return (
    <group renderOrder={12}>
      <Line color="#ffd369" depthTest={false} lineWidth={1.8} points={[position, top]} />
      <Line color="#ffd369" depthTest={false} lineWidth={1.8} points={[left, right]} />
      <Line color="#ffd369" depthTest={false} lineWidth={1.8} points={[back, front]} />
      <mesh position={position}>
        <sphereGeometry args={[0.11, 14, 14]} />
        <meshBasicMaterial
          color="#ffe08b"
          depthTest={false}
          depthWrite={false}
          opacity={0.88}
          transparent
        />
      </mesh>
    </group>
  );
}

function VelocityVector({ body }: { body: BodySnapshot }) {
  if (body.linearSpeed < 0.05) {
    return null;
  }

  const end: MwendoVec3 = [
    body.position[0] + body.linearVelocity[0] * 0.18,
    body.position[1] + body.linearVelocity[1] * 0.18,
    body.position[2] + body.linearVelocity[2] * 0.18,
  ];

  return <Line color="#50d2ff" depthTest={false} lineWidth={1.2} points={[body.position, end]} />;
}

function AngularVelocityVector({ body }: { body: BodySnapshot }) {
  if (body.angularSpeed < 0.08) {
    return null;
  }

  const origin: MwendoVec3 = [body.position[0], body.position[1] + 0.12, body.position[2]];
  const end: MwendoVec3 = [
    origin[0] + body.angularVelocity[0] * 0.12,
    origin[1] + body.angularVelocity[1] * 0.12,
    origin[2] + body.angularVelocity[2] * 0.12,
  ];

  return <Line color="#ff7bf3" depthTest={false} lineWidth={1.2} points={[origin, end]} />;
}

function TrailLine({ trail }: { trail: TrailSnapshot }) {
  if (trail.points.length < 2) {
    return null;
  }

  return (
    <Line
      color={trail.sleeping ? "#6d8297" : "#8be4ff"}
      depthTest={false}
      lineWidth={0.9}
      opacity={trail.sleeping ? 0.25 : 0.48}
      points={trail.points}
      transparent
    />
  );
}

function AxisTripod({
  origin,
  axes,
  scale = 0.24,
}: {
  origin: MwendoVec3;
  axes: [MwendoVec3, MwendoVec3, MwendoVec3];
  scale?: number;
}) {
  const xEnd: MwendoVec3 = [
    origin[0] + axes[0][0] * scale,
    origin[1] + axes[0][1] * scale,
    origin[2] + axes[0][2] * scale,
  ];
  const yEnd: MwendoVec3 = [
    origin[0] + axes[1][0] * scale,
    origin[1] + axes[1][1] * scale,
    origin[2] + axes[1][2] * scale,
  ];
  const zEnd: MwendoVec3 = [
    origin[0] + axes[2][0] * scale,
    origin[1] + axes[2][1] * scale,
    origin[2] + axes[2][2] * scale,
  ];

  return (
    <>
      <Line color="#ef5350" depthTest={false} lineWidth={1.2} points={[origin, xEnd]} />
      <Line color="#67c76e" depthTest={false} lineWidth={1.2} points={[origin, yEnd]} />
      <Line color="#4aa3ff" depthTest={false} lineWidth={1.2} points={[origin, zEnd]} />
    </>
  );
}

function JointDebug({ joint }: { joint: JointSnapshot }) {
  const errorColor = mixColor("#7af0b5", "#ff6f59", Math.min(1, joint.error / 0.28));
  const ringPoints =
    joint.kind === "revolute" && joint.axisWorld && joint.limits
      ? buildArcPoints(joint.anchorA, joint.axisWorld, joint.frameAxes[1], 0.34, joint.limits[0], joint.limits[1])
      : buildArcPoints(joint.anchorA, joint.frameAxes[0], joint.frameAxes[1], 0.22, 0, Math.PI * 2);

  const hingeAxis =
    joint.axisWorld &&
    ([
      [
        joint.anchorA[0] - joint.axisWorld[0] * 0.24,
        joint.anchorA[1] - joint.axisWorld[1] * 0.24,
        joint.anchorA[2] - joint.axisWorld[2] * 0.24,
      ],
      [
        joint.anchorA[0] + joint.axisWorld[0] * 0.24,
        joint.anchorA[1] + joint.axisWorld[1] * 0.24,
        joint.anchorA[2] + joint.axisWorld[2] * 0.24,
      ],
    ] as [MwendoVec3, MwendoVec3]);

  return (
    <group renderOrder={14}>
      <Line color={errorColor} depthTest={false} lineWidth={1.6} points={[joint.anchorA, joint.anchorB]} />
      <Line color={joint.kind === "revolute" ? "#fbc96d" : "#94dfff"} depthTest={false} lineWidth={0.9} points={ringPoints} />
      <AxisTripod axes={joint.frameAxes} origin={joint.anchorA} />
      {hingeAxis ? (
        <Line color="#ffffff" depthTest={false} lineWidth={1.2} points={hingeAxis} />
      ) : null}
      <mesh position={joint.anchorA}>
        <sphereGeometry args={[0.055, 10, 10]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={joint.anchorB}>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshBasicMaterial color={errorColor} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

function ContactNormal({ contact }: { contact: ContactSnapshot }) {
  return (
    <group renderOrder={16}>
      <Line
        color={mixColor("#7fe9ff", "#ff8b5b", Math.min(1, contact.intensity))}
        depthTest={false}
        lineWidth={1.4}
        points={[contact.point, contact.normalEnd]}
      />
      <mesh position={contact.point}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshBasicMaterial
          color="#fff4ba"
          depthTest={false}
          depthWrite={false}
          opacity={0.9}
          transparent
        />
      </mesh>
    </group>
  );
}

function DebugBoard({
  liveStepCount,
  manualStepCount,
  paused,
  timeScale,
}: {
  liveStepCount: number;
  manualStepCount: number;
  paused: boolean;
  timeScale: number;
}) {
  return (
    <Billboard position={[0, 4.9, 0]}>
      <group>
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[4.8, 1.55]} />
          <meshBasicMaterial
            color="#061521"
            depthWrite={false}
            opacity={0.62}
            side={DoubleSide}
            transparent
          />
        </mesh>
        <Text
          anchorX="center"
          anchorY="middle"
          color="#dff7ff"
          fontSize={0.2}
          position={[0, 0.36, 0]}
        >
          RAGDOLL DEBUG
        </Text>
        <Text
          anchorX="center"
          anchorY="middle"
          color={paused ? "#ff9f80" : "#9af4d1"}
          fontSize={0.15}
          position={[0, 0.08, 0]}
        >
          {paused ? "paused" : "live"}  x{timeScale.toFixed(2)}  manual {manualStepCount}
        </Text>
        <Text
          anchorX="center"
          anchorY="middle"
          color="#acd8e8"
          fontSize={0.11}
          maxWidth={4.1}
          position={[0, -0.22, 0]}
        >
          1 normal  2 half  3 quarter  P pause  . single-step
        </Text>
        <Text
          anchorX="center"
          anchorY="middle"
          color="#7ea4b3"
          fontSize={0.1}
          position={[0, -0.48, 0]}
        >
          frames {liveStepCount}
        </Text>
      </group>
    </Billboard>
  );
}

function buildSnapshot(
  bodies: MwendoRagdollBodyDescriptor[],
  joints: MwendoRagdollJointDescriptor[],
  origin: MwendoVec3,
  world: ReturnType<typeof useRapier>["world"],
  colliderStates: ReturnType<typeof useRapier>["colliderStates"],
  liveStepCount: number,
  ghostSnapshots: MutableRefObject<GhostSnapshot[]>,
  trailPoints: MutableRefObject<Record<string, MwendoVec3[]>>,
  ghostId: MutableRefObject<number>,
  lastGhostAt: MutableRefObject<number>,
) {
  const bodySnapshots: BodySnapshot[] = [];
  const ragdollBodyHandles = new Set<number>();
  const ragdollColliders: Array<{ bodyKey: string; collider: RapierCollider }> = [];
  let totalMass = 0;

  for (const descriptor of bodies) {
    const body = descriptor.ref.current;

    if (!isValidRigidBody(body)) {
      continue;
    }

    const translation = body.translation();
    const rotation = body.rotation();
    const linearVelocity = body.linvel();
    const angularVelocity = body.angvel();
    const position = localize(translation, origin);
    const mass = typeof body.mass === "function" ? body.mass() : descriptor.mass;
    const linearSpeed = Math.hypot(linearVelocity.x, linearVelocity.y, linearVelocity.z);
    const angularSpeed = Math.hypot(angularVelocity.x, angularVelocity.y, angularVelocity.z);

    totalMass += mass;
    ragdollBodyHandles.add(body.handle);

    for (let index = 0; index < body.numColliders(); index += 1) {
      const collider = body.collider(index);

      if (isValidCollider(collider)) {
        ragdollColliders.push({ bodyKey: descriptor.key, collider });
      }
    }

    const trail = trailPoints.current[descriptor.key] ?? [];
    trail.push(position);
    trailPoints.current[descriptor.key] = trail.slice(-18);

    bodySnapshots.push({
      key: descriptor.key,
      label: descriptor.label,
      shape: descriptor.shape,
      color: descriptor.color,
      mass,
      sleeping: body.isSleeping(),
      position,
      quaternion: toTuple4(rotation),
      linearVelocity: toTuple3(linearVelocity),
      angularVelocity: toTuple3(angularVelocity),
      linearSpeed,
      angularSpeed,
    });
  }

  const centerOfMass =
    totalMass > 0
      ? (bodySnapshots.reduce(
          (accumulator, body) => {
            accumulator[0] += body.position[0] * body.mass;
            accumulator[1] += body.position[1] * body.mass;
            accumulator[2] += body.position[2] * body.mass;
            return accumulator;
          },
          [0, 0, 0] as MwendoVec3,
        ).map((value) => value / totalMass) as MwendoVec3)
      : ([0, 0, 0] as MwendoVec3);

  const jointSnapshots = joints.flatMap((joint) => {
    const bodyA = joint.bodyA.current;
    const bodyB = joint.bodyB.current;

    if (!isValidRigidBody(bodyA) || !isValidRigidBody(bodyB)) {
      return [];
    }

    const anchorA = worldPointFromLocal(bodyA, joint.anchorA, origin);
    const anchorB = worldPointFromLocal(bodyB, joint.anchorB, origin);

    return [
      {
        key: joint.key,
        kind: joint.kind,
        anchorA,
        anchorB,
        frameAxes: buildFrameAxes(bodyA),
        axisWorld: joint.axis ? rotateLocalAxis(bodyA, joint.axis) : undefined,
        error: distance(anchorA, anchorB),
        limits: joint.limits,
      } satisfies JointSnapshot,
    ];
  });

  const contacts: ContactSnapshot[] = [];
  const visitedPairs = new Set<string>();

  for (const ragdollCollider of ragdollColliders) {
    if (!isValidCollider(ragdollCollider.collider)) {
      continue;
    }

    for (const colliderState of colliderStates.values()) {
      const otherCollider = colliderState.collider;

      if (
        !isValidCollider(otherCollider) ||
        otherCollider.handle === ragdollCollider.collider.handle
      ) {
        continue;
      }

      try {
        const parent = otherCollider.parent();

        if (parent?.isValid() && ragdollBodyHandles.has(parent.handle)) {
          continue;
        }

        const pairKey =
          ragdollCollider.collider.handle < otherCollider.handle
            ? `${ragdollCollider.collider.handle}:${otherCollider.handle}`
            : `${otherCollider.handle}:${ragdollCollider.collider.handle}`;

        if (visitedPairs.has(pairKey)) {
          continue;
        }

        visitedPairs.add(pairKey);

        world.contactPair(ragdollCollider.collider, otherCollider, (manifold, flipped) => {
          const normal = manifold.normal();
          const orientation = flipped ? -1 : 1;

          for (let index = 0; index < manifold.numSolverContacts(); index += 1) {
            const point = manifold.solverContactPoint(index);
            const localPoint = localize(point, origin);
            const normalEnd: MwendoVec3 = [
              localPoint[0] + normal.x * 0.42 * orientation,
              localPoint[1] + normal.y * 0.42 * orientation,
              localPoint[2] + normal.z * 0.42 * orientation,
            ];
            const intensity =
              manifold.numContacts() > 0
                ? Math.min(
                    1,
                    manifold.contactImpulse(
                      Math.min(index, manifold.numContacts() - 1),
                    ) / 2.8,
                  )
                : 0.15;

            contacts.push({
              key: `${pairKey}:${index}:${ragdollCollider.bodyKey}`,
              point: localPoint,
              normalEnd,
              intensity,
            });
          }
        });
      } catch {
        // Debug sampling is best-effort; skip any collider pair that went stale between frames.
        continue;
      }
    }
  }

  const now = performance.now();
  if (now - lastGhostAt.current > 180 && bodySnapshots.length > 0) {
    ghostId.current += 1;
    ghostSnapshots.current = [
      {
        id: ghostId.current,
        bodies: bodySnapshots.map((body) => ({
          key: body.key,
          shape: body.shape,
          position: body.position,
          quaternion: body.quaternion,
          sleeping: body.sleeping,
        })),
      },
      ...ghostSnapshots.current,
    ].slice(0, 4);
    lastGhostAt.current = now;
  }

  return {
    bodies: bodySnapshots,
    joints: jointSnapshots,
    contacts,
    centerOfMass,
    trails: bodySnapshots.map((body) => ({
      key: body.key,
      sleeping: body.sleeping,
      points: trailPoints.current[body.key] ?? [],
    })),
    ghosts: ghostSnapshots.current,
    liveStepCount,
  } satisfies RagdollDebugSnapshot;
}

export function MwendoRagdollDebug({
  bodies,
  joints,
  origin = [0, 0, 0],
  paused = false,
  timeScale = 1,
  manualStepCount = 0,
}: MwendoRagdollDebugProps) {
  const rapier = useRapier();
  const ghostSnapshots = useRef<GhostSnapshot[]>([]);
  const trailPoints = useRef<Record<string, MwendoVec3[]>>({});
  const ghostId = useRef(0);
  const lastGhostAt = useRef(0);
  const liveStepCount = useRef(0);
  const [snapshot, setSnapshot] = useState<RagdollDebugSnapshot>(EMPTY_DEBUG_SNAPSHOT);

  useEffect(() => {
    startTransition(() => {
      setSnapshot(
        buildSnapshot(
          bodies,
          joints,
          origin,
          rapier.world,
          rapier.colliderStates,
          liveStepCount.current,
          ghostSnapshots,
          trailPoints,
          ghostId,
          lastGhostAt,
        ),
      );
    });
  }, [bodies, joints, origin, rapier.colliderStates]);

  useAfterPhysicsStep(() => {
    liveStepCount.current += 1;

    const nextSnapshot = buildSnapshot(
      bodies,
      joints,
      origin,
      rapier.world,
      rapier.colliderStates,
      liveStepCount.current,
      ghostSnapshots,
      trailPoints,
      ghostId,
      lastGhostAt,
    );

    startTransition(() => {
      setSnapshot(nextSnapshot);
    });
  });

  return (
    <group userData={{ mwendoIgnoreCameraOcclusion: true }}>
      <DebugBoard
        liveStepCount={snapshot.liveStepCount}
        manualStepCount={manualStepCount}
        paused={paused}
        timeScale={timeScale}
      />

      {snapshot.ghosts.map((ghost, index) => {
        const opacity = 0.16 - index * 0.03;

        return (
          <group key={ghost.id}>
            {ghost.bodies.map((body) => (
              <GhostShape
                key={`${ghost.id}:${body.key}`}
                opacity={Math.max(0.04, opacity)}
                position={body.position}
                quaternion={body.quaternion}
                shape={body.shape}
              />
            ))}
          </group>
        );
      })}

      {snapshot.trails.map((trail) => (
        <TrailLine key={trail.key} trail={trail} />
      ))}

      {snapshot.bodies.map((body) => (
        <group key={body.key}>
          <ColliderShell body={body} />
          <MassMarker body={body} />
          <VelocityVector body={body} />
          <AngularVelocityVector body={body} />
        </group>
      ))}

      {snapshot.joints.map((joint) => (
        <JointDebug key={joint.key} joint={joint} />
      ))}

      {snapshot.contacts.map((contact) => (
        <ContactNormal key={contact.key} contact={contact} />
      ))}

      <CenterOfMassMarker position={snapshot.centerOfMass} />
    </group>
  );
}
