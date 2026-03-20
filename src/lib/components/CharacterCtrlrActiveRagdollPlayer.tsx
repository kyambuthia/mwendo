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
import type { RevoluteImpulseJoint } from "@dimforge/rapier3d-compat";
import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import { useCharacterCtrlrStore, useCharacterCtrlrStoreApi } from "../CharacterCtrlrProvider";
import { useCharacterCtrlrKeyboardInput } from "../useCharacterCtrlrKeyboardInput";
import {
  DEFAULT_CHARACTER_CTRLR_INPUT,
  type CharacterCtrlrBalanceState,
  type CharacterCtrlrGaitPhase,
  type CharacterCtrlrGaitTransitionReason,
  mergeCharacterCtrlrInput,
  type CharacterCtrlrInputState,
  type CharacterCtrlrLocomotionDebugState,
  type CharacterCtrlrMovementMode,
  type CharacterCtrlrPlayerSnapshot,
  type CharacterCtrlrSupportState,
  type CharacterCtrlrVec3,
} from "../types";
import {
  createCharacterCtrlrHumanoidBodyRefs,
  createCharacterCtrlrHumanoidRevoluteJointRefs,
  type CharacterCtrlrHumanoidBodyKey,
  type CharacterCtrlrHumanoidRevoluteJointRefs,
} from "./CharacterCtrlrHumanoidData";
import { CharacterCtrlrHumanoidRagdoll } from "./CharacterCtrlrHumanoidRagdoll";

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
const centerOfMassPosition = new Vector3();
const centerOfMassVelocity = new Vector3();
const capturePointPosition = new Vector3();
const plannedFootfallPosition = new Vector3();
const tempMassPosition = new Vector3();
const tempMassVelocity = new Vector3();

const GRAVITY = 9.81;

type SupportSide = "left" | "right";

type PhaseLimbPoseTargets = {
  hip: number;
  knee: number;
  ankle: number;
  shoulder: number;
  elbow: number;
  wrist: number;
};

type PhasePoseTargets = {
  pelvisPitch: number;
  pelvisRoll: number;
  chestPitch: number;
  chestRoll: number;
  left: PhaseLimbPoseTargets;
  right: PhaseLimbPoseTargets;
};

type CharacterCtrlrGaitConfig = {
  commandEffort: number;
  postureAmount: number;
  cadenceRange: [number, number];
  phaseDurations: {
    doubleSupport: [number, number];
    stance: [number, number];
    airborne: number;
  };
  step: {
    length: [number, number];
    width: [number, number];
    height: [number, number];
    pelvisLeadScale: [number, number];
    pelvisHeight: [number, number];
  };
  support: {
    centering: {
      double: number;
      single: number;
    };
    forwarding: {
      double: [number, number];
      single: [number, number];
    };
    captureFeedback: {
      lateral: [number, number];
      forward: [number, number];
      swingLateral: [number, number];
      swingForward: [number, number];
    };
    phaseCompression: number;
  };
  swing: {
    placement: {
      double: [number, number];
      single: [number, number];
    };
    drive: [number, number];
    heightDrive: [number, number];
  };
  pose: {
    baseHip: [number, number];
    baseKnee: [number, number];
    baseAnkle: [number, number];
    baseShoulder: [number, number];
    baseElbow: [number, number];
    pelvisPitch: [number, number];
    chestPitch: [number, number];
    doubleSupportCompression: [number, number];
    doubleSupportArmCounter: [number, number];
    swingReach: [number, number];
    stanceDrive: [number, number];
    pelvisLean: [number, number];
    pelvisRoll: [number, number];
    shoulderDrive: [number, number];
    elbowDrive: [number, number];
    swingKnee: [number, number];
    swingAnkle: [number, number];
  };
};

const GAIT_CONFIGS: Record<
  "idle" | "walk" | "run" | "crouch",
  CharacterCtrlrGaitConfig
