import { useFrame } from "@react-three/fiber";
import {
  type CollisionEnterPayload,
  type CollisionExitPayload,
  type RapierRigidBody,
  useRapier,
} from "@react-three/rapier";
import {
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import type { RevoluteImpulseJoint } from "@dimforge/rapier3d-compat";
import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import { useCharacterCtrlrStore, useCharacterCtrlrStoreApi } from "../CharacterCtrlrProvider";
import { useCharacterCtrlrKeyboardInput } from "../useCharacterCtrlrKeyboardInput";
import {
  DEFAULT_CHARACTER_CTRLR_INPUT,
  type CharacterCtrlrBalanceState,
  type CharacterCtrlrMixamoMotionSource,
  mergeCharacterCtrlrInput,
  type CharacterCtrlrInputState,
  type CharacterCtrlrLocomotionDebugState,
  type CharacterCtrlrMovementMode,
  type CharacterCtrlrPlayerSnapshot,
  type CharacterCtrlrRecoveryState,
  type CharacterCtrlrSupportState,
  type CharacterCtrlrVec3,
} from "../types";
import {
  CHARACTER_CTRLR_HUMANOID_REVOLUTE_JOINT_DEFINITIONS,
  createCharacterCtrlrHumanoidBodyRefs,
  createCharacterCtrlrHumanoidRevoluteJointRefs,
  type CharacterCtrlrHumanoidBodyKey,
  type CharacterCtrlrHumanoidRevoluteJointKey,
  type CharacterCtrlrHumanoidRevoluteJointRefs,
} from "./CharacterCtrlrHumanoidData";
import { CharacterCtrlrHumanoidRagdoll } from "./CharacterCtrlrHumanoidRagdoll";
import {
  CharacterCtrlrMixamoMotionDriver,
  type CharacterCtrlrMixamoPoseTargets,
} from "./CharacterCtrlrMixamoMotionDriver";
import {
  FOOT_SUPPORT_OFFSET,
  GROUND_PROBE_MAX_DISTANCE,
  GROUND_PROBE_NORMAL_MIN_Y,
  GROUND_PROBE_ORIGIN_OFFSET,
  GRAVITY,
  MIXAMO_CONTROL_ENABLED,
  NEUTRAL_ARTICULATED_POSE,
  STAND_ASSIST_MAX_SPEED,
  STAND_FOOT_FORWARD_OFFSET,
  STAND_FOOT_LATERAL_OFFSET,
  STAND_PELVIS_HEIGHT,
  STAND_SEGMENT_MAX_TORQUE,
} from "./active-ragdoll/config";
import {
  addSupportContact as trackSupportContact,
  createInitialContactTrackingState,
  deriveConfirmedSupportState,
  removeSupportContact as untrackSupportContact,
  syncSupportState as syncTrackedSupportState,
  updateGroundingFromSignal,
} from "./active-ragdoll/contactTracking";
import {
  advanceGaitState,
  createInitialGaitState,
  createInitialRecoveryState,
  deriveActiveLocomotionMode,
  deriveBalanceState,
  deriveGaitConfigForMode,
  deriveGaitPhaseDuration,
  transitionRecoveryState,
} from "./active-ragdoll/gait";
import { angleDifference, sampleRevoluteJointAngle } from "./active-ragdoll/math";
import {
  buildLocomotionDebugState,
} from "./active-ragdoll/debugState";
import {
  deriveCapturePoint,
  deriveSupportMeasurement,
  measureCenterOfMass,
} from "./active-ragdoll/measurements";
import { driveJointToPosition, resolveJointTarget } from "./active-ragdoll/motors";
import {
  applyRecoveryPoseTargets,
  blendPhasePoseTargets,
  derivePhasePoseTargets,
} from "./active-ragdoll/poseTargets";
import {
  advanceRecoveryState,
  deriveRecoverySignals,
} from "./active-ragdoll/recovery";
import {
  advanceBootstrapTimer,
  createInitialBootstrapState,
  deriveBootstrapSupportState,
  deriveSpawnSettleActive,
  scaleBootstrapMotorGain,
  shouldSuppressLocomotionDuringBootstrap,
} from "./active-ragdoll/bootstrap";
import {
  advanceStandingFootPlant,
  deriveStandingPoseTargets,
  deriveStandingTargetFacing,
} from "./active-ragdoll/standing";
import { deriveSwingStepPlan } from "./active-ragdoll/stepPlanner";
import type {
  ContactTrackingState,
  GaitState,
  RecoveryState,
  RevoluteJointPoseMap,
  StandingFootPlant,
  SupportSide,
} from "./active-ragdoll/controllerTypes";

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
const supportForward = new Vector3();
const facingRight = new Vector3();
const facingForward = new Vector3();
const swingCorrection = new Vector3();
const swingLateral = new Vector3();
const tempFootPosition = new Vector3();
const standFootTarget = new Vector3();
const standFootImpulse = new Vector3();
const centerOfMassPosition = new Vector3();
const centerOfMassVelocity = new Vector3();
const capturePointPosition = new Vector3();
const plannedFootfallPosition = new Vector3();
const footQuaternion = new Quaternion();
const footEuler = new Euler(0, 0, 0, "YXZ");
const segmentQuaternion = new Quaternion();
const segmentEuler = new Euler(0, 0, 0, "YXZ");

export type CharacterCtrlrActiveRagdollPlayerProps = {
  position?: CharacterCtrlrVec3;
  controls?: "keyboard" | "none";
  input?: Partial<CharacterCtrlrInputState>;
  inputRef?: RefObject<CharacterCtrlrInputState | null>;
  mixamoSource?: CharacterCtrlrMixamoMotionSource;
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
  onSnapshotChange?: (snapshot: CharacterCtrlrPlayerSnapshot) => void;
  onMovementModeChange?: (
    movementMode: CharacterCtrlrMovementMode,
    previousMovementMode: CharacterCtrlrMovementMode,
  ) => void;
  onGroundedChange?: (grounded: boolean) => void;
  onJump?: (snapshot: CharacterCtrlrPlayerSnapshot) => void;
  onLand?: (snapshot: CharacterCtrlrPlayerSnapshot) => void;
};


export function CharacterCtrlrActiveRagdollPlayer({
  position = [0, 2.02, 6],
  controls = "keyboard",
  input,
  inputRef,
  mixamoSource,
  walkSpeed = 2.7,
  runSpeed = 4.7,
  crouchSpeed = 1.7,
  acceleration = 6.2,
  airControl = 0.26,
  jumpImpulse = 5.2,
  uprightTorque = 14,
  turnTorque = 5.6,
  balanceDamping = 6.8,
  cameraFocusSmoothing = 12,
  cameraFocusHeight = 0.28,
  cameraFocusLead = 0.16,
  debug = false,
  onSnapshotChange,
  onMovementModeChange,
  onGroundedChange,
  onJump,
  onLand,
}: CharacterCtrlrActiveRagdollPlayerProps) {
  const { rapier, world } = useRapier();
  const storeApi = useCharacterCtrlrStoreApi();
  const setPlayerSnapshot = useCharacterCtrlrStore((state) => state.setPlayerSnapshot);
  const bodyRefs = useMemo(() => createCharacterCtrlrHumanoidBodyRefs(), []);
  const bodyRefList = useMemo(() => Object.values(bodyRefs), [bodyRefs]);
  const jointRefs = useMemo(() => createCharacterCtrlrHumanoidRevoluteJointRefs(), []);
  const keyboardInputRef = useCharacterCtrlrKeyboardInput(controls === "keyboard");
  const idleInputRef = useRef<CharacterCtrlrInputState | null>({ ...DEFAULT_CHARACTER_CTRLR_INPUT });
  const groundedRef = useRef(false);
  const contactStateRef = useRef<ContactTrackingState>(createInitialContactTrackingState());
  const movementModeRef = useRef<CharacterCtrlrMovementMode>("idle");
  const hasMovementInputRef = useRef(false);
  const jumpHeldRef = useRef(false);
  const gaitPhaseRef = useRef(0);
  const gaitStateRef = useRef<GaitState>(createInitialGaitState());
  const recoveryStateRef = useRef<RecoveryState>(createInitialRecoveryState());
  const lastSnapshotRef = useRef<CharacterCtrlrPlayerSnapshot | null>(null);
  const lastTransitionCountRef = useRef(0);
  const transitionHistoryRef = useRef<string[]>([]);
  const focusPositionRef = useRef<CharacterCtrlrVec3 | null>(null);
  const locomotionDebugRef = useRef<CharacterCtrlrLocomotionDebugState | null>(null);
  const initialPositionRef = useRef(position);
  const standingFootPlantRef = useRef<StandingFootPlant | null>(null);
  const mixamoPoseRef = useRef<CharacterCtrlrMixamoPoseTargets | null>(null);
  const jointCalibrationRef = useRef<Partial<RevoluteJointPoseMap>>({});
  const jointCalibrationReadyRef = useRef(false);
  const debugLogCooldownRef = useRef(0);
  const smoothedGaitEffortRef = useRef(0);
  const bootstrapStateRef = useRef(createInitialBootstrapState());

  const commitGrounded = (nextGrounded: boolean) => {
    if (groundedRef.current === nextGrounded) {
      return;
    }

    groundedRef.current = nextGrounded;
    onGroundedChange?.(nextGrounded);
    contactStateRef.current.grounded = nextGrounded;
  };

  const addSupportContact = (side: SupportSide, colliderHandle: number) => {
    trackSupportContact(
      contactStateRef.current,
      side,
      colliderHandle,
      performance.now(),
    );
  };

  const removeSupportContact = (side: SupportSide, colliderHandle: number) => {
    untrackSupportContact(contactStateRef.current, side, colliderHandle);
  };

  const createGroundContactEnterHandler =
    (side: SupportSide) => (payload: CollisionEnterPayload) => {
      const normal = payload.manifold.normal();
      const supportY = payload.flipped ? normal.y : -normal.y;

      if (supportY < 0.2) {
        return;
      }

      addSupportContact(side, payload.other.collider.handle);
    };

  const createGroundContactExitHandler =
    (side: SupportSide) => (payload: CollisionExitPayload) => {
      removeSupportContact(side, payload.other.collider.handle);
      syncTrackedSupportState(contactStateRef.current);
    };

  useEffect(() => {
    const initialSnapshot: CharacterCtrlrPlayerSnapshot = {
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
    const upperLegLeft = bodyRefs.upperLegLeft.current;
    const lowerLegLeft = bodyRefs.lowerLegLeft.current;
    const leftFoot = bodyRefs.footLeft.current;
    const upperLegRight = bodyRefs.upperLegRight.current;
    const lowerLegRight = bodyRefs.lowerLegRight.current;
    const rightFoot = bodyRefs.footRight.current;

    if (
      !pelvis
      || !chest
      || !upperLegLeft
      || !lowerLegLeft
      || !leftFoot
      || !upperLegRight
      || !lowerLegRight
      || !rightFoot
    ) {
      return;
    }

    if (!jointCalibrationReadyRef.current) {
      const nextCalibration: Partial<RevoluteJointPoseMap> = {};
      let calibrationReady = true;

      for (const definition of CHARACTER_CTRLR_HUMANOID_REVOLUTE_JOINT_DEFINITIONS) {
        const bodyA = bodyRefs[definition.bodyA].current;
        const bodyB = bodyRefs[definition.bodyB].current;

        if (!bodyA || !bodyB) {
          calibrationReady = false;
          break;
        }

        const sampledAngle = sampleRevoluteJointAngle(bodyA, bodyB);
        nextCalibration[definition.key] =
          sampledAngle - NEUTRAL_ARTICULATED_POSE[definition.key];
      }

      if (calibrationReady) {
        jointCalibrationRef.current = nextCalibration;
        jointCalibrationReadyRef.current = true;
      }
    }

    const internalInput =
      controls === "keyboard"
        ? keyboardInputRef.current ?? DEFAULT_CHARACTER_CTRLR_INPUT
        : idleInputRef.current ?? DEFAULT_CHARACTER_CTRLR_INPUT;
    const keys = mergeCharacterCtrlrInput(input, inputRef?.current, internalInput);
    const { cameraYaw, playerFacing } = storeApi.getState();

    forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    right.set(-forward.z, 0, forward.x);
    movement.set(0, 0, 0);

    if (keys.forward) movement.add(forward);
    if (keys.backward) movement.sub(forward);
    if (keys.right) movement.add(right);
    if (keys.left) movement.sub(right);

    const hasMovementInput = movement.lengthSq() > 0;
    hasMovementInputRef.current = hasMovementInput;
    if (hasMovementInput) {
      movement.normalize();
    }

    const locomotionMode: CharacterCtrlrMovementMode = keys.crouch
      ? "crouch"
      : hasMovementInput && keys.run
        ? "run"
        : hasMovementInput
          ? "walk"
          : "idle";

    const leftFootPos = leftFoot.translation();
    const rightFootPos = rightFoot.translation();
    const ownBodyHandles = new Set<number>();

    for (const bodyRef of bodyRefList) {
      const body = bodyRef.current;

      if (!body) {
        continue;
      }

      ownBodyHandles.add(body.handle);
    }

    const groundProbePredicate = (collider: { parent: () => { handle: number } | null }) => {
      const parentBody = collider.parent();
      return !parentBody || !ownBodyHandles.has(parentBody.handle);
    };
    const castGroundProbe = (origin: { x: number; y: number; z: number }) => {
      const hit = world.castRayAndGetNormal(
        new rapier.Ray(
          {
            x: origin.x,
            y: origin.y + GROUND_PROBE_ORIGIN_OFFSET,
            z: origin.z,
          },
          { x: 0, y: -1, z: 0 },
        ),
        GROUND_PROBE_MAX_DISTANCE,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        groundProbePredicate,
      );

      return hit && hit.normal.y >= GROUND_PROBE_NORMAL_MIN_Y ? hit : null;
    };
    const leftGroundProbeHit = castGroundProbe(leftFootPos);
    const rightGroundProbeHit = castGroundProbe(rightFootPos);
    const probedSupportState: CharacterCtrlrSupportState =
      leftGroundProbeHit && rightGroundProbeHit
        ? "double"
        : leftGroundProbeHit
          ? "left"
          : rightGroundProbeHit
            ? "right"
            : "none";
    const contactState = contactStateRef.current;
    const debugNow = performance.now();
    const effectiveGroundedSignal =
      contactState.rawContactsGrounded
      || (
        probedSupportState !== "none"
        && !contactState.jumpContactClearPending
        && Math.abs(pelvis.linvel().y) < 2.0
      );
    updateGroundingFromSignal({
      state: contactState,
      delta,
      effectiveGroundedSignal,
      probedSupportState,
      onGroundedChange: commitGrounded,
    });

    const actualSupportState = contactState.supportState;
    const grounded = groundedRef.current;
    const currentVelocity = pelvis.linvel();
    const pelvisMass = pelvis.mass();
    const horizontalSpeed = Math.hypot(currentVelocity.x, currentVelocity.z);
    const turnInput = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const pureTurnRequested =
      turnInput !== 0
      && !keys.forward
      && !keys.backward
      && !keys.jump
      && !keys.crouch;
    const standingAssistRequested =
      grounded
      && (
        !hasMovementInput
        || pureTurnRequested
      );
    const spawnSettleActive = deriveSpawnSettleActive({
      jointCalibrationReady: jointCalibrationReadyRef.current,
      standingAssistRequested,
      bootstrapState: bootstrapStateRef.current,
    });
    const suppressLocomotionDuringBootstrap =
      shouldSuppressLocomotionDuringBootstrap(spawnSettleActive);
    const turnInPlaceRequested =
      pureTurnRequested
      && grounded
      && !spawnSettleActive
      && horizontalSpeed <= STAND_ASSIST_MAX_SPEED;
    const locomotionCommandActive =
      hasMovementInput
      && !spawnSettleActive
      && !suppressLocomotionDuringBootstrap
      && !turnInPlaceRequested;
    const activeLocomotionMode = deriveActiveLocomotionMode(
      locomotionCommandActive,
      locomotionMode,
    );
    const activeLocomotionSpeed =
      activeLocomotionMode === "run"
        ? runSpeed
        : activeLocomotionMode === "walk"
          ? walkSpeed
          : activeLocomotionMode === "crouch"
            ? crouchSpeed
            : 0;
    const gaitConfig = deriveGaitConfigForMode(activeLocomotionMode);
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
    const commandedVelocityX = locomotionCommandActive ? movement.x * activeLocomotionSpeed : 0;
    const commandedVelocityZ = locomotionCommandActive ? movement.z * activeLocomotionSpeed : 0;
    const deltaVelocityX = (commandedVelocityX - currentVelocity.x) * locomotionBlend;
    const deltaVelocityZ = (commandedVelocityZ - currentVelocity.z) * locomotionBlend;

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
      contactState.jumpContactClearPending = true;
      commitGrounded(false);
      contactState.groundedGraceTimer = 0;
      contactState.groundingConfirmTimer = 0;
      contactState.rawContactsGrounded = false;
      pelvis.applyImpulse(
        { x: 0, y: jumpImpulse * pelvisMass, z: 0 },
        true,
      );
      chest.applyImpulse(
        { x: 0, y: jumpImpulse * chest.mass() * 0.35, z: 0 },
        true,
      );
    }

    if (contactState.jumpContactClearPending && currentVelocity.y > 0.5) {
      contactState.leftSupportContacts.clear();
      contactState.rightSupportContacts.clear();
      contactState.supportState = "none";
      contactState.jumpContactClearPending = false;
    } else if (contactState.jumpContactClearPending && !jumpTriggered && currentVelocity.y <= 0) {
      contactState.jumpContactClearPending = false;
    }

    const supportStateAfterJump = jumpTriggered
      ? "none"
      : deriveBootstrapSupportState({
          spawnSettleActive,
          contactSupportState: contactState.supportState,
          probedSupportState,
        });
    const movementHeading = Math.atan2(movement.x, movement.z);
    const targetFacing = deriveStandingTargetFacing({
      playerFacing,
      movementHeading,
      hasMovementInput,
      pureTurnRequested,
      turnInput,
      grounded,
      delta,
    });
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
    const speedRatio = Math.min(1, horizontalSpeed / Math.max(0.001, runSpeed));
    const commandEffort = locomotionCommandActive ? gaitConfig.commandEffort : 0;
    const rawGaitEffort =
      grounded && locomotionCommandActive ? Math.max(speedRatio, commandEffort) : speedRatio;
    smoothedGaitEffortRef.current = MathUtils.damp(
      smoothedGaitEffortRef.current,
      rawGaitEffort,
      8.0,
      delta,
    );
    const gaitEffort = smoothedGaitEffortRef.current;
    const postureAmount = gaitConfig.postureAmount;
    const airborneAmount = grounded ? 0 : 1;
    const gaitState = gaitStateRef.current;
    gaitState.phaseElapsed += delta;
    const cadence = MathUtils.lerp(
      gaitConfig.cadenceRange[0],
      gaitConfig.cadenceRange[1],
      gaitEffort,
    );
    if (grounded && locomotionCommandActive) {
      gaitPhaseRef.current += delta * cadence;
    }

    const supportStateForPhase = deriveConfirmedSupportState(
      contactState,
      debugNow,
      spawnSettleActive && supportStateAfterJump !== "none"
        ? "double"
        : supportStateAfterJump,
    );
    advanceGaitState({
      gaitState,
      grounded,
      locomotionCommandActive,
      spawnSettleActive,
      supportStateForPhase,
      gaitEffort,
      gaitConfig,
      jumpTriggered,
    });
    const gaitPhaseValue = gaitState.phaseDuration > 0
      ? Math.min(1, gaitState.phaseElapsed / gaitState.phaseDuration)
      : 0;
    if (gaitState.transitionCount !== lastTransitionCountRef.current) {
      lastTransitionCountRef.current = gaitState.transitionCount;
      transitionHistoryRef.current = [
        `${gaitState.phase}:${gaitState.transitionReason}`,
        ...transitionHistoryRef.current,
      ].slice(0, 4);
    }
    const rootPosition = pelvis.translation();
    const chestPosition = chest.translation();
    const predictedVelocityY = jumpTriggered
      ? currentVelocity.y + jumpImpulse
      : currentVelocity.y;
    const groundedAfterControl = groundedRef.current;
    const nextMovementMode: CharacterCtrlrMovementMode = groundedAfterControl
      ? activeLocomotionMode
      : predictedVelocityY > 0.35
        ? "jump"
        : "fall";
    const facing = MathUtils.damp(
      playerFacing,
      targetFacing,
      groundedAfterControl ? 10 : 4,
      delta,
    );
    let phasePoseTargets = derivePhasePoseTargets({
      gaitPhase: gaitState.phase,
      gaitPhaseValue,
      gaitEffort,
      gaitConfig,
      grounded: groundedAfterControl,
    });
    const chestRotation = chest.rotation();
    const chestAngularVelocity = chest.angvel();
    const chestMass = chest.mass();

    chestQuaternion.set(
      chestRotation.x,
      chestRotation.y,
      chestRotation.z,
      chestRotation.w,
    );
    chestEuler.setFromQuaternion(chestQuaternion, "YXZ");
    const previousSnapshot = lastSnapshotRef.current;

    const plannedSupportSide: SupportSide | null =
      gaitState.phase === "left-stance"
        ? "left"
        : gaitState.phase === "right-stance"
          ? "right"
          : supportStateForPhase === "left"
            ? "left"
            : supportStateForPhase === "right"
              ? "right"
              : null;
    const swingSide: SupportSide | null =
      plannedSupportSide === "left"
        ? "right"
        : plannedSupportSide === "right"
          ? "left"
          : null;

    facingRight.set(Math.cos(facing), 0, -Math.sin(facing));
    facingForward.set(Math.sin(facing), 0, Math.cos(facing));

    let supportLateralError = 0;
    let supportForwardError = 0;
    let supportHeightError = 0;
    let captureLateralError = 0;
    let captureForwardError = 0;
    let captureTime = 0;
    let captureUrgency = 0;
    let footfallForwardError = 0;
    let footfallLateralError = 0;
    const standingSupport =
      groundedAfterControl
      && (
        !locomotionCommandActive
        || spawnSettleActive
      );
    const supportStateForControl = supportStateAfterJump;
    const stepLengthTarget =
      groundedAfterControl && locomotionCommandActive
        ? MathUtils.lerp(gaitConfig.step.length[0], gaitConfig.step.length[1], gaitEffort)
        : 0;
    const stepWidthTarget = groundedAfterControl
      ? MathUtils.lerp(gaitConfig.step.width[0], gaitConfig.step.width[1], postureAmount)
      : 0.2;
    const stepHeightTarget =
      groundedAfterControl && locomotionCommandActive
        ? MathUtils.lerp(gaitConfig.step.height[0], gaitConfig.step.height[1], gaitEffort)
        : 0.02;

    const centerOfMassMeasurement = measureCenterOfMass({
      bodyRefs: bodyRefList,
      fallbackPosition: [rootPosition.x, rootPosition.y, rootPosition.z],
      fallbackVelocity: [currentVelocity.x, currentVelocity.y, currentVelocity.z],
    });
    const totalTrackedMass = centerOfMassMeasurement.totalTrackedMass;
    centerOfMassPosition.set(
      centerOfMassMeasurement.position[0],
      centerOfMassMeasurement.position[1],
      centerOfMassMeasurement.position[2],
    );
    centerOfMassVelocity.set(
      centerOfMassMeasurement.velocity[0],
      centerOfMassMeasurement.velocity[1],
      centerOfMassMeasurement.velocity[2],
    );
    const supportMass = Math.max(
      pelvisMass + chestMass,
      totalTrackedMass * (standingSupport ? 0.9 : 0.78),
    );
    const pelvisSupportShare = standingSupport ? 0.74 : 0.78;
    const chestSupportShare = 1 - pelvisSupportShare;

    capturePointPosition.set(
      centerOfMassPosition.x,
      rootPosition.y,
      centerOfMassPosition.z,
    );
    supportCenter.set(rootPosition.x, rootPosition.y, rootPosition.z);
    plannedFootfallPosition.set(rootPosition.x, rootPosition.y, rootPosition.z);

    if (groundedAfterControl) {
      const supportMeasurement = deriveSupportMeasurement({
        rootPosition: [rootPosition.x, rootPosition.y, rootPosition.z],
        supportState: supportStateForControl,
        leftFootPosition: [leftFootPos.x, leftFootPos.y, leftFootPos.z],
        rightFootPosition: [rightFootPos.x, rightFootPos.y, rightFootPos.z],
      });
      const supportPointCount = supportMeasurement.pointCount;

      if (supportPointCount > 0) {
        supportCenter.set(
          supportMeasurement.center[0],
          supportMeasurement.center[1],
          supportMeasurement.center[2],
        );

        const lateralError =
          (supportCenter.x - rootPosition.x) * facingRight.x
          + (supportCenter.z - rootPosition.z) * facingRight.z;
        const desiredPelvisLead =
          groundedAfterControl && locomotionCommandActive
            ? stepLengthTarget
              * MathUtils.lerp(
                gaitConfig.step.pelvisLeadScale[0],
                gaitConfig.step.pelvisLeadScale[1],
                gaitEffort,
              )
              * (supportStateForControl === "double" ? 0.82 : 1.05)
            : 0;
        const capturePointMeasurement = deriveCapturePoint({
          centerOfMass: [
            centerOfMassPosition.x,
            centerOfMassPosition.y,
            centerOfMassPosition.z,
          ],
          centerOfMassVelocity: [
            centerOfMassVelocity.x,
            centerOfMassVelocity.y,
            centerOfMassVelocity.z,
          ],
          supportPlaneY: supportMeasurement.supportPlaneY,
          gravity: GRAVITY,
        });
        captureTime = capturePointMeasurement.captureTime;
        capturePointPosition.set(
          capturePointMeasurement.point[0],
          capturePointMeasurement.point[1],
          capturePointMeasurement.point[2],
        );
        captureLateralError =
          (capturePointPosition.x - supportCenter.x) * facingRight.x
          + (capturePointPosition.z - supportCenter.z) * facingRight.z;
        captureForwardError =
          (capturePointPosition.x - supportCenter.x) * facingForward.x
          + (capturePointPosition.z - supportCenter.z) * facingForward.z;
        const forwardError =
          (supportCenter.x - rootPosition.x) * facingForward.x
          + (supportCenter.z - rootPosition.z) * facingForward.z
          + desiredPelvisLead;
        const captureLateralFeedback = MathUtils.clamp(
          captureLateralError * MathUtils.lerp(
            gaitConfig.support.captureFeedback.lateral[0],
            gaitConfig.support.captureFeedback.lateral[1],
            gaitEffort,
          ),
          -0.18,
          0.18,
        );
        const captureForwardFeedback = MathUtils.clamp(
          captureForwardError * MathUtils.lerp(
            gaitConfig.support.captureFeedback.forward[0],
            gaitConfig.support.captureFeedback.forward[1],
            gaitEffort,
          ),
          -0.14,
          0.26,
        );
        const correctedLateralError = lateralError + captureLateralFeedback;
        const correctedForwardError = forwardError + captureForwardFeedback;
        const supportCentering = standingSupport
          ? MathUtils.lerp(2.2, 3.2, captureUrgency)
          : supportStateForControl === "double"
            ? gaitConfig.support.centering.double
            : gaitConfig.support.centering.single;
        const supportForwarding = standingSupport
          ? MathUtils.lerp(1.4, 2.2, captureUrgency)
          : supportStateForControl === "double"
            ? MathUtils.lerp(
                gaitConfig.support.forwarding.double[0],
                gaitConfig.support.forwarding.double[1],
                gaitEffort,
              )
            : MathUtils.lerp(
                gaitConfig.support.forwarding.single[0],
                gaitConfig.support.forwarding.single[1],
                gaitEffort,
              );
        captureUrgency = MathUtils.clamp(
          Math.max(
            Math.abs(captureLateralError) * 2.2,
            Math.abs(captureForwardError) * 1.8,
          ),
          0,
          1,
        );
        const desiredPelvisHeight =
          supportCenter.y
          + (
            standingSupport
              ? STAND_PELVIS_HEIGHT
              : MathUtils.lerp(
                  gaitConfig.step.pelvisHeight[0],
                  gaitConfig.step.pelvisHeight[1],
                  postureAmount,
                )
          );
        const heightError = desiredPelvisHeight - rootPosition.y;
        supportLateralError = lateralError;
        supportForwardError = forwardError;
        supportHeightError = heightError;
        const supportImpulseCeiling = standingSupport
          ? MathUtils.lerp(0.48, 0.68, captureUrgency)
          : MathUtils.lerp(0.62, 0.88, gaitEffort);
        const supportImpulseY = MathUtils.clamp(
          (
            heightError * (standingSupport ? 10.8 : 9.5)
            - currentVelocity.y * (standingSupport ? 2.6 : 1.8)
          ) * supportMass * delta,
          standingSupport ? -0.22 : -0.14,
          standingSupport ? 0.84 : supportImpulseCeiling,
        );
        const supportCorrectionBoost = standingSupport
          ? MathUtils.lerp(0.82, 1.08, captureUrgency)
          : MathUtils.lerp(1.0, 1.4, gaitEffort);
        supportCorrection
          .copy(facingRight)
          .multiplyScalar(
            correctedLateralError * supportMass * supportCentering * supportCorrectionBoost * delta,
          );
        supportForward
          .copy(facingForward)
          .multiplyScalar(
            correctedForwardError * supportMass * supportForwarding * supportCorrectionBoost * delta,
          );
        supportCorrection.add(supportForward);
        const heightImpulse = MathUtils.clamp(
          supportImpulseY * pelvisSupportShare,
          standingSupport ? -0.18 : -0.12,
          standingSupport ? 0.62 : MathUtils.lerp(0.44, 0.68, gaitEffort),
        );
        pelvis.applyImpulse(
          {
            x: supportCorrection.x * pelvisSupportShare,
            y: heightImpulse,
            z: supportCorrection.z * pelvisSupportShare,
          },
          true,
        );
        chest.applyImpulse(
          {
            x: supportCorrection.x * chestSupportShare,
            y: supportImpulseY * chestSupportShare * 0.9,
            z: supportCorrection.z * chestSupportShare,
          },
          true,
        );
      }
    }

    if (supportStateForControl === "none") {
      const desiredFootCenterY =
        rootPosition.y - STAND_PELVIS_HEIGHT + FOOT_SUPPORT_OFFSET;
      const applyUnsupportedFootReach = (
        foot: typeof leftFoot,
        lateralDirection: 1 | -1,
      ) => {
        const footPosition = foot.translation();
        const footVelocity = foot.linvel();
        const footMass = foot.mass();
        const footAngularVelocity = foot.angvel();
        const footRotation = foot.rotation();

        standFootTarget
          .copy(facingRight)
          .multiplyScalar(lateralDirection * STAND_FOOT_LATERAL_OFFSET)
          .addScaledVector(facingForward, STAND_FOOT_FORWARD_OFFSET)
          .add(tempFootPosition.set(rootPosition.x, desiredFootCenterY, rootPosition.z));

        standFootImpulse.set(
          MathUtils.clamp(
            (standFootTarget.x - footPosition.x) * 18 - footVelocity.x * 4.6,
            -2.2,
            2.2,
          ) * footMass * delta,
          MathUtils.clamp(
            (standFootTarget.y - footPosition.y) * 14 - footVelocity.y * 3,
            -0.9,
            0.45,
          ) * footMass * delta,
          MathUtils.clamp(
            (standFootTarget.z - footPosition.z) * 18 - footVelocity.z * 4.6,
            -2.2,
            2.2,
          ) * footMass * delta,
        );
        foot.applyImpulse(
          {
            x: standFootImpulse.x,
            y: standFootImpulse.y,
            z: standFootImpulse.z,
          },
          true,
        );

        footQuaternion.set(
          footRotation.x,
          footRotation.y,
          footRotation.z,
          footRotation.w,
        );
        footEuler.setFromQuaternion(footQuaternion, "YXZ");
        foot.applyTorqueImpulse(
          {
            x: MathUtils.clamp(
              ((0.04 - footEuler.x) * 4.8 - footAngularVelocity.x * 1.8) * footMass * delta,
              -0.18,
              0.18,
            ),
            y: MathUtils.clamp(
              (
                angleDifference(footEuler.y, facing) * 1.1
                - footAngularVelocity.y * 0.7
              ) * footMass * delta,
              -0.1,
              0.1,
            ),
            z: MathUtils.clamp(
              ((0 - footEuler.z) * 5.2 - footAngularVelocity.z * 1.8) * footMass * delta,
              -0.18,
              0.18,
            ),
          },
          true,
        );
      };

      applyUnsupportedFootReach(leftFoot, -1);
      applyUnsupportedFootReach(rightFoot, 1);
    }

    if (standingSupport && groundedAfterControl && supportStateForControl !== "none") {
      const leftFootPosition = leftFoot.translation();
      const rightFootPosition = rightFoot.translation();
      const supportPlaneY =
        supportStateForControl === "double"
          ? (
              (leftFootPosition.y - FOOT_SUPPORT_OFFSET)
              + (rightFootPosition.y - FOOT_SUPPORT_OFFSET)
            ) * 0.5
          : supportStateForControl === "left"
            ? leftFootPosition.y - FOOT_SUPPORT_OFFSET
            : rightFootPosition.y - FOOT_SUPPORT_OFFSET;

      standingFootPlantRef.current = advanceStandingFootPlant({
        currentPlant: standingFootPlantRef.current,
        supportCenter: [supportCenter.x, supportCenter.y, supportCenter.z],
        supportPlaneY,
        facing,
        delta,
        turnInPlaceRequested,
      });

      const standingFootPlant = standingFootPlantRef.current;
      if (standingFootPlant) {
        const applyStandingFootPlant = (
          foot: typeof leftFoot,
          target: CharacterCtrlrVec3,
        ) => {
          const footPosition = foot.translation();
          const footVelocity = foot.linvel();
          const footMass = foot.mass();
          const footAngularVelocity = foot.angvel();
          const footRotation = foot.rotation();

          standFootTarget.set(target[0], target[1], target[2]);
          standFootImpulse.set(
            MathUtils.clamp(
              (standFootTarget.x - footPosition.x) * 20 - footVelocity.x * 5.4,
              -1.8,
              1.8,
            ) * footMass * delta,
            MathUtils.clamp(
              Math.max(0, standFootTarget.y - footPosition.y) * 15 - footVelocity.y * 3.8,
              -0.18,
              0.92,
            ) * footMass * delta,
            MathUtils.clamp(
              (standFootTarget.z - footPosition.z) * 20 - footVelocity.z * 5.4,
              -1.8,
              1.8,
            ) * footMass * delta,
          );
          foot.applyImpulse(
            {
              x: standFootImpulse.x,
              y: standFootImpulse.y,
              z: standFootImpulse.z,
            },
            true,
          );

          footQuaternion.set(
            footRotation.x,
            footRotation.y,
            footRotation.z,
            footRotation.w,
          );
          footEuler.setFromQuaternion(footQuaternion, "YXZ");

          foot.applyTorqueImpulse(
            {
              x: MathUtils.clamp(
                ((0.04 - footEuler.x) * 6.4 - footAngularVelocity.x * 2.4) * footMass * delta,
                -0.3,
                0.3,
              ),
              y: MathUtils.clamp(
                (
                  angleDifference(footEuler.y, facing) * 1.4
                  - footAngularVelocity.y * 0.8
                ) * footMass * delta,
                -0.12,
                0.12,
              ),
              z: MathUtils.clamp(
                ((0 - footEuler.z) * 6.8 - footAngularVelocity.z * 2.4) * footMass * delta,
                -0.3,
                0.3,
              ),
            },
            true,
          );
        };

        applyStandingFootPlant(leftFoot, standingFootPlant.left);
        applyStandingFootPlant(rightFoot, standingFootPlant.right);
      }
    } else {
      standingFootPlantRef.current = null;
    }

    if (standingSupport && groundedAfterControl) {
      const applyStandingSegmentTorque = (
        body: typeof upperLegLeft,
        targetPitch: number,
        stiffness: number,
        damping: number,
      ) => {
        const bodyRotation = body.rotation();
        const bodyAngularVelocity = body.angvel();
        const bodyMass = body.mass();

        segmentQuaternion.set(
          bodyRotation.x,
          bodyRotation.y,
          bodyRotation.z,
          bodyRotation.w,
        );
        segmentEuler.setFromQuaternion(segmentQuaternion, "YXZ");

        body.applyTorqueImpulse(
          {
            x: MathUtils.clamp(
              (
                (targetPitch - segmentEuler.x) * stiffness
                - bodyAngularVelocity.x * damping
              ) * bodyMass * delta,
              -STAND_SEGMENT_MAX_TORQUE,
              STAND_SEGMENT_MAX_TORQUE,
            ),
            y: 0,
            z: 0,
          },
          true,
        );
      };

      applyStandingSegmentTorque(upperLegLeft, 0.02, 9.5, 3.8);
      applyStandingSegmentTorque(lowerLegLeft, 0.01, 11.5, 4.6);
      applyStandingSegmentTorque(leftFoot, 0.04, 8.4, 3.4);
      applyStandingSegmentTorque(upperLegRight, 0.02, 9.5, 3.8);
      applyStandingSegmentTorque(lowerLegRight, 0.01, 11.5, 4.6);
      applyStandingSegmentTorque(rightFoot, 0.04, 8.4, 3.4);
    }

    const recoveryState = recoveryStateRef.current;
    recoveryState.elapsed += delta;
    const pelvisTilt = Math.max(
      Math.abs(pelvisEuler.x),
      Math.abs(pelvisEuler.z),
    );
    const chestTilt = Math.max(
      Math.abs(chestEuler.x),
      Math.abs(chestEuler.z),
    );
    const supportHeight = rootPosition.y - supportCenter.y;
    const recoverySignals = deriveRecoverySignals({
      groundedAfterControl,
      supportState: supportStateAfterJump,
      standingSupport,
      supportHeight,
      pelvisTilt,
      chestTilt,
      captureUrgency,
      supportLateralError,
      supportForwardError,
      captureLateralError,
      captureForwardError,
    });

    advanceBootstrapTimer({
      state: bootstrapStateRef.current,
      delta,
      standingAssistRequested,
      standBootstrapStable: recoverySignals.standBootstrapStable,
    });

    const recoveryProgress = advanceRecoveryState({
      recoveryState,
      jumpTriggered,
      groundedAfterControl,
      predictedVelocityY,
      previousGrounded: previousSnapshot?.grounded ?? true,
      spawnSettleActive,
      severeInstability: recoverySignals.severeInstability,
      moderateInstability: recoverySignals.moderateInstability,
      recoveryReady: recoverySignals.recoveryReady,
      standBootstrapStable: recoverySignals.standBootstrapStable,
    });
    phasePoseTargets = applyRecoveryPoseTargets(
      phasePoseTargets,
      recoveryState.mode,
      recoveryProgress,
    );
    if (standingSupport) {
      phasePoseTargets = deriveStandingPoseTargets({
        baseTargets: phasePoseTargets,
        supportLateralError,
        supportForwardError,
        captureLateralError,
        captureForwardError,
        yawError,
        turnInPlaceRequested,
      });
    }
    if (MIXAMO_CONTROL_ENABLED && mixamoSource && mixamoPoseRef.current && !spawnSettleActive) {
      phasePoseTargets = blendPhasePoseTargets(
        phasePoseTargets,
        mixamoPoseRef.current,
        mixamoSource.blend ?? 0.88,
      );
    }

    const recoveryTorqueBoost =
      recoveryState.mode === "fallen"
        ? 1.35
        : recoveryState.mode === "recovering"
          ? 1.2
          : recoveryState.mode === "landing"
            ? 1.08
            : 1;

    const pelvisTorqueClamp = MathUtils.lerp(0.55, 0.82, gaitEffort);
    const chestTorqueClamp = MathUtils.lerp(0.38, 0.58, gaitEffort);

    const forwardLeanCompPitch =
      groundedAfterControl && activeLocomotionMode === "run"
        ? MathUtils.clamp(captureForwardError * horizontalSpeed * 0.15, -0.2, 0.4)
        : 0;

    pelvis.applyTorqueImpulse(
      {
        x: MathUtils.clamp(
          (
            (phasePoseTargets.pelvisPitch - forwardLeanCompPitch - pelvisEuler.x) * uprightTorque
            - pelvisAngularVelocity.x * balanceDamping
          ) * pelvisTorqueScale * recoveryTorqueBoost * delta,
          -pelvisTorqueClamp,
          pelvisTorqueClamp,
        ),
        y: MathUtils.clamp(
          (
            yawError * turnTorque
            - pelvisAngularVelocity.y * (balanceDamping * 0.65)
          ) * pelvisTorqueScale * delta,
          -(pelvisTorqueClamp * 0.5),
          pelvisTorqueClamp * 0.5,
        ),
        z: MathUtils.clamp(
          (
            (phasePoseTargets.pelvisRoll - pelvisEuler.z) * uprightTorque
            - pelvisAngularVelocity.z * balanceDamping
          ) * pelvisTorqueScale * recoveryTorqueBoost * delta,
          -pelvisTorqueClamp,
          pelvisTorqueClamp,
        ),
      },
      true,
    );

    chest.applyTorqueImpulse(
      {
        x: MathUtils.clamp(
          (
            (phasePoseTargets.chestPitch - forwardLeanCompPitch * 0.5 - chestEuler.x) * uprightTorque * 0.84
            - chestAngularVelocity.x * balanceDamping
          ) * pelvisTorqueScale * recoveryTorqueBoost * delta,
          -chestTorqueClamp,
          chestTorqueClamp,
        ),
        y: MathUtils.clamp(
          (
            yawError * turnTorque * 0.35
            - chestAngularVelocity.y * (balanceDamping * 0.5)
          ) * pelvisTorqueScale * delta,
          -(chestTorqueClamp * 0.42),
          chestTorqueClamp * 0.42,
        ),
        z: MathUtils.clamp(
          (
            (phasePoseTargets.chestRoll - chestEuler.z) * uprightTorque * 0.84
            - chestAngularVelocity.z * balanceDamping
          ) * pelvisTorqueScale * recoveryTorqueBoost * delta,
          -chestTorqueClamp,
          chestTorqueClamp,
        ),
      },
      true,
    );

    if (
      groundedAfterControl
      && (recoveryState.mode === "fallen" || recoveryState.mode === "recovering")
    ) {
      const recoveryDamping = recoveryState.mode === "fallen" ? 2.2 : 1.4;
      pelvis.applyImpulse(
        {
          x: -currentVelocity.x * pelvisMass * recoveryDamping * delta,
          y: 0,
          z: -currentVelocity.z * pelvisMass * recoveryDamping * delta,
        },
        true,
      );
      chest.applyImpulse(
        {
          x: -currentVelocity.x * pelvisMass * recoveryDamping * 0.22 * delta,
          y: 0,
          z: -currentVelocity.z * pelvisMass * recoveryDamping * 0.22 * delta,
        },
        true,
      );
    }

    const allowGaitStepping =
      recoveryState.mode === "stable" || recoveryState.mode === "stumbling";

    if (
      allowGaitStepping
      && groundedAfterControl
      && locomotionCommandActive
      && (gaitState.phase === "left-stance" || gaitState.phase === "right-stance")
      && gaitState.phaseDuration > 0
    ) {
      const basePhaseDuration = deriveGaitPhaseDuration(
        gaitState.phase,
        gaitEffort,
        gaitConfig,
      );
      gaitState.phaseDuration = Math.max(
        0.16,
        MathUtils.lerp(
          basePhaseDuration,
          basePhaseDuration * gaitConfig.support.phaseCompression,
          captureUrgency,
        ),
      );
    }

    if (allowGaitStepping && groundedAfterControl && swingSide && locomotionCommandActive) {
      const swingFoot = swingSide === "left" ? leftFoot : rightFoot;
      const stanceFoot = swingSide === "left" ? rightFoot : leftFoot;
      const swingFootPosition = swingFoot.translation();
      const stanceFootPosition = stanceFoot.translation();
      const swingVelocity = swingFoot.linvel();
      const swingMass = swingFoot.mass();
      const swingProgress =
        gaitState.phase === "left-stance" || gaitState.phase === "right-stance"
          ? gaitPhaseValue
          : 0.5;
      const swingBlend =
        Math.min(1, delta * 5.4)
        * (supportStateAfterJump === "double" ? 1 : 0.68);
      const swingForwardOffset =
        (swingFootPosition.x - rootPosition.x) * facingForward.x
        + (swingFootPosition.z - rootPosition.z) * facingForward.z;
      const swingLateralOffset =
        (swingFootPosition.x - rootPosition.x) * facingRight.x
        + (swingFootPosition.z - rootPosition.z) * facingRight.z;
      const stepPlan = deriveSwingStepPlan({
        swingSide,
        supportCenter: [supportCenter.x, supportCenter.y, supportCenter.z],
        rootPosition: [rootPosition.x, rootPosition.y, rootPosition.z],
        stanceFootPosition: [
          stanceFootPosition.x,
          stanceFootPosition.y,
          stanceFootPosition.z,
        ],
        facingForward: [facingForward.x, facingForward.y, facingForward.z],
        facingRight: [facingRight.x, facingRight.y, facingRight.z],
        stepLengthTarget,
        stepWidthTarget,
        stepHeightTarget,
        gaitEffort,
        gaitConfig,
        swingProgress,
        supportState: supportStateAfterJump,
        captureUrgency,
        captureForwardError,
        captureLateralError,
        yawError,
      });
      const desiredSwingForwardOffset = stepPlan.desiredSwingForwardOffset;
      const desiredSwingLateralOffset = stepPlan.desiredSwingLateralOffset;
      const desiredSwingHeight = stepPlan.desiredSwingHeight;
      footfallForwardError = desiredSwingForwardOffset - swingForwardOffset;
      footfallLateralError = desiredSwingLateralOffset - swingLateralOffset;
      const swingPlacementStrength = stepPlan.swingPlacementStrength;
      const swingDrive = stepPlan.swingDrive;
      const swingHeightError = desiredSwingHeight - swingFootPosition.y;
      const swingHeightDrive = MathUtils.clamp(
        (
          swingHeightError * stepPlan.swingHeightDriveGain
          - swingVelocity.y * 1.9
        ) * swingMass * swingBlend,
        0,
        swingMass * (0.45 + stepHeightTarget * 2.6 + captureUrgency * 0.18),
      );

      plannedFootfallPosition.set(
        stepPlan.plannedFootfall[0],
        stepPlan.plannedFootfall[1],
        stepPlan.plannedFootfall[2],
      );

      swingCorrection
        .copy(facingForward)
        .multiplyScalar(
          (desiredSwingForwardOffset - swingForwardOffset)
          * swingMass
          * swingPlacementStrength
          * delta,
        );
      swingLateral
        .copy(facingRight)
        .multiplyScalar(
          (desiredSwingLateralOffset - swingLateralOffset)
          * swingMass
          * swingPlacementStrength
          * 0.72
          * delta,
        );
      swingCorrection.add(swingLateral);

      swingFoot.applyImpulse(
        {
          x:
            (commandedVelocityX * swingDrive - swingVelocity.x) * swingMass * swingBlend
            + swingCorrection.x,
          y: swingHeightDrive,
          z:
            (commandedVelocityZ * swingDrive - swingVelocity.z) * swingMass * swingBlend
            + swingCorrection.z,
        },
        true,
      );
    }

    const hipLeftTarget = resolveJointTarget(
      "hipLeft",
      MathUtils.clamp(phasePoseTargets.left.hip - airborneAmount * 0.04, -0.9, 0.7),
      jointCalibrationRef.current,
    );
    const hipRightTarget = resolveJointTarget(
      "hipRight",
      MathUtils.clamp(phasePoseTargets.right.hip - airborneAmount * 0.04, -0.9, 0.7),
      jointCalibrationRef.current,
    );
    const shoulderLeftTarget = resolveJointTarget(
      "shoulderLeft",
      MathUtils.clamp(phasePoseTargets.left.shoulder, -1.1, 0.9),
      jointCalibrationRef.current,
    );
    const shoulderRightTarget = resolveJointTarget(
      "shoulderRight",
      MathUtils.clamp(phasePoseTargets.right.shoulder, -1.1, 0.9),
      jointCalibrationRef.current,
    );
    const kneeLeftTarget = resolveJointTarget(
      "kneeLeft",
      phasePoseTargets.left.knee,
      jointCalibrationRef.current,
    );
    const kneeRightTarget = resolveJointTarget(
      "kneeRight",
      phasePoseTargets.right.knee,
      jointCalibrationRef.current,
    );
    const ankleLeftTarget = resolveJointTarget(
      "ankleLeft",
      phasePoseTargets.left.ankle,
      jointCalibrationRef.current,
    );
    const ankleRightTarget = resolveJointTarget(
      "ankleRight",
      phasePoseTargets.right.ankle,
      jointCalibrationRef.current,
    );
    const elbowLeftTarget = resolveJointTarget(
      "elbowLeft",
      phasePoseTargets.left.elbow,
      jointCalibrationRef.current,
    );
    const elbowRightTarget = resolveJointTarget(
      "elbowRight",
      phasePoseTargets.right.elbow,
      jointCalibrationRef.current,
    );
    const wristLeftTarget = resolveJointTarget(
      "wristLeft",
      phasePoseTargets.left.wrist,
      jointCalibrationRef.current,
    );
    const wristRightTarget = resolveJointTarget(
      "wristRight",
      phasePoseTargets.right.wrist,
      jointCalibrationRef.current,
    );
    const liveLegJointAngles = {
      hipLeft: sampleRevoluteJointAngle(pelvis, upperLegLeft),
      hipRight: sampleRevoluteJointAngle(pelvis, upperLegRight),
      kneeLeft: sampleRevoluteJointAngle(upperLegLeft, lowerLegLeft),
      kneeRight: sampleRevoluteJointAngle(upperLegRight, lowerLegRight),
      ankleLeft: sampleRevoluteJointAngle(lowerLegLeft, leftFoot),
      ankleRight: sampleRevoluteJointAngle(lowerLegRight, rightFoot),
    };

    driveJointToPosition(
      jointRefs.hipLeft.current,
      hipLeftTarget,
      scaleBootstrapMotorGain(
        groundedAfterControl ? (standingSupport ? 34 : 20) : 11,
        spawnSettleActive,
        groundedAfterControl,
      ),
      scaleBootstrapMotorGain(
        groundedAfterControl ? (standingSupport ? 7.8 : 4.4) : 2.8,
        spawnSettleActive,
        groundedAfterControl,
        1.2,
      ),
    );
    driveJointToPosition(
      jointRefs.hipRight.current,
      hipRightTarget,
      scaleBootstrapMotorGain(
        groundedAfterControl ? (standingSupport ? 34 : 20) : 11,
        spawnSettleActive,
        groundedAfterControl,
      ),
      scaleBootstrapMotorGain(
        groundedAfterControl ? (standingSupport ? 7.8 : 4.4) : 2.8,
        spawnSettleActive,
        groundedAfterControl,
        1.2,
      ),
    );
    driveJointToPosition(
      jointRefs.shoulderLeft.current,
      shoulderLeftTarget,
      standingSupport ? 9.2 : 8.4,
      standingSupport ? 2.8 : 2.2,
    );
    driveJointToPosition(
      jointRefs.shoulderRight.current,
      shoulderRightTarget,
      standingSupport ? 9.2 : 8.4,
      standingSupport ? 2.8 : 2.2,
    );
    driveJointToPosition(
      jointRefs.kneeLeft.current,
      kneeLeftTarget,
      scaleBootstrapMotorGain(
        groundedAfterControl ? (standingSupport ? 44 : 22) : 14,
        spawnSettleActive,
        groundedAfterControl,
      ),
      scaleBootstrapMotorGain(
        groundedAfterControl ? (standingSupport ? 9.5 : 4.2) : 3,
        spawnSettleActive,
        groundedAfterControl,
        1.2,
      ),
    );
    driveJointToPosition(
      jointRefs.kneeRight.current,
      kneeRightTarget,
      scaleBootstrapMotorGain(
        groundedAfterControl ? (standingSupport ? 44 : 22) : 14,
        spawnSettleActive,
        groundedAfterControl,
      ),
      scaleBootstrapMotorGain(
        groundedAfterControl ? (standingSupport ? 9.5 : 4.2) : 3,
        spawnSettleActive,
        groundedAfterControl,
        1.2,
      ),
    );
    driveJointToPosition(
      jointRefs.ankleLeft.current,
      ankleLeftTarget,
      scaleBootstrapMotorGain(
        groundedAfterControl ? (standingSupport ? 28 : 15) : 9,
        spawnSettleActive,
        groundedAfterControl,
      ),
      scaleBootstrapMotorGain(
        groundedAfterControl ? (standingSupport ? 6.8 : 3.1) : 2.3,
        spawnSettleActive,
        groundedAfterControl,
        1.2,
      ),
    );
    driveJointToPosition(
      jointRefs.ankleRight.current,
      ankleRightTarget,
      scaleBootstrapMotorGain(
        groundedAfterControl ? (standingSupport ? 28 : 15) : 9,
        spawnSettleActive,
        groundedAfterControl,
      ),
      scaleBootstrapMotorGain(
        groundedAfterControl ? (standingSupport ? 6.8 : 3.1) : 2.3,
        spawnSettleActive,
        groundedAfterControl,
        1.2,
      ),
    );
    driveJointToPosition(
      jointRefs.elbowLeft.current,
      elbowLeftTarget,
      standingSupport ? 5.8 : 5.2,
      standingSupport ? 2.2 : 1.8,
    );
    driveJointToPosition(
      jointRefs.elbowRight.current,
      elbowRightTarget,
      standingSupport ? 5.8 : 5.2,
      standingSupport ? 2.2 : 1.8,
    );
    driveJointToPosition(
      jointRefs.wristLeft.current,
      wristLeftTarget,
      3.8,
      1.4,
    );
    driveJointToPosition(
      jointRefs.wristRight.current,
      wristRightTarget,
      3.8,
      1.4,
    );

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

    const snapshot: CharacterCtrlrPlayerSnapshot = {
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
    setPlayerSnapshot(snapshot);
    onSnapshotChange?.(snapshot);
    if (jumpTriggered) {
      onJump?.(snapshot);
    }
    if (previousSnapshot && !previousSnapshot.grounded && groundedAfterControl) {
      onLand?.(snapshot);
    }
    lastSnapshotRef.current = snapshot;
    const nextBalanceState =
      recoveryState.mode === "stable"
        ? deriveBalanceState(
            groundedAfterControl,
            supportStateAfterJump,
            supportLateralError,
            supportForwardError,
            supportHeightError,
          )
        : recoveryState.mode === "jumping"
          ? "unsupported"
          : "recovering";
    locomotionDebugRef.current = buildLocomotionDebugState({
      movementMode: nextMovementMode,
      gaitPhase: gaitState.phase,
      gaitTransitionReason: gaitState.transitionReason,
      balanceState: nextBalanceState,
      recoveryState: recoveryState.mode,
      jointCalibrationReady: jointCalibrationReadyRef.current,
      supportState: supportStateAfterJump,
      stanceFoot: plannedSupportSide,
      plannedSupportSide,
      swingSide,
      grounded: groundedAfterControl,
      standingSupport,
      turnInPlaceRequested,
      hasMovementInput,
      gaitPhaseValue,
      gaitPhaseElapsed: gaitState.phaseElapsed,
      gaitPhaseDuration: gaitState.phaseDuration,
      gaitTransitionCount: gaitState.transitionCount,
      gaitEffort,
      commandEffort,
      speedRatio,
      horizontalSpeed,
      leftSupportContacts: contactState.leftSupportContacts.size,
      rightSupportContacts: contactState.rightSupportContacts.size,
      leftSupportContactLifetime:
        contactState.leftSupportContacts.size > 0
          ? Math.max(0, (debugNow - contactState.contactTimestamps.left) / 1000)
          : 0,
      rightSupportContactLifetime:
        contactState.rightSupportContacts.size > 0
          ? Math.max(0, (debugNow - contactState.contactTimestamps.right) / 1000)
          : 0,
      supportLateralError,
      supportForwardError,
      supportHeightError,
      centerOfMass: [
        centerOfMassPosition.x,
        centerOfMassPosition.y,
        centerOfMassPosition.z,
      ],
      centerOfMassVelocity: [
        centerOfMassVelocity.x,
        centerOfMassVelocity.y,
        centerOfMassVelocity.z,
      ],
      supportReference: [supportCenter.x, supportCenter.y, supportCenter.z],
      supportCenter: [supportCenter.x, supportCenter.y, supportCenter.z],
      capturePoint: [
        capturePointPosition.x,
        capturePointPosition.y,
        capturePointPosition.z,
      ],
      captureTime,
      captureLateralError,
      captureForwardError,
      plannedFootfall: [
        plannedFootfallPosition.x,
        plannedFootfallPosition.y,
        plannedFootfallPosition.z,
      ],
      stepLengthTarget,
      stepWidthTarget,
      stepHeightTarget,
      legJointAngles: liveLegJointAngles,
      legJointTargets: {
        hipLeft: hipLeftTarget,
        hipRight: hipRightTarget,
        kneeLeft: kneeLeftTarget,
        kneeRight: kneeRightTarget,
        ankleLeft: ankleLeftTarget,
        ankleRight: ankleRightTarget,
      },
      footfallForwardError,
      footfallLateralError,
      yawError,
      captureUrgency,
      recentTransitions: transitionHistoryRef.current,
    });

    const locomotionDebugState = locomotionDebugRef.current;

    if (debug) {
      if (typeof window !== "undefined") {
        (
          window as typeof window & {
            __characterCtrlrActiveRagdollDebug?: unknown;
          }
        ).__characterCtrlrActiveRagdollDebug = {
          ...locomotionDebugState,
          jointCalibrationReady: jointCalibrationReadyRef.current,
          jointCalibration: jointCalibrationRef.current,
          legJointAngles: liveLegJointAngles,
          supportErrors: {
            lateral: supportLateralError,
            forward: supportForwardError,
            height: supportHeightError,
          },
          captureErrors: {
            lateral: captureLateralError,
            forward: captureForwardError,
            urgency: captureUrgency,
          },
          centerOfMass: {
            x: centerOfMassPosition.x,
            y: centerOfMassPosition.y,
            z: centerOfMassPosition.z,
          },
          supportCenter: {
            x: supportCenter.x,
            y: supportCenter.y,
            z: supportCenter.z,
          },
        };
      }

      debugLogCooldownRef.current -= delta;

      if (debugLogCooldownRef.current <= 0) {
        debugLogCooldownRef.current = 0.4;
        console.log("[CharacterCtrlrActiveRagdollPlayer]", {
          ...locomotionDebugState,
          jointCalibrationReady: jointCalibrationReadyRef.current,
          jointCalibration: jointCalibrationRef.current,
          legJointAngles: liveLegJointAngles,
          supportErrors: {
            lateral: supportLateralError,
            forward: supportForwardError,
            height: supportHeightError,
          },
          captureErrors: {
            lateral: captureLateralError,
            forward: captureForwardError,
            urgency: captureUrgency,
          },
          centerOfMass: {
            x: centerOfMassPosition.x,
            y: centerOfMassPosition.y,
            z: centerOfMassPosition.z,
          },
          supportCenter: {
            x: supportCenter.x,
            y: supportCenter.y,
            z: supportCenter.z,
          },
        });
      }
    }
  });

  const articulatedBodyProps: Partial<
    Record<
      CharacterCtrlrHumanoidBodyKey,
      {
        additionalSolverIterations?: number;
        angularDamping?: number;
        enabledRotations?: [boolean, boolean, boolean];
        linearDamping?: number;
        onCollisionEnter?: (payload: CollisionEnterPayload) => void;
        onCollisionExit?: (payload: CollisionExitPayload) => void;
      }
    >
  > = {
    pelvis: {
      additionalSolverIterations: 24,
      angularDamping: 7.2,
      enabledRotations: [false, true, false],
      linearDamping: 3.1,
    },
    chest: {
      additionalSolverIterations: 22,
      angularDamping: 7,
      enabledRotations: [false, true, false],
      linearDamping: 2.8,
    },
    head: {
      additionalSolverIterations: 18,
      angularDamping: 9.2,
      linearDamping: 2.6,
    },
    upperArmLeft: {
      angularDamping: 6.8,
      linearDamping: 2.1,
    },
    lowerArmLeft: {
      angularDamping: 6.6,
      linearDamping: 1.8,
    },
    handLeft: {
      angularDamping: 7.2,
      linearDamping: 2,
    },
    upperArmRight: {
      angularDamping: 6.8,
      linearDamping: 2.1,
    },
    lowerArmRight: {
      angularDamping: 6.6,
      linearDamping: 1.8,
    },
    handRight: {
      angularDamping: 7.2,
      linearDamping: 2,
    },
    upperLegLeft: {
      angularDamping: 6.2,
      enabledRotations: [true, false, false],
    },
    lowerLegLeft: {
      angularDamping: 6.4,
      enabledRotations: [true, false, false],
    },
    footLeft: {
      angularDamping: 6.8,
      enabledRotations: [true, false, false],
      onCollisionEnter: createGroundContactEnterHandler("left"),
      onCollisionExit: createGroundContactExitHandler("left"),
    },
    upperLegRight: {
      angularDamping: 6.2,
      enabledRotations: [true, false, false],
    },
    lowerLegRight: {
      angularDamping: 6.4,
      enabledRotations: [true, false, false],
    },
    footRight: {
      angularDamping: 6.8,
      enabledRotations: [true, false, false],
      onCollisionEnter: createGroundContactEnterHandler("right"),
      onCollisionExit: createGroundContactExitHandler("right"),
    },
  };

  return (
    <>
      {MIXAMO_CONTROL_ENABLED && mixamoSource ? (
        <CharacterCtrlrMixamoMotionDriver
          groundedRef={groundedRef}
          hasMovementInputRef={hasMovementInputRef}
          movementModeRef={movementModeRef}
          poseRef={mixamoPoseRef}
          source={mixamoSource}
        />
      ) : null}
      <CharacterCtrlrHumanoidRagdoll
        bodyProps={articulatedBodyProps}
        bodyRefs={bodyRefs}
        debug={debug}
        ignoreCameraOcclusion
        locomotionDebugRef={locomotionDebugRef}
        position={position}
        revoluteJointRefs={jointRefs}
        sharedBodyProps={{
          additionalSolverIterations: 16,
          angularDamping: 5.2,
          canSleep: false,
          ccd: true,
          linearDamping: 2.4,
          softCcdPrediction: 0.25,
        }}
      />
    </>
  );
}
