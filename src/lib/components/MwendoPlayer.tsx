import {
  CapsuleCollider,
  RigidBody,
  type CollisionEnterPayload,
  type CollisionExitPayload,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useFrame } from "@react-three/fiber";
import {
  type RefObject,
  useEffect,
  useRef,
} from "react";
import { Group, MathUtils, Vector3 } from "three";
import { MwendoPlayerDebug } from "./MwendoPlayerDebug";
import { PrimitiveHero } from "./PrimitiveHero";
import { useMwendoStore, useMwendoStoreApi } from "../MwendoProvider";
import { useMwendoKeyboardInput } from "../useMwendoKeyboardInput";
import {
  DEFAULT_MWENDO_INPUT,
  mergeMwendoInput,
  type MwendoInputState,
  type MwendoMovementMode,
  type MwendoPlayerSnapshot,
  type MwendoVec3,
} from "../types";

const forward = new Vector3();
const right = new Vector3();
const movement = new Vector3();
const MAX_SPEED = 7;

export type MwendoPlayerProps = {
  position?: MwendoVec3;
  controls?: "keyboard" | "none";
  input?: Partial<MwendoInputState>;
  inputRef?: RefObject<MwendoInputState | null>;
  linearDamping?: number;
  capsuleHalfHeight?: number;
  capsuleRadius?: number;
  walkSpeed?: number;
  runSpeed?: number;
  crouchSpeed?: number;
  jumpVelocity?: number;
  acceleration?: number;
  deceleration?: number;
  airControl?: number;
  debug?: boolean;
  onSnapshotChange?: (snapshot: MwendoPlayerSnapshot) => void;
  onMovementModeChange?: (
    movementMode: MwendoMovementMode,
    previousMovementMode: MwendoMovementMode,
  ) => void;
  onGroundedChange?: (grounded: boolean) => void;
  onJump?: (snapshot: MwendoPlayerSnapshot) => void;
  onLand?: (snapshot: MwendoPlayerSnapshot) => void;
};

function dampAxis(
  ref: RefObject<Group | null>,
  axis: "x" | "y" | "z",
  target: number,
  delta: number,
  lambda = 12,
) {
  const object = ref.current;

  if (!object) {
    return;
  }

  object.rotation[axis] = MathUtils.damp(
    object.rotation[axis],
    target,
    lambda,
    delta,
  );
}

function dampAngle(current: number, target: number, lambda: number, delta: number) {
  const difference = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  const alpha = 1 - Math.exp(-lambda * delta);

  return current + difference * alpha;
}

