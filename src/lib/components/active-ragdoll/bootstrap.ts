import type { CharacterCtrlrSupportState } from "../../types";
import { STAND_BOOTSTRAP_SETTLE_DURATION } from "./config";

export const STAND_BOOTSTRAP_MAX_DURATION = 1.4;
export const BOOTSTRAP_TIMER_DECAY_RATE = 2.5;

export type BootstrapState = {
  stableTimer: number;
  elapsed: number;
};

export function createInitialBootstrapState(): BootstrapState {
  return {
    stableTimer: 0,
    elapsed: 0,
  };
}

export function advanceBootstrapTimer(params: {
  state: BootstrapState;
  delta: number;
  standingAssistRequested: boolean;
  standBootstrapStable: boolean;
}) {
  const {
    state,
    delta,
    standingAssistRequested,
    standBootstrapStable,
  } = params;

  if (!standingAssistRequested) {
    state.stableTimer = 0;
    state.elapsed = 0;
    return;
  }

  state.elapsed += delta;

  if (standBootstrapStable) {
    state.stableTimer = Math.min(
      STAND_BOOTSTRAP_SETTLE_DURATION,
      state.stableTimer + delta,
    );
    return;
  }

  state.stableTimer = Math.max(
    0,
    state.stableTimer - delta * BOOTSTRAP_TIMER_DECAY_RATE,
  );
}

export function deriveSpawnSettleActive(params: {
  jointCalibrationReady: boolean;
  standingAssistRequested: boolean;
  bootstrapState: BootstrapState;
}) {
  const {
    jointCalibrationReady,
    standingAssistRequested,
    bootstrapState,
  } = params;

  if (!jointCalibrationReady) {
    return true;
  }

  if (!standingAssistRequested) {
    return false;
  }

  const stableTimerIncomplete =
    bootstrapState.stableTimer < STAND_BOOTSTRAP_SETTLE_DURATION;
  const withinMaxBootstrap =
    bootstrapState.elapsed < STAND_BOOTSTRAP_MAX_DURATION;

  return stableTimerIncomplete && withinMaxBootstrap;
}

export function deriveBootstrapSupportState(params: {
  spawnSettleActive: boolean;
  contactSupportState: CharacterCtrlrSupportState;
  probedSupportState: CharacterCtrlrSupportState;
}): CharacterCtrlrSupportState {
  const {
    spawnSettleActive,
    contactSupportState,
    probedSupportState,
  } = params;

  if (!spawnSettleActive) {
    return contactSupportState;
  }

  if (contactSupportState === "none" && probedSupportState !== "none") {
    return probedSupportState;
  }

  if (
    probedSupportState === "double"
    && contactSupportState !== "double"
  ) {
    return "double";
  }

  return contactSupportState;
}

export function scaleBootstrapMotorGain(
  baseGain: number,
  spawnSettleActive: boolean,
  grounded: boolean,
  multiplier = 1.35,
) {
  if (!spawnSettleActive || !grounded) {
    return baseGain;
  }

  return baseGain * multiplier;
}

export function shouldSuppressLocomotionDuringBootstrap(spawnSettleActive: boolean) {
  return spawnSettleActive;
}