> = {
  idle: {
    commandEffort: 0,
    postureAmount: 0,
    cadenceRange: [0, 0],
    phaseDurations: {
      doubleSupport: [0.22, 0.22],
      stance: [0.46, 0.46],
      airborne: 0.12,
    },
    step: {
      length: [0, 0],
      width: [0.2, 0.2],
      height: [0.02, 0.02],
      pelvisLeadScale: [0, 0],
      pelvisHeight: [1.34, 1.34],
    },
    support: {
      centering: { double: 3.2, single: 5.4 },
      forwarding: {
        double: [1.6, 1.6],
        single: [3.1, 3.1],
      },
      captureFeedback: {
        lateral: [0.45, 0.45],
        forward: [0.5, 0.5],
        swingLateral: [0.22, 0.22],
        swingForward: [0.35, 0.35],
      },
      phaseCompression: 0.72,
    },
    swing: {
      placement: {
        double: [4.8, 4.8],
        single: [3.8, 3.8],
      },
      drive: [0.38, 0.38],
      heightDrive: [12, 12],
    },
    pose: {
      baseHip: [0.02, 0.02],
      baseKnee: [-0.08, -0.08],
      baseAnkle: [0.08, 0.08],
      baseShoulder: [0.1, 0.1],
      baseElbow: [-0.34, -0.34],
      pelvisPitch: [-0.01, -0.01],
      chestPitch: [0.03, 0.03],
      doubleSupportCompression: [0.04, 0.04],
      doubleSupportArmCounter: [0.04, 0.04],
      swingReach: [-0.12, 0.2],
      stanceDrive: [0.08, 0.08],
      pelvisLean: [0.03, 0.03],
      pelvisRoll: [0.03, 0.03],
      shoulderDrive: [0.16, 0.16],
      elbowDrive: [0.04, 0.04],
      swingKnee: [0.18, 0.18],
      swingAnkle: [0.08, 0.08],
    },
  },
  walk: {
    commandEffort: 0.6,
    postureAmount: 0,
    cadenceRange: [2.8, 5.2],
    phaseDurations: {
      doubleSupport: [0.22, 0.12],
      stance: [0.46, 0.28],
      airborne: 0.12,
    },
    step: {
      length: [0.22, 0.54],
      width: [0.2, 0.24],
      height: [0.08, 0.2],
      pelvisLeadScale: [0.32, 0.44],
      pelvisHeight: [1.34, 1.08],
    },
    support: {
      centering: { double: 3.2, single: 5.4 },
      forwarding: {
        double: [1.6, 2.6],
        single: [3.1, 4.4],
      },
      captureFeedback: {
        lateral: [0.45, 0.8],
        forward: [0.5, 0.92],
        swingLateral: [0.22, 0.42],
        swingForward: [0.35, 0.65],
      },
      phaseCompression: 0.72,
    },
    swing: {
      placement: {
        double: [4.8, 7.4],
        single: [3.8, 5.8],
      },
      drive: [0.38, 0.62],
      heightDrive: [12, 18],
    },
    pose: {
      baseHip: [0.02, -0.22],
      baseKnee: [-0.08, -0.68],
      baseAnkle: [0.08, -0.08],
      baseShoulder: [0.1, 0.2],
      baseElbow: [-0.34, -0.48],
      pelvisPitch: [-0.01, -0.08],
      chestPitch: [0.03, 0.14],
      doubleSupportCompression: [0.04, 0.14],
      doubleSupportArmCounter: [0.04, 0.12],
      swingReach: [-0.12, 0.34],
      stanceDrive: [0.08, 0.18],
      pelvisLean: [0.03, 0.11],
      pelvisRoll: [0.03, 0.09],
      shoulderDrive: [0.16, 0.4],
      elbowDrive: [0.04, 0.18],
      swingKnee: [0.18, 0.48],
      swingAnkle: [0.08, 0.22],
    },
  },
  run: {
    commandEffort: 0.94,
    postureAmount: 0.12,
    cadenceRange: [4.6, 6.8],
    phaseDurations: {
      doubleSupport: [0.16, 0.08],
      stance: [0.34, 0.2],
      airborne: 0.14,
    },
    step: {
      length: [0.34, 0.72],
      width: [0.16, 0.18],
      height: [0.12, 0.26],
      pelvisLeadScale: [0.38, 0.52],
      pelvisHeight: [1.32, 1.06],
    },
    support: {
      centering: { double: 3.5, single: 5.8 },
      forwarding: {
        double: [2.1, 3.2],
        single: [3.8, 5.1],
      },
      captureFeedback: {
        lateral: [0.55, 0.95],
        forward: [0.62, 1.1],
        swingLateral: [0.28, 0.48],
        swingForward: [0.45, 0.82],
      },
      phaseCompression: 0.66,
    },
    swing: {
      placement: {
        double: [5.8, 8.8],
        single: [4.4, 6.8],
      },
      drive: [0.52, 0.82],
      heightDrive: [14, 22],
    },
    pose: {
      baseHip: [0, -0.18],
      baseKnee: [-0.12, -0.42],
      baseAnkle: [0.04, -0.06],
      baseShoulder: [0.12, 0.18],
      baseElbow: [-0.32, -0.46],
      pelvisPitch: [-0.03, -0.1],
      chestPitch: [0.04, 0.16],
      doubleSupportCompression: [0.06, 0.12],
      doubleSupportArmCounter: [0.08, 0.18],
      swingReach: [-0.08, 0.48],
      stanceDrive: [0.12, 0.24],
      pelvisLean: [0.06, 0.14],
      pelvisRoll: [0.04, 0.1],
      shoulderDrive: [0.28, 0.56],
      elbowDrive: [0.08, 0.22],
      swingKnee: [0.28, 0.58],
      swingAnkle: [0.14, 0.26],
    },
  },
  crouch: {
    commandEffort: 0.32,
    postureAmount: 1,
    cadenceRange: [2.1, 4],
    phaseDurations: {
      doubleSupport: [0.26, 0.16],
      stance: [0.52, 0.34],
      airborne: 0.12,
    },
    step: {
      length: [0.12, 0.28],
      width: [0.24, 0.28],
      height: [0.06, 0.14],
      pelvisLeadScale: [0.24, 0.34],
      pelvisHeight: [1.16, 1.02],
    },
    support: {
      centering: { double: 3.6, single: 5.9 },
      forwarding: {
        double: [1.4, 2.1],
        single: [2.6, 3.6],
      },
      captureFeedback: {
        lateral: [0.38, 0.66],
        forward: [0.42, 0.74],
        swingLateral: [0.18, 0.3],
        swingForward: [0.24, 0.46],
      },
      phaseCompression: 0.78,
    },
    swing: {
      placement: {
        double: [4.4, 6.2],
        single: [3.4, 4.8],
      },
      drive: [0.28, 0.5],
      heightDrive: [10, 14],
    },
    pose: {
      baseHip: [0.02, -0.22],
      baseKnee: [-0.08, -0.68],
      baseAnkle: [0.08, -0.08],
      baseShoulder: [0.1, 0.2],
      baseElbow: [-0.34, -0.48],
      pelvisPitch: [-0.01, -0.08],
      chestPitch: [0.03, 0.14],
      doubleSupportCompression: [0.06, 0.18],
      doubleSupportArmCounter: [0.02, 0.08],
      swingReach: [-0.08, 0.18],
      stanceDrive: [0.12, 0.22],
      pelvisLean: [0.02, 0.08],
      pelvisRoll: [0.02, 0.06],
      shoulderDrive: [0.08, 0.22],
      elbowDrive: [0.03, 0.12],
      swingKnee: [0.24, 0.54],
      swingAnkle: [0.1, 0.18],
    },
  },
};