export function MwendoPlayer({
  position = [0, 2.5, 6],
  controls = "keyboard",
  input,
  inputRef,
  linearDamping = 8,
  capsuleHalfHeight = 0.52,
  capsuleRadius = 0.34,
  walkSpeed = 4,
  runSpeed = MAX_SPEED,
  crouchSpeed = 2,
  jumpVelocity = 5.6,
  acceleration = 10,
  deceleration = 14,
  airControl = 0.38,
  debug = false,
  onSnapshotChange,
  onMovementModeChange,
  onGroundedChange,
  onJump,
  onLand,
}: MwendoPlayerProps) {
  const storeApi = useMwendoStoreApi();
  const setPlayerSnapshot = useMwendoStore((state) => state.setPlayerSnapshot);
  const movementMode = useMwendoStore((state) => state.movementMode);

  const bodyRef = useRef<RapierRigidBody>(null);
  const visualRef = useRef<Group>(null);
  const pelvisRef = useRef<Group>(null);
  const spineRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const leftUpperArmRef = useRef<Group>(null);
  const leftLowerArmRef = useRef<Group>(null);
  const rightUpperArmRef = useRef<Group>(null);
  const rightLowerArmRef = useRef<Group>(null);
  const leftUpperLegRef = useRef<Group>(null);
  const leftLowerLegRef = useRef<Group>(null);
  const rightUpperLegRef = useRef<Group>(null);
  const rightLowerLegRef = useRef<Group>(null);
  const gaitPhaseRef = useRef(0);
  const debugStateRef = useRef<{
    facing: number;
    movementMode: MwendoMovementMode;
    grounded: boolean;
  } | null>({
    facing: 0,
    movementMode: "idle",
    grounded: false,
  });
  const supportColliderHandlesRef = useRef<Set<number>>(new Set());
  const groundedRef = useRef(false);
  const movementModeRef = useRef<MwendoMovementMode>("idle");
  const jumpHeldRef = useRef(false);
  const lastSnapshotRef = useRef<MwendoPlayerSnapshot | null>(null);
  const idleInputRef = useRef<MwendoInputState | null>({ ...DEFAULT_MWENDO_INPUT });
  const keyboardInputRef = useMwendoKeyboardInput(controls === "keyboard");
  const initialPositionRef = useRef(position);

  const updateGrounded = (nextGrounded: boolean) => {
    if (groundedRef.current === nextGrounded) {
      return;
    }

    groundedRef.current = nextGrounded;
    onGroundedChange?.(nextGrounded);
  };

  const handleGroundContactEnter = (payload: CollisionEnterPayload) => {
    const normal = payload.manifold.normal();
    const supportY = payload.flipped ? normal.y : -normal.y;

    if (supportY < 0.35) {
      return;
    }

    supportColliderHandlesRef.current.add(payload.other.collider.handle);
    updateGrounded(true);
  };

  const handleGroundContactExit = (payload: CollisionExitPayload) => {
    supportColliderHandlesRef.current.delete(payload.other.collider.handle);

    if (supportColliderHandlesRef.current.size === 0) {
      updateGrounded(false);
    }
  };

  useEffect(() => {
    const initialSnapshot: MwendoPlayerSnapshot = {
      position: initialPositionRef.current,
      facing: storeApi.getState().playerFacing,
      movementMode: "idle",
      grounded: false,
      supportState: "none",
      velocity: [0, 0, 0],
    };

    setPlayerSnapshot(initialSnapshot);
    lastSnapshotRef.current = initialSnapshot;
    onSnapshotChange?.(initialSnapshot);
  }, [onSnapshotChange, setPlayerSnapshot, storeApi]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    const visual = visualRef.current;
    const pelvis = pelvisRef.current;

    if (!body || !visual || !pelvis) {
      return;
    }

    const internalInput =
      controls === "keyboard"
        ? keyboardInputRef.current ?? DEFAULT_MWENDO_INPUT
        : idleInputRef.current ?? DEFAULT_MWENDO_INPUT;
    const keys = mergeMwendoInput(input, inputRef?.current, internalInput);
    const { cameraYaw, playerFacing } = storeApi.getState();

    forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    right.set(-forward.z, 0, forward.x);
    movement.set(0, 0, 0);

    if (keys.forward) movement.add(forward);
    if (keys.backward) movement.sub(forward);
    if (keys.right) movement.add(right);
    if (keys.left) movement.sub(right);

    const hasMovementInput = movement.lengthSq() > 0;
    if (hasMovementInput) {
      movement.normalize();
    }

    const locomotionMode: MwendoMovementMode = keys.crouch
      ? "crouch"
      : hasMovementInput && keys.run
        ? "run"
        : hasMovementInput
          ? "walk"
          : "idle";

    const speed =
      locomotionMode === "run"
        ? runSpeed
        : locomotionMode === "walk"
          ? walkSpeed
          : locomotionMode === "crouch"
            ? crouchSpeed
            : 0;

    const currentVelocity = body.linvel();
    const grounded = groundedRef.current;
    const horizontalLambda = grounded
      ? hasMovementInput
        ? acceleration
        : deceleration
      : (hasMovementInput ? acceleration : deceleration) * airControl;
    const nextVelocityX = MathUtils.damp(
      currentVelocity.x,
      movement.x * speed,
      horizontalLambda,
      delta,
    );
    const nextVelocityZ = MathUtils.damp(
      currentVelocity.z,
      movement.z * speed,
      horizontalLambda,
      delta,
    );

    const jumpPressed = keys.jump;
    const jumpTriggered = grounded && jumpPressed && !jumpHeldRef.current;
    jumpHeldRef.current = jumpPressed;

    let nextVelocityY = currentVelocity.y;

    if (jumpTriggered) {
      nextVelocityY = jumpVelocity;
      supportColliderHandlesRef.current.clear();
      updateGrounded(false);
    }

    body.setLinvel(
      {
        x: nextVelocityX,
        y: nextVelocityY,
        z: nextVelocityZ,
      },
      true,
    );

    const bodyPosition = body.translation();
    const groundedAfterMove = groundedRef.current;
    const nextMovementMode: MwendoMovementMode = groundedAfterMove
      ? locomotionMode
      : nextVelocityY > 0.35
        ? "jump"
        : "fall";
    const horizontalSpeed = Math.hypot(nextVelocityX, nextVelocityZ);
    const speedRatio = Math.min(1, horizontalSpeed / runSpeed);
    const crouchAmount = locomotionMode === "crouch" ? 1 : 0;
    const airborneAmount = groundedAfterMove ? 0 : 1;
    const airArmLift = airborneAmount * 0.18;
    const airLegTuck = airborneAmount * 0.34;
    const hasHorizontalMotion = horizontalSpeed > 0.08;
    const targetFacing = hasHorizontalMotion
      ? Math.atan2(nextVelocityX, nextVelocityZ)
      : playerFacing;
    visual.rotation.y = dampAngle(
      visual.rotation.y,
      targetFacing,
      groundedAfterMove ? 11 : 7,
      delta,
    );
    const facing = visual.rotation.y;

    gaitPhaseRef.current += delta * MathUtils.lerp(1.2, 8.8, speedRatio);
    const stride = Math.sin(gaitPhaseRef.current);
    const mirroredStride = Math.sin(gaitPhaseRef.current + Math.PI);
    const bounce = Math.sin(gaitPhaseRef.current * 2) * 0.04 * speedRatio;
    const idleBreath = Math.sin(gaitPhaseRef.current * 0.55) * 0.02;
    const torsoTwist = Math.sin(gaitPhaseRef.current) * 0.08 * speedRatio;
    const legSwing = 0.82 * speedRatio;
    const armSwing = 0.68 * speedRatio;

    visual.position.y = MathUtils.damp(
      visual.position.y,
      0.02 + idleBreath * 0.3,
      8,
      delta,
    );
    pelvis.position.y = MathUtils.damp(
      pelvis.position.y,
      0.9 - crouchAmount * 0.24 + bounce - idleBreath,
      10,
      delta,
    );
    pelvis.rotation.y = MathUtils.damp(
      pelvis.rotation.y,
      torsoTwist * 0.24,
      10,
      delta,
    );

    dampAxis(
      spineRef,
      "x",
      -0.04 + crouchAmount * 0.34 - speedRatio * 0.02 - airborneAmount * 0.12,
      delta,
    );
    dampAxis(spineRef, "y", torsoTwist, delta);
    dampAxis(
      spineRef,
      "z",
      Math.sin(gaitPhaseRef.current * 2) * 0.04 * speedRatio,
      delta,
    );
    dampAxis(
      headRef,
      "x",
      0.08 - crouchAmount * 0.18 - idleBreath * 1.4 + airborneAmount * 0.06,
      delta,
    );
    dampAxis(headRef, "y", -torsoTwist * 0.45, delta);

    dampAxis(
      leftUpperArmRef,
      "x",
      mirroredStride * armSwing - crouchAmount * 0.16 - airArmLift,
      delta,
    );
    dampAxis(
      rightUpperArmRef,
      "x",
      stride * armSwing - crouchAmount * 0.16 - airArmLift,
      delta,
    );
    dampAxis(leftUpperArmRef, "z", -0.08 + crouchAmount * 0.1, delta);
    dampAxis(rightUpperArmRef, "z", 0.08 - crouchAmount * 0.1, delta);
    dampAxis(
      leftLowerArmRef,
      "x",
      Math.max(0, -mirroredStride) * 0.46 * speedRatio + crouchAmount * 0.22 + airArmLift * 0.7,
      delta,
    );
    dampAxis(
      rightLowerArmRef,
      "x",
      Math.max(0, -stride) * 0.46 * speedRatio + crouchAmount * 0.22 + airArmLift * 0.7,
      delta,
    );

    dampAxis(
      leftUpperLegRef,
      "x",
      stride * legSwing - crouchAmount * 0.48 - airLegTuck,
      delta,
    );
    dampAxis(
      rightUpperLegRef,
      "x",
      mirroredStride * legSwing - crouchAmount * 0.48 - airLegTuck,
      delta,
    );
    dampAxis(leftUpperLegRef, "z", -0.04 * speedRatio, delta);
    dampAxis(rightUpperLegRef, "z", 0.04 * speedRatio, delta);
    dampAxis(
      leftLowerLegRef,
      "x",
      Math.max(0, -stride) * 0.8 * speedRatio + crouchAmount * 0.72 + airLegTuck * 1.4,
      delta,
    );
    dampAxis(
      rightLowerLegRef,
      "x",
      Math.max(0, -mirroredStride) * 0.8 * speedRatio + crouchAmount * 0.72 + airLegTuck * 1.4,
      delta,
    );

    if (movementModeRef.current !== nextMovementMode) {
      const previousMovementMode = movementModeRef.current;
      movementModeRef.current = nextMovementMode;
      onMovementModeChange?.(nextMovementMode, previousMovementMode);
    }

    const snapshot: MwendoPlayerSnapshot = {
      position: [bodyPosition.x, bodyPosition.y, bodyPosition.z],
      velocity: [nextVelocityX, nextVelocityY, nextVelocityZ],
      facing,
      movementMode: nextMovementMode,
      grounded: groundedAfterMove,
      supportState: groundedAfterMove ? "double" : "none",
    };
    const previousSnapshot = lastSnapshotRef.current;

    setPlayerSnapshot(snapshot);
    onSnapshotChange?.(snapshot);
    if (jumpTriggered) {
      onJump?.(snapshot);
    }
    if (previousSnapshot && !previousSnapshot.grounded && groundedAfterMove) {
      onLand?.(snapshot);
    }
    lastSnapshotRef.current = snapshot;
    debugStateRef.current = {
      facing,
      movementMode: nextMovementMode,
      grounded: groundedAfterMove,
    };
  });

  return (
    <>
      {debug ? (
        <MwendoPlayerDebug
          bodyRef={bodyRef}
          capsuleHalfHeight={capsuleHalfHeight}
          capsuleRadius={capsuleRadius}
          debugStateRef={debugStateRef}
          joints={{
            pelvisRef,
            spineRef,
            headRef,
            leftUpperArmRef,
            leftLowerArmRef,
            rightUpperArmRef,
            rightLowerArmRef,
            leftUpperLegRef,
            leftLowerLegRef,
            rightUpperLegRef,
            rightLowerLegRef,
          }}
        />
      ) : null}

      <RigidBody
        ref={bodyRef}
        colliders={false}
        canSleep={false}
        enabledRotations={[false, false, false]}
        linearDamping={linearDamping}
        position={position}
      >
        <CapsuleCollider
          args={[capsuleHalfHeight, capsuleRadius]}
          onCollisionEnter={handleGroundContactEnter}
          onCollisionExit={handleGroundContactExit}
        />
        <PrimitiveHero
          movementMode={movementMode}
          rig={{
            rootRef: visualRef,
            pelvisRef,
            spineRef,
            headRef,
            leftUpperArmRef,
            leftLowerArmRef,
            rightUpperArmRef,
            rightLowerArmRef,
            leftUpperLegRef,
            leftLowerLegRef,
            rightUpperLegRef,
            rightLowerLegRef,
          }}
        />
      </RigidBody>
    </>
  );
}
