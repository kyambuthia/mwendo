import { useFrame } from "@react-three/fiber";
import {
  type CollisionEnterPayload,
  type CollisionExitPayload,
} from "@react-three/rapier";
import {
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import { useMwendoStore, useMwendoStoreApi } from "../MwendoProvider";
import { useMwendoKeyboardInput } from "../useMwendoKeyboardInput";
import {
  DEFAULT_MWENDO_INPUT,
  mergeMwendoInput,
  type MwendoInputState,
  type MwendoMovementMode,
  type MwendoPlayerSnapshot,
  type MwendoSupportState,
  type MwendoVec3,
} from "../types";
import {
  createMwendoHumanoidBodyRefs,
  type MwendoHumanoidBodyKey,
} from "./MwendoHumanoidData";
import { MwendoHumanoidRagdoll } from "./MwendoHumanoidRagdoll";

const forward = new Vector3();
const right = new Vector3();
const movement = new Vector3();
const pelvisQuaternion = new Quaternion();
const chestQuaternion = new Quaternion();
const pelvisEuler = new Euler(0, 0, 0, "YXZ");
const chestEuler = new Euler(0, 0, 0, "YXZ");
const rawFocus = new Vector3();
const smoothedFocus = new Vector3();
const supportCenter = new Vector3();
const supportCorrection = new Vector3();
const facingRight = new Vector3();
const tempFootPosition = new Vector3();

type SupportSide = "left" | "right";

export type MwendoActiveRagdollPlayerProps = {
  position?: MwendoVec3;
  controls?: "keyboard" | "none";
  input?: Partial<MwendoInputState>;
  inputRef?: RefObject<MwendoInputState | null>;
  walkSpeed?: number;
  runSpeed?: number;
  crouchSpeed?: number;
  acceleration?: number;
  airControl?: number;
  jumpImpulse?: number;
  uprightTorque?: number;
  turnTorque?: number;
  balanceDamping?: number;
  cameraFocusSmoothing?: number;
  cameraFocusHeight?: number;
  cameraFocusLead?: number;
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

function angleDifference(current: number, target: number) {
  return Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
}

function deriveSupportState(
  leftContactCount: number,
  rightContactCount: number,
): MwendoSupportState {
  if (leftContactCount > 0 && rightContactCount > 0) {
    return "double";
  }

  if (leftContactCount > 0) {
    return "left";
  }

  if (rightContactCount > 0) {
    return "right";
  }

  return "none";
}

export function MwendoActiveRagdollPlayer({
  position = [0, 2.5, 6],
  controls = "keyboard",
  input,
  inputRef,
  walkSpeed = 2.7,
  runSpeed = 4.7,
  crouchSpeed = 1.7,
  acceleration = 8.5,
  airControl = 0.32,
  jumpImpulse = 5.2,
  uprightTorque = 22,
  turnTorque = 9,
  balanceDamping = 4.2,
  cameraFocusSmoothing = 12,
  cameraFocusHeight = 0.28,
  cameraFocusLead = 0.16,
  debug = false,
  onSnapshotChange,
  onMovementModeChange,
  onGroundedChange,
  onJump,
  onLand,
}: MwendoActiveRagdollPlayerProps) {
  const storeApi = useMwendoStoreApi();
  const setPlayerSnapshot = useMwendoStore((state) => state.setPlayerSnapshot);
  const bodyRefs = useMemo(() => createMwendoHumanoidBodyRefs(), []);
  const keyboardInputRef = useMwendoKeyboardInput(controls === "keyboard");
  const idleInputRef = useRef<MwendoInputState | null>({ ...DEFAULT_MWENDO_INPUT });
  const groundedRef = useRef(false);
  const leftSupportContactsRef = useRef<Map<number, number>>(new Map());
  const rightSupportContactsRef = useRef<Map<number, number>>(new Map());
  const supportStateRef = useRef<MwendoSupportState>("none");
  const movementModeRef = useRef<MwendoMovementMode>("idle");
  const jumpHeldRef = useRef(false);
  const gaitPhaseRef = useRef(0);
  const lastSnapshotRef = useRef<MwendoPlayerSnapshot | null>(null);
  const focusPositionRef = useRef<MwendoVec3 | null>(null);
  const initialPositionRef = useRef(position);

  const updateGrounded = (nextGrounded: boolean) => {
    if (groundedRef.current === nextGrounded) {
      return;
    }

    groundedRef.current = nextGrounded;
    onGroundedChange?.(nextGrounded);
  };

  const syncSupportState = () => {
    const nextSupportState = deriveSupportState(
      leftSupportContactsRef.current.size,
      rightSupportContactsRef.current.size,
    );

    supportStateRef.current = nextSupportState;
    updateGrounded(nextSupportState !== "none");

    return nextSupportState;
  };

  const addSupportContact = (side: SupportSide, colliderHandle: number) => {
    const supportContacts =
      side === "left"
        ? leftSupportContactsRef.current
        : rightSupportContactsRef.current;
    const count = supportContacts.get(colliderHandle) ?? 0;
    supportContacts.set(colliderHandle, count + 1);
    syncSupportState();
  };

  const removeSupportContact = (side: SupportSide, colliderHandle: number) => {
    const supportContacts =
      side === "left"
        ? leftSupportContactsRef.current
        : rightSupportContactsRef.current;
    const count = supportContacts.get(colliderHandle);

    if (!count) {
      return;
    }

    if (count === 1) {
      supportContacts.delete(colliderHandle);
    } else {
      supportContacts.set(colliderHandle, count - 1);
    }
  };

  const createGroundContactEnterHandler =
    (side: SupportSide) => (payload: CollisionEnterPayload) => {
      const normal = payload.manifold.normal();
      const supportY = payload.flipped ? normal.y : -normal.y;

      if (supportY < 0.35) {
        return;
      }

      addSupportContact(side, payload.other.collider.handle);
    };

  const createGroundContactExitHandler =
    (side: SupportSide) => (payload: CollisionExitPayload) => {
      removeSupportContact(side, payload.other.collider.handle);
      syncSupportState();
    };

  useEffect(() => {
    const initialSnapshot: MwendoPlayerSnapshot = {
      position: initialPositionRef.current,
      focusPosition: [
        initialPositionRef.current[0],
        initialPositionRef.current[1] + 1.2,
        initialPositionRef.current[2],
      ],
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
    const pelvis = bodyRefs.pelvis.current;
    const chest = bodyRefs.chest.current;
    const leftFoot = bodyRefs.footLeft.current;
    const rightFoot = bodyRefs.footRight.current;

    if (!pelvis || !chest || !leftFoot || !rightFoot) {
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

    const actualSupportState = supportStateRef.current;
    const grounded = actualSupportState !== "none";
    const locomotionBlend = Math.min(
      1,
      acceleration
      * delta
      * (
        actualSupportState === "double"
          ? 1
          : actualSupportState === "none"
            ? airControl
            : 0.82
      ),
    );
    const currentVelocity = pelvis.linvel();
    const pelvisMass = pelvis.mass();
    const deltaVelocityX = (movement.x * speed - currentVelocity.x) * locomotionBlend;
    const deltaVelocityZ = (movement.z * speed - currentVelocity.z) * locomotionBlend;

    pelvis.applyImpulse(
      {
        x: deltaVelocityX * pelvisMass,
        y: 0,
        z: deltaVelocityZ * pelvisMass,
      },
      true,
    );
    chest.applyImpulse(
      {
        x: deltaVelocityX * pelvisMass * 0.18,
        y: 0,
        z: deltaVelocityZ * pelvisMass * 0.18,
      },
      true,
    );

    const jumpPressed = keys.jump;
    const jumpTriggered = grounded && jumpPressed && !jumpHeldRef.current;
    jumpHeldRef.current = jumpPressed;

    if (jumpTriggered) {
      leftSupportContactsRef.current.clear();
      rightSupportContactsRef.current.clear();
      supportStateRef.current = "none";
      updateGrounded(false);
      pelvis.applyImpulse(
        { x: 0, y: jumpImpulse * pelvisMass, z: 0 },
        true,
      );
      chest.applyImpulse(
        { x: 0, y: jumpImpulse * chest.mass() * 0.35, z: 0 },
        true,
      );
    }

    const supportStateAfterJump = jumpTriggered ? "none" : supportStateRef.current;
    const targetFacing = hasMovementInput
      ? Math.atan2(movement.x, movement.z)
      : playerFacing;
    const pelvisRotation = pelvis.rotation();
    const pelvisAngularVelocity = pelvis.angvel();

    pelvisQuaternion.set(
      pelvisRotation.x,
      pelvisRotation.y,
      pelvisRotation.z,
      pelvisRotation.w,
    );
    pelvisEuler.setFromQuaternion(pelvisQuaternion, "YXZ");

    const pelvisTorqueScale = grounded ? 1 : airControl;
    const yawError = angleDifference(pelvisEuler.y, targetFacing);
    const horizontalSpeed = Math.hypot(currentVelocity.x, currentVelocity.z);
    const speedRatio = Math.min(1, horizontalSpeed / Math.max(0.001, runSpeed));

    if (grounded && hasMovementInput) {
      gaitPhaseRef.current += delta * MathUtils.lerp(1.6, 5.8, speedRatio);
    }

    pelvis.applyTorqueImpulse(
      {
        x:
          (-pelvisEuler.x * uprightTorque - pelvisAngularVelocity.x * balanceDamping)
          * pelvisTorqueScale
          * delta,
        y:
          (yawError * turnTorque - pelvisAngularVelocity.y * (balanceDamping * 0.65))
          * pelvisTorqueScale
          * delta,
        z:
          (-pelvisEuler.z * uprightTorque - pelvisAngularVelocity.z * balanceDamping)
          * pelvisTorqueScale
          * delta,
      },
      true,
    );

    const chestRotation = chest.rotation();
    const chestAngularVelocity = chest.angvel();

    chestQuaternion.set(
      chestRotation.x,
      chestRotation.y,
      chestRotation.z,
      chestRotation.w,
    );
    chestEuler.setFromQuaternion(chestQuaternion, "YXZ");

    chest.applyTorqueImpulse(
      {
        x:
          (-chestEuler.x * uprightTorque * 0.92 - chestAngularVelocity.x * balanceDamping)
          * pelvisTorqueScale
          * delta,
        y:
          (yawError * turnTorque * 0.45 - chestAngularVelocity.y * (balanceDamping * 0.45))
          * pelvisTorqueScale
          * delta,
        z:
          (-chestEuler.z * uprightTorque * 0.92 - chestAngularVelocity.z * balanceDamping)
          * pelvisTorqueScale
          * delta,
      },
      true,
    );

    const plannedSupportSide: SupportSide | null =
      supportStateAfterJump === "left"
        ? "left"
        : supportStateAfterJump === "right"
          ? "right"
          : grounded && hasMovementInput
            ? Math.sin(gaitPhaseRef.current) >= 0
              ? "left"
              : "right"
            : null;
    const swingSide: SupportSide | null =
      plannedSupportSide === "left"
        ? "right"
        : plannedSupportSide === "right"
          ? "left"
          : null;

    const rootPosition = pelvis.translation();
    const chestPosition = chest.translation();
    const predictedVelocityY = jumpTriggered
      ? currentVelocity.y + jumpImpulse
      : currentVelocity.y;
    const groundedAfterControl = groundedRef.current;
    const nextMovementMode: MwendoMovementMode = groundedAfterControl
      ? locomotionMode
      : predictedVelocityY > 0.35
        ? "jump"
        : "fall";
    const facing = MathUtils.damp(
      playerFacing,
      targetFacing,
      groundedAfterControl ? 10 : 4,
      delta,
    );

    if (groundedAfterControl) {
      supportCenter.set(0, 0, 0);
      let supportPointCount = 0;

      if (supportStateAfterJump === "left" || supportStateAfterJump === "double") {
        const leftFootPosition = leftFoot.translation();
        supportCenter.add(
          tempFootPosition.set(
            leftFootPosition.x,
            leftFootPosition.y,
            leftFootPosition.z,
          ),
        );
        supportPointCount += 1;
      }

      if (supportStateAfterJump === "right" || supportStateAfterJump === "double") {
        const rightFootPosition = rightFoot.translation();
        supportCenter.add(
          tempFootPosition.set(
            rightFootPosition.x,
            rightFootPosition.y,
            rightFootPosition.z,
          ),
        );
        supportPointCount += 1;
      }

      if (supportPointCount > 0) {
        supportCenter.divideScalar(supportPointCount);
        facingRight.set(Math.cos(facing), 0, -Math.sin(facing));

        const lateralError =
          (supportCenter.x - rootPosition.x) * facingRight.x
          + (supportCenter.z - rootPosition.z) * facingRight.z;
        const supportCentering =
          supportStateAfterJump === "double" ? 3.2 : 5.4;

        supportCorrection
          .copy(facingRight)
          .multiplyScalar(lateralError * pelvisMass * supportCentering * delta);
        pelvis.applyImpulse(
          {
            x: supportCorrection.x,
            y: 0,
            z: supportCorrection.z,
          },
          true,
        );
        chest.applyImpulse(
          {
            x: supportCorrection.x * 0.22,
            y: 0,
            z: supportCorrection.z * 0.22,
          },
          true,
        );
      }
    }

    if (groundedAfterControl && swingSide && hasMovementInput) {
      const swingFoot = swingSide === "left" ? leftFoot : rightFoot;
      const swingVelocity = swingFoot.linvel();
      const swingMass = swingFoot.mass();
      const swingBlend =
        Math.min(1, delta * 6.2)
        * (supportStateAfterJump === "double" ? 1 : 0.72);
      const desiredSwingVelocityY =
        supportStateAfterJump === "double"
          ? MathUtils.lerp(0.28, 0.95, speedRatio)
          : MathUtils.lerp(0.12, 0.46, speedRatio);

      swingFoot.applyImpulse(
        {
          x: (movement.x * speed * 0.42 - swingVelocity.x) * swingMass * swingBlend,
          y: Math.max(0, desiredSwingVelocityY - swingVelocity.y)
            * swingMass
            * swingBlend,
          z: (movement.z * speed * 0.42 - swingVelocity.z) * swingMass * swingBlend,
        },
        true,
      );
    }

    rawFocus.set(
      MathUtils.lerp(rootPosition.x, chestPosition.x, 0.72),
      MathUtils.lerp(rootPosition.y, chestPosition.y, 0.72) + cameraFocusHeight,
      MathUtils.lerp(rootPosition.z, chestPosition.z, 0.72),
    );
    rawFocus.x += Math.sin(facing) * cameraFocusLead;
    rawFocus.z += Math.cos(facing) * cameraFocusLead;

    const previousFocus = focusPositionRef.current;
    if (previousFocus) {
      smoothedFocus.set(previousFocus[0], previousFocus[1], previousFocus[2]);
      smoothedFocus.set(
        MathUtils.damp(
          smoothedFocus.x,
          rawFocus.x,
          cameraFocusSmoothing,
          delta,
        ),
        MathUtils.damp(
          smoothedFocus.y,
          rawFocus.y,
          cameraFocusSmoothing,
          delta,
        ),
        MathUtils.damp(
          smoothedFocus.z,
          rawFocus.z,
          cameraFocusSmoothing,
          delta,
        ),
      );
      focusPositionRef.current = [
        smoothedFocus.x,
        smoothedFocus.y,
        smoothedFocus.z,
      ];
    } else {
      focusPositionRef.current = [rawFocus.x, rawFocus.y, rawFocus.z];
    }

    if (movementModeRef.current !== nextMovementMode) {
      const previousMovementMode = movementModeRef.current;
      movementModeRef.current = nextMovementMode;
      onMovementModeChange?.(nextMovementMode, previousMovementMode);
    }

    const snapshot: MwendoPlayerSnapshot = {
      position: [rootPosition.x, rootPosition.y, rootPosition.z],
      focusPosition: focusPositionRef.current ?? undefined,
      velocity: [
        currentVelocity.x + deltaVelocityX,
        predictedVelocityY,
        currentVelocity.z + deltaVelocityZ,
      ],
      facing,
      movementMode: nextMovementMode,
      grounded: groundedAfterControl,
      supportState: supportStateAfterJump,
    };
    const previousSnapshot = lastSnapshotRef.current;

    setPlayerSnapshot(snapshot);
    onSnapshotChange?.(snapshot);
    if (jumpTriggered) {
      onJump?.(snapshot);
    }
    if (previousSnapshot && !previousSnapshot.grounded && groundedAfterControl) {
      onLand?.(snapshot);
    }
    lastSnapshotRef.current = snapshot;
  });

  const articulatedBodyProps: Partial<
    Record<
      MwendoHumanoidBodyKey,
      {
        onCollisionEnter?: (payload: CollisionEnterPayload) => void;
        onCollisionExit?: (payload: CollisionExitPayload) => void;
      }
    >
  > = {
    footLeft: {
      onCollisionEnter: createGroundContactEnterHandler("left"),
      onCollisionExit: createGroundContactExitHandler("left"),
    },
    footRight: {
      onCollisionEnter: createGroundContactEnterHandler("right"),
      onCollisionExit: createGroundContactExitHandler("right"),
    },
  };

  return (
    <MwendoHumanoidRagdoll
      bodyProps={articulatedBodyProps}
      bodyRefs={bodyRefs}
      debug={debug}
      ignoreCameraOcclusion
      position={position}
      sharedBodyProps={{ canSleep: false }}
    />
  );
}