export type CharacterCtrlrActiveRagdollPlayerProps = {
  position?: CharacterCtrlrVec3;
  controls?: "keyboard" | "none";
  input?: Partial<CharacterCtrlrInputState>;
  inputRef?: RefObject<CharacterCtrlrInputState | null>;
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

function angleDifference(current: number, target: number) {
  return Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
}

function deriveSupportState(
  leftContactCount: number,
  rightContactCount: number,
): CharacterCtrlrSupportState {
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

function driveJointToPosition(
  joint: RevoluteImpulseJoint | null,
  targetPosition: number,
  stiffness: number,
  damping: number,
) {
  if (!joint?.isValid()) {
    return;
  }

  joint.configureMotorPosition(targetPosition, stiffness, damping);
}

function getGaitConfig(
  locomotionMode: CharacterCtrlrMovementMode,
): CharacterCtrlrGaitConfig {
  switch (locomotionMode) {
    case "run":
      return GAIT_CONFIGS.run;
    case "walk":
      return GAIT_CONFIGS.walk;
    case "crouch":
      return GAIT_CONFIGS.crouch;
    case "idle":
    case "jump":
    case "fall":
    default:
      return GAIT_CONFIGS.idle;
  }
}

function deriveGaitPhaseDuration(
  gaitPhase: CharacterCtrlrGaitPhase,
  gaitEffort: number,
  gaitConfig: CharacterCtrlrGaitConfig,
) {
  switch (gaitPhase) {
    case "double-support":
      return MathUtils.lerp(
        gaitConfig.phaseDurations.doubleSupport[0],
        gaitConfig.phaseDurations.doubleSupport[1],
        gaitEffort,
      );
    case "left-stance":
    case "right-stance":
      return MathUtils.lerp(
        gaitConfig.phaseDurations.stance[0],
        gaitConfig.phaseDurations.stance[1],
        gaitEffort,
      );
    case "airborne":
      return gaitConfig.phaseDurations.airborne;
    case "idle":
    default:
      return 0;
  }
}

function deriveBalanceState(
  grounded: boolean,
  supportState: CharacterCtrlrSupportState,
  supportLateralError: number,
  supportForwardError: number,
  supportHeightError: number,
): CharacterCtrlrBalanceState {
  if (!grounded || supportState === "none") {
    return "unsupported";
  }

  const supportError = Math.max(
    Math.abs(supportLateralError),
    Math.abs(supportForwardError),
    Math.abs(supportHeightError),
  );

  return supportError > 0.22 ? "recovering" : "balanced";
}

function buildBaseLimbPoseTargets(
  grounded: boolean,
  gaitConfig: CharacterCtrlrGaitConfig,
) {
  const postureAmount = gaitConfig.postureAmount;
  const hip = grounded
    ? MathUtils.lerp(gaitConfig.pose.baseHip[0], gaitConfig.pose.baseHip[1], postureAmount)
    : -0.08;
  const knee = MathUtils.lerp(
    gaitConfig.pose.baseKnee[0],
    gaitConfig.pose.baseKnee[1],
    postureAmount,
  );
  const ankle = MathUtils.lerp(
    gaitConfig.pose.baseAnkle[0],
    gaitConfig.pose.baseAnkle[1],
    postureAmount,
  );
  const shoulder = grounded
    ? MathUtils.lerp(
        gaitConfig.pose.baseShoulder[0],
        gaitConfig.pose.baseShoulder[1],
        postureAmount,
      )
    : 0.16;
  const elbow = grounded
    ? MathUtils.lerp(
        gaitConfig.pose.baseElbow[0],
        gaitConfig.pose.baseElbow[1],
        postureAmount,
      )
    : -0.42;
  const wrist = grounded ? 0 : -0.05;

  return { hip, knee, ankle, shoulder, elbow, wrist };
}

function derivePhasePoseTargets(params: {
  gaitPhase: CharacterCtrlrGaitPhase;
  gaitPhaseValue: number;
  gaitEffort: number;
  gaitConfig: CharacterCtrlrGaitConfig;
  grounded: boolean;
}): PhasePoseTargets {
  const {
    gaitPhase,
    gaitPhaseValue,
    gaitEffort,
    gaitConfig,
    grounded,
  } = params;
  const base = buildBaseLimbPoseTargets(grounded, gaitConfig);
  const targets: PhasePoseTargets = {
    pelvisPitch: grounded
      ? MathUtils.lerp(
          gaitConfig.pose.pelvisPitch[0],
          gaitConfig.pose.pelvisPitch[1],
          gaitConfig.postureAmount,
        )
      : -0.06,
    pelvisRoll: 0,
    chestPitch: grounded
      ? MathUtils.lerp(
          gaitConfig.pose.chestPitch[0],
          gaitConfig.pose.chestPitch[1],
          gaitConfig.postureAmount,
        )
      : 0.08,
    chestRoll: 0,
    left: { ...base },
    right: { ...base },
  };

  if (!grounded || gaitPhase === "airborne") {
    targets.left.hip = -0.12;
    targets.right.hip = -0.12;
    targets.left.knee = -0.52;
    targets.right.knee = -0.52;
    targets.left.ankle = -0.12;
    targets.right.ankle = -0.12;
    targets.left.shoulder = 0.22;
    targets.right.shoulder = 0.22;
    return targets;
  }

  if (gaitPhase === "idle") {
    return targets;
  }

  if (gaitPhase === "double-support") {
    const supportCompression = MathUtils.lerp(
      gaitConfig.pose.doubleSupportCompression[0],
      gaitConfig.pose.doubleSupportCompression[1],
      gaitEffort,
    );
    const armCounter = MathUtils.lerp(
      gaitConfig.pose.doubleSupportArmCounter[0],
      gaitConfig.pose.doubleSupportArmCounter[1],
      gaitEffort,
    )
      * Math.sin(gaitPhaseValue * Math.PI);
    targets.pelvisPitch -= supportCompression * 0.45;
    targets.chestPitch += supportCompression * 0.3;
    targets.left.hip -= supportCompression;
    targets.right.hip -= supportCompression;
    targets.left.knee -= supportCompression * 0.55;
    targets.right.knee -= supportCompression * 0.55;
    targets.left.ankle += supportCompression * 0.4;
    targets.right.ankle += supportCompression * 0.4;
    targets.left.shoulder += armCounter;
    targets.right.shoulder -= armCounter;
    targets.left.elbow += armCounter * 0.35;
    targets.right.elbow -= armCounter * 0.35;
    return targets;
  }

  const stanceSide: SupportSide =
    gaitPhase === "left-stance" ? "left" : "right";
  const swingSide: SupportSide = stanceSide === "left" ? "right" : "left";
  const swingLift = Math.sin(gaitPhaseValue * Math.PI);
  const swingReach = MathUtils.lerp(
    gaitConfig.pose.swingReach[0],
    gaitConfig.pose.swingReach[1],
    gaitPhaseValue,
  ) * gaitEffort;
  const stanceDrive = MathUtils.lerp(
    gaitConfig.pose.stanceDrive[0],
    gaitConfig.pose.stanceDrive[1],
    gaitEffort,
  );
  const pelvisLean = MathUtils.lerp(
    gaitConfig.pose.pelvisLean[0],
    gaitConfig.pose.pelvisLean[1],
    gaitEffort,
  );
  const pelvisRoll = (stanceSide === "left" ? -1 : 1)
    * MathUtils.lerp(
      gaitConfig.pose.pelvisRoll[0],
      gaitConfig.pose.pelvisRoll[1],
      gaitEffort,
    );
  const shoulderDrive = MathUtils.lerp(
    gaitConfig.pose.shoulderDrive[0],
    gaitConfig.pose.shoulderDrive[1],
    gaitEffort,
  );
  const elbowDrive = MathUtils.lerp(
    gaitConfig.pose.elbowDrive[0],
    gaitConfig.pose.elbowDrive[1],
    gaitEffort,
  ) * swingLift;

  targets.pelvisPitch -= pelvisLean;
  targets.pelvisRoll = pelvisRoll;
  targets.chestPitch += pelvisLean * 0.7;
  targets.chestRoll = -pelvisRoll * 0.6;

  targets[stanceSide].hip -= stanceDrive;
  targets[stanceSide].knee -= stanceDrive * 0.5;
  targets[stanceSide].ankle += stanceDrive * 0.42;

  targets[swingSide].hip += swingReach;
  targets[swingSide].knee -= MathUtils.lerp(
    gaitConfig.pose.swingKnee[0],
    gaitConfig.pose.swingKnee[1],
    gaitEffort,
  ) * swingLift;
  targets[swingSide].ankle -= MathUtils.lerp(
    gaitConfig.pose.swingAnkle[0],
    gaitConfig.pose.swingAnkle[1],
    gaitEffort,
  ) * swingLift;

  targets[stanceSide].shoulder += shoulderDrive;
  targets[swingSide].shoulder -= shoulderDrive;
  targets[stanceSide].elbow += elbowDrive * 0.7;
  targets[swingSide].elbow -= elbowDrive;

  return targets;
}

type GaitState = {
  phase: CharacterCtrlrGaitPhase;
  phaseElapsed: number;
  phaseDuration: number;
  transitionReason: CharacterCtrlrGaitTransitionReason;
  transitionCount: number;
  lastStanceSide: SupportSide;
};

function transitionGaitState(
  gaitState: GaitState,
  nextPhase: CharacterCtrlrGaitPhase,
  nextDuration: number,
  reason: CharacterCtrlrGaitTransitionReason,
) {
  if (gaitState.phase !== nextPhase) {
    gaitState.phase = nextPhase;
    gaitState.phaseElapsed = 0;
    gaitState.transitionReason = reason;
    gaitState.transitionCount += 1;
  }

  gaitState.phaseDuration = nextDuration;

  if (nextPhase === "left-stance") {
    gaitState.lastStanceSide = "left";
  } else if (nextPhase === "right-stance") {
    gaitState.lastStanceSide = "right";
  }
}

export function CharacterCtrlrActiveRagdollPlayer({
  position = [0, 2.5, 6],
  controls = "keyboard",
  input,
  inputRef,
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
  const storeApi = useCharacterCtrlrStoreApi();
  const setPlayerSnapshot = useCharacterCtrlrStore((state) => state.setPlayerSnapshot);
  const bodyRefs = useMemo(() => createCharacterCtrlrHumanoidBodyRefs(), []);
  const bodyRefList = useMemo(() => Object.values(bodyRefs), [bodyRefs]);
  const jointRefs = useMemo(() => createCharacterCtrlrHumanoidRevoluteJointRefs(), []);
  const keyboardInputRef = useCharacterCtrlrKeyboardInput(controls === "keyboard");
  const idleInputRef = useRef<CharacterCtrlrInputState | null>({ ...DEFAULT_CHARACTER_CTRLR_INPUT });
  const groundedRef = useRef(false);
  const leftSupportContactsRef = useRef<Map<number, number>>(new Map());
  const rightSupportContactsRef = useRef<Map<number, number>>(new Map());
  const supportStateRef = useRef<CharacterCtrlrSupportState>("none");
  const movementModeRef = useRef<CharacterCtrlrMovementMode>("idle");
  const jumpHeldRef = useRef(false);
  const gaitPhaseRef = useRef(0);
  const gaitStateRef = useRef<GaitState>({
    phase: "idle",
    phaseElapsed: 0,
    phaseDuration: 0,
    transitionReason: "initial",
    transitionCount: 0,
    lastStanceSide: "right",
  });
  const lastSnapshotRef = useRef<CharacterCtrlrPlayerSnapshot | null>(null);
  const focusPositionRef = useRef<CharacterCtrlrVec3 | null>(null);
  const locomotionDebugRef = useRef<CharacterCtrlrLocomotionDebugState | null>(null);
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
      const supportY = payload.flipped ? -normal.y : normal.y;

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
    const leftFoot = bodyRefs.footLeft.current;
    const rightFoot = bodyRefs.footRight.current;

    if (!pelvis || !chest || !leftFoot || !rightFoot) {
      return;
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
    const gaitConfig = getGaitConfig(locomotionMode);
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
    const commandEffort = hasMovementInput ? gaitConfig.commandEffort : 0;
    const gaitEffort =
      grounded && hasMovementInput ? Math.max(speedRatio, commandEffort) : speedRatio;
    const postureAmount = gaitConfig.postureAmount;
    const airborneAmount = grounded ? 0 : 1;
    const gaitState = gaitStateRef.current;
    gaitState.phaseElapsed += delta;
    const cadence = MathUtils.lerp(
      gaitConfig.cadenceRange[0],
      gaitConfig.cadenceRange[1],
      gaitEffort,
    );
    if (grounded && hasMovementInput) {
      gaitPhaseRef.current += delta * cadence;
    }

    const supportStateForPhase = supportStateAfterJump;
    if (!grounded || supportStateForPhase === "none") {
      transitionGaitState(
        gaitState,
        "airborne",
        deriveGaitPhaseDuration("airborne", gaitEffort, gaitConfig),
        jumpTriggered ? "jump" : "support-lost",
      );
    } else if (!hasMovementInput) {
      transitionGaitState(gaitState, "idle", 0, "idle-no-input");
    } else if (supportStateForPhase === "left") {
      transitionGaitState(
        gaitState,
        "left-stance",
        deriveGaitPhaseDuration("left-stance", gaitEffort, gaitConfig),
        "left-foot-support",
      );
    } else if (supportStateForPhase === "right") {
      transitionGaitState(
        gaitState,
        "right-stance",
        deriveGaitPhaseDuration("right-stance", gaitEffort, gaitConfig),
        "right-foot-support",
      );
    } else if (gaitState.phase === "airborne") {
      transitionGaitState(
        gaitState,
        "double-support",
        deriveGaitPhaseDuration("double-support", gaitEffort, gaitConfig),
        "landing-support",
      );
    } else if (gaitState.phase === "idle") {
      transitionGaitState(
        gaitState,
        "double-support",
        deriveGaitPhaseDuration("double-support", gaitEffort, gaitConfig),
        "movement-start",
      );
    } else if (
      gaitState.phase === "double-support"
      && gaitState.phaseDuration > 0
      && gaitState.phaseElapsed >= gaitState.phaseDuration
    ) {
      const nextStanceSide: SupportSide =
        gaitState.lastStanceSide === "left" ? "right" : "left";
      transitionGaitState(
        gaitState,
        nextStanceSide === "left" ? "left-stance" : "right-stance",
        deriveGaitPhaseDuration(
          nextStanceSide === "left" ? "left-stance" : "right-stance",
          gaitEffort,
          gaitConfig,
        ),
        "double-support-timeout",
      );
    } else if (
      (gaitState.phase === "left-stance" || gaitState.phase === "right-stance")
      && gaitState.phaseDuration > 0
      && gaitState.phaseElapsed >= gaitState.phaseDuration
      && supportStateForPhase === "double"
    ) {
      transitionGaitState(
        gaitState,
        "double-support",
        deriveGaitPhaseDuration("double-support", gaitEffort, gaitConfig),
        "stance-timeout",
      );
    } else {
      gaitState.phaseDuration = deriveGaitPhaseDuration(
        gaitState.phase,
        gaitEffort,
        gaitConfig,
      );
    }
    const gaitPhaseValue = gaitState.phaseDuration > 0
      ? Math.min(1, gaitState.phaseElapsed / gaitState.phaseDuration)
      : 0;
    const rootPosition = pelvis.translation();
    const chestPosition = chest.translation();
    const predictedVelocityY = jumpTriggered
      ? currentVelocity.y + jumpImpulse
      : currentVelocity.y;
    const groundedAfterControl = groundedRef.current;
    const nextMovementMode: CharacterCtrlrMovementMode = groundedAfterControl
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
    const phasePoseTargets = derivePhasePoseTargets({
      gaitPhase: gaitState.phase,
      gaitPhaseValue,
      gaitEffort,
      gaitConfig,
      grounded: groundedAfterControl,
    });

    pelvis.applyTorqueImpulse(
      {
        x: MathUtils.clamp(
          (
            (phasePoseTargets.pelvisPitch - pelvisEuler.x) * uprightTorque
            - pelvisAngularVelocity.x * balanceDamping
          ) * pelvisTorqueScale * delta,
          -0.45,
          0.45,
        ),
        y: MathUtils.clamp(
          (
            yawError * turnTorque
            - pelvisAngularVelocity.y * (balanceDamping * 0.65)
          ) * pelvisTorqueScale * delta,
          -0.28,
          0.28,
        ),
        z: MathUtils.clamp(
          (
            (phasePoseTargets.pelvisRoll - pelvisEuler.z) * uprightTorque
            - pelvisAngularVelocity.z * balanceDamping
          ) * pelvisTorqueScale * delta,
          -0.45,
          0.45,
        ),
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
        x: MathUtils.clamp(
          (
            (phasePoseTargets.chestPitch - chestEuler.x) * uprightTorque * 0.84
            - chestAngularVelocity.x * balanceDamping
          ) * pelvisTorqueScale * delta,
          -0.32,
          0.32,
        ),
        y: MathUtils.clamp(
          (
            yawError * turnTorque * 0.35
            - chestAngularVelocity.y * (balanceDamping * 0.5)
          ) * pelvisTorqueScale * delta,
          -0.16,
          0.16,
        ),
        z: MathUtils.clamp(
          (
            (phasePoseTargets.chestRoll - chestEuler.z) * uprightTorque * 0.84
            - chestAngularVelocity.z * balanceDamping
          ) * pelvisTorqueScale * delta,
          -0.32,
          0.32,
        ),
      },
      true,
    );

    const plannedSupportSide: SupportSide | null =
      gaitState.phase === "left-stance"
        ? "left"
        : gaitState.phase === "right-stance"
          ? "right"
          : supportStateAfterJump === "left"
            ? "left"
            : supportStateAfterJump === "right"
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
    const stepLengthTarget =
      groundedAfterControl && hasMovementInput
        ? MathUtils.lerp(gaitConfig.step.length[0], gaitConfig.step.length[1], gaitEffort)
        : 0;
    const stepWidthTarget = groundedAfterControl
      ? MathUtils.lerp(gaitConfig.step.width[0], gaitConfig.step.width[1], postureAmount)
      : 0.2;
    const stepHeightTarget =
      groundedAfterControl && hasMovementInput
        ? MathUtils.lerp(gaitConfig.step.height[0], gaitConfig.step.height[1], gaitEffort)
        : 0.02;

    centerOfMassPosition.set(0, 0, 0);
    centerOfMassVelocity.set(0, 0, 0);
    let totalTrackedMass = 0;
    for (const bodyRef of bodyRefList) {
      const body = bodyRef.current;

      if (!body) {
        continue;
      }

      const bodyMass = body.mass();
      if (!Number.isFinite(bodyMass) || bodyMass <= 0) {
        continue;
      }

      const bodyPosition = body.translation();
      const bodyVelocity = body.linvel();
      centerOfMassPosition.add(
        tempMassPosition.set(
          bodyPosition.x,
          bodyPosition.y,
          bodyPosition.z,
        ).multiplyScalar(bodyMass),
      );
      centerOfMassVelocity.add(
        tempMassVelocity.set(
          bodyVelocity.x,
          bodyVelocity.y,
          bodyVelocity.z,
        ).multiplyScalar(bodyMass),
      );
      totalTrackedMass += bodyMass;
    }

    if (totalTrackedMass > 0) {
      centerOfMassPosition.divideScalar(totalTrackedMass);
      centerOfMassVelocity.divideScalar(totalTrackedMass);
    } else {
      centerOfMassPosition.set(rootPosition.x, rootPosition.y, rootPosition.z);
      centerOfMassVelocity.set(
        currentVelocity.x,
        currentVelocity.y,
        currentVelocity.z,
      );
    }

    capturePointPosition.set(
      centerOfMassPosition.x,
      rootPosition.y,
      centerOfMassPosition.z,
    );
    supportCenter.set(rootPosition.x, rootPosition.y, rootPosition.z);
    plannedFootfallPosition.set(rootPosition.x, rootPosition.y, rootPosition.z);

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

        const lateralError =
          (supportCenter.x - rootPosition.x) * facingRight.x
          + (supportCenter.z - rootPosition.z) * facingRight.z;
        const desiredPelvisLead =
          groundedAfterControl && hasMovementInput
            ? stepLengthTarget
              * MathUtils.lerp(
                gaitConfig.step.pelvisLeadScale[0],
                gaitConfig.step.pelvisLeadScale[1],
                gaitEffort,
              )
              * (supportStateAfterJump === "double" ? 0.82 : 1.05)
            : 0;
        const captureHeight = Math.max(0.2, centerOfMassPosition.y - supportCenter.y);
        captureTime = Math.sqrt(captureHeight / GRAVITY);
        capturePointPosition.set(
          centerOfMassPosition.x + centerOfMassVelocity.x * captureTime,
          supportCenter.y,
          centerOfMassPosition.z + centerOfMassVelocity.z * captureTime,
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
        const supportCentering =
          supportStateAfterJump === "double"
            ? gaitConfig.support.centering.double
            : gaitConfig.support.centering.single;
        const supportForwarding =
          supportStateAfterJump === "double"
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
          supportCenter.y + MathUtils.lerp(
            gaitConfig.step.pelvisHeight[0],
            gaitConfig.step.pelvisHeight[1],
            postureAmount,
          );
        const heightError = desiredPelvisHeight - rootPosition.y;
        supportLateralError = lateralError;
        supportForwardError = forwardError;
        supportHeightError = heightError;
        const heightImpulse = MathUtils.clamp(
          (heightError * 9.5 - currentVelocity.y * 1.8) * pelvisMass * delta,
          -0.12,
          0.38,
        );

        supportCorrection
          .copy(facingRight)
          .multiplyScalar(
            correctedLateralError * pelvisMass * supportCentering * delta,
          );
        supportForward
          .copy(facingForward)
          .multiplyScalar(
            correctedForwardError * pelvisMass * supportForwarding * delta,
          );
        supportCorrection.add(supportForward);
        pelvis.applyImpulse(
          {
            x: supportCorrection.x,
            y: heightImpulse,
            z: supportCorrection.z,
          },
          true,
        );
        chest.applyImpulse(
          {
            x: supportCorrection.x * 0.22,
            y: heightImpulse * 0.52,
            z: supportCorrection.z * 0.22,
          },
          true,
        );
      }
    }

    if (
      groundedAfterControl
      && hasMovementInput
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

    if (groundedAfterControl && swingSide && hasMovementInput) {
      const swingFoot = swingSide === "left" ? leftFoot : rightFoot;
      const swingFootPosition = swingFoot.translation();
      const swingVelocity = swingFoot.linvel();
      const swingMass = swingFoot.mass();
      const swingProgress =
        gaitState.phase === "left-stance" || gaitState.phase === "right-stance"
          ? gaitPhaseValue
          : 0.5;
      const clearanceProfile = Math.sin(
        Math.PI * MathUtils.clamp(swingProgress, 0, 1),
      );
      const swingBlend =
        Math.min(1, delta * 5.4)
        * (supportStateAfterJump === "double" ? 1 : 0.68);
      const swingForwardOffset =
        (swingFootPosition.x - rootPosition.x) * facingForward.x
        + (swingFootPosition.z - rootPosition.z) * facingForward.z;
      const swingLateralOffset =
        (swingFootPosition.x - rootPosition.x) * facingRight.x
        + (swingFootPosition.z - rootPosition.z) * facingRight.z;
      const baseSwingForwardOffset =
        MathUtils.lerp(-stepLengthTarget * 0.36, stepLengthTarget * 0.72, swingProgress)
        * (supportStateAfterJump === "double" ? 1.05 : 0.9);
      const baseSwingLateralOffset =
        (swingSide === "left" ? -1 : 1) * stepWidthTarget;
      const desiredSwingForwardOffset =
        baseSwingForwardOffset
        + MathUtils.clamp(
          captureForwardError * MathUtils.lerp(
            gaitConfig.support.captureFeedback.swingForward[0],
            gaitConfig.support.captureFeedback.swingForward[1],
            gaitEffort,
          ),
          -0.12,
          0.26,
        );
      const desiredSwingLateralOffset =
        baseSwingLateralOffset
        + MathUtils.clamp(
          captureLateralError * MathUtils.lerp(
            gaitConfig.support.captureFeedback.swingLateral[0],
            gaitConfig.support.captureFeedback.swingLateral[1],
            gaitEffort,
          ),
          -0.12,
          0.12,
        );
      const desiredSwingHeight =
        supportCenter.y + stepHeightTarget * clearanceProfile;
      const swingPlacementStrength =
        supportStateAfterJump === "double"
          ? MathUtils.lerp(
              gaitConfig.swing.placement.double[0],
              gaitConfig.swing.placement.double[1],
              gaitEffort,
            )
          : MathUtils.lerp(
              gaitConfig.swing.placement.single[0],
              gaitConfig.swing.placement.single[1],
              gaitEffort,
            )
            + captureUrgency * 1.2;
      const swingDrive = MathUtils.lerp(
        gaitConfig.swing.drive[0],
        gaitConfig.swing.drive[1],
        gaitEffort,
      );
      const swingHeightError = desiredSwingHeight - swingFootPosition.y;
      const swingHeightDrive = MathUtils.clamp(
        (
          swingHeightError * MathUtils.lerp(
            gaitConfig.swing.heightDrive[0],
            gaitConfig.swing.heightDrive[1],
            gaitEffort,
          )
          - swingVelocity.y * 1.9
        ) * swingMass * swingBlend,
        0,
        swingMass * (0.45 + stepHeightTarget * 2.6 + captureUrgency * 0.18),
      );

      plannedFootfallPosition.copy(supportCenter);
      plannedFootfallPosition.addScaledVector(facingForward, desiredSwingForwardOffset);
      plannedFootfallPosition.addScaledVector(facingRight, desiredSwingLateralOffset);

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
            (movement.x * speed * swingDrive - swingVelocity.x) * swingMass * swingBlend
            + swingCorrection.x,
          y: swingHeightDrive,
          z:
            (movement.z * speed * swingDrive - swingVelocity.z) * swingMass * swingBlend
            + swingCorrection.z,
        },
        true,
      );
    }

    driveJointToPosition(
      jointRefs.hipLeft.current,
      MathUtils.clamp(phasePoseTargets.left.hip - airborneAmount * 0.04, -0.9, 0.7),
      groundedAfterControl ? 20 : 11,
      groundedAfterControl ? 4.4 : 2.8,
    );
    driveJointToPosition(
      jointRefs.hipRight.current,
      MathUtils.clamp(phasePoseTargets.right.hip - airborneAmount * 0.04, -0.9, 0.7),
      groundedAfterControl ? 20 : 11,
      groundedAfterControl ? 4.4 : 2.8,
    );
    driveJointToPosition(
      jointRefs.shoulderLeft.current,
      MathUtils.clamp(phasePoseTargets.left.shoulder, -1.1, 0.9),
      8.4,
      2.2,
    );
    driveJointToPosition(
      jointRefs.shoulderRight.current,
      MathUtils.clamp(phasePoseTargets.right.shoulder, -1.1, 0.9),
      8.4,
      2.2,
    );
    driveJointToPosition(
      jointRefs.kneeLeft.current,
      phasePoseTargets.left.knee,
      groundedAfterControl ? 22 : 14,
      groundedAfterControl ? 4.2 : 3,
    );
    driveJointToPosition(
      jointRefs.kneeRight.current,
      phasePoseTargets.right.knee,
      groundedAfterControl ? 22 : 14,
      groundedAfterControl ? 4.2 : 3,
    );
    driveJointToPosition(
      jointRefs.ankleLeft.current,
      phasePoseTargets.left.ankle,
      groundedAfterControl ? 15 : 9,
      groundedAfterControl ? 3.1 : 2.3,
    );
    driveJointToPosition(
      jointRefs.ankleRight.current,
      phasePoseTargets.right.ankle,
      groundedAfterControl ? 15 : 9,
      groundedAfterControl ? 3.1 : 2.3,
    );
    driveJointToPosition(
      jointRefs.elbowLeft.current,
      phasePoseTargets.left.elbow,
      5.2,
      1.8,
    );
    driveJointToPosition(
      jointRefs.elbowRight.current,
      phasePoseTargets.right.elbow,
      5.2,
      1.8,
    );
    driveJointToPosition(
      jointRefs.wristLeft.current,
      phasePoseTargets.left.wrist,
      3.8,
      1.4,
    );
    driveJointToPosition(
      jointRefs.wristRight.current,
      phasePoseTargets.right.wrist,
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
    locomotionDebugRef.current = {
      movementMode: nextMovementMode,
      gaitPhase: gaitState.phase,
      gaitTransitionReason: gaitState.transitionReason,
      balanceState: deriveBalanceState(
        groundedAfterControl,
        supportStateAfterJump,
        supportLateralError,
        supportForwardError,
        supportHeightError,
      ),
      supportState: supportStateAfterJump,
      plannedSupportSide,
      swingSide,
      grounded: groundedAfterControl,
      hasMovementInput,
      gaitPhaseValue,
      gaitPhaseElapsed: gaitState.phaseElapsed,
      gaitPhaseDuration: gaitState.phaseDuration,
      gaitTransitionCount: gaitState.transitionCount,
      gaitEffort,
      commandEffort,
      speedRatio,
      horizontalSpeed,
      leftSupportContacts: leftSupportContactsRef.current.size,
      rightSupportContacts: rightSupportContactsRef.current.size,
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
    };
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
  );
}
