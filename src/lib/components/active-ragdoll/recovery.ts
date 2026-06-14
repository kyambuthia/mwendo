import { MathUtils } from "three";
import type { RecoveryState } from "./controllerTypes";
import { transitionRecoveryState } from "./gait";

export function deriveRecoverySignals(params: {
  groundedAfterControl: boolean;
  supportState: "none" | "left" | "right" | "double";
  standingSupport: boolean;
  supportHeight: number;
  pelvisTilt: number;
  chestTilt: number;
  captureUrgency: number;
  supportLateralError: number;
  supportForwardError: number;
  captureLateralError: number;
  captureForwardError: number;
}) {
  const {
    groundedAfterControl,
    supportState,
    standingSupport,
    supportHeight,
    pelvisTilt,
    chestTilt,
    captureUrgency,
    supportLateralError,
    supportForwardError,
    captureLateralError,
    captureForwardError,
  } = params;
  const severeInstability =
    groundedAfterControl
    && (
      pelvisTilt > 1.05
      || chestTilt > 1.18
      || (
        supportHeight < 0.5
        && (pelvisTilt > 0.35 || chestTilt > 0.42)
      )
    );
  const moderateInstability =
    groundedAfterControl
    && !severeInstability
    && (
      captureUrgency > 0.58
      || pelvisTilt > 0.44
      || chestTilt > 0.58
      || (standingSupport && supportHeight < 0.92)
      || Math.abs(supportLateralError) > 0.18
      || Math.abs(supportForwardError) > 0.24
    );
  const recoveryReady =
    groundedAfterControl
    && supportState !== "none"
    && supportHeight > 0.84
    && pelvisTilt < 0.34
    && chestTilt < 0.42
    && Math.abs(supportLateralError) < 0.18
    && Math.abs(supportForwardError) < 0.24
    && Math.abs(captureForwardError) < 0.24
    && Math.abs(captureLateralError) < 0.18;
  const standBootstrapStable =
    groundedAfterControl
    && supportState !== "none"
    && supportHeight > 0.88
    && pelvisTilt < 0.28
    && chestTilt < 0.36
    && Math.abs(supportLateralError) < 0.14
    && Math.abs(supportForwardError) < 0.18
    && Math.abs(captureForwardError) < 0.18
    && Math.abs(captureLateralError) < 0.14;

  return {
    severeInstability,
    moderateInstability,
    recoveryReady,
    standBootstrapStable,
  };
}

export function advanceRecoveryState(params: {
  recoveryState: RecoveryState;
  jumpTriggered: boolean;
  groundedAfterControl: boolean;
  predictedVelocityY: number;
  previousGrounded: boolean;
  spawnSettleActive: boolean;
  severeInstability: boolean;
  moderateInstability: boolean;
  recoveryReady: boolean;
  standBootstrapStable: boolean;
}) {
  const {
    recoveryState,
    jumpTriggered,
    groundedAfterControl,
    predictedVelocityY,
    previousGrounded,
    spawnSettleActive,
    severeInstability,
    moderateInstability,
    recoveryReady,
    standBootstrapStable,
  } = params;

  if (jumpTriggered || (!groundedAfterControl && predictedVelocityY > 0.35)) {
    transitionRecoveryState(recoveryState, "jumping");
  } else if (!previousGrounded && groundedAfterControl) {
    transitionRecoveryState(recoveryState, "landing");
  } else if (recoveryState.mode === "jumping" && !groundedAfterControl) {
    transitionRecoveryState(recoveryState, "jumping");
  } else if (spawnSettleActive && groundedAfterControl) {
    transitionRecoveryState(
      recoveryState,
      standBootstrapStable ? "stable" : "landing",
    );
  } else if (spawnSettleActive && severeInstability) {
    transitionRecoveryState(recoveryState, "landing");
  } else if (severeInstability) {
    transitionRecoveryState(recoveryState, "fallen");
  } else if (recoveryState.mode === "fallen") {
    transitionRecoveryState(
      recoveryState,
      recoveryReady ? "recovering" : "fallen",
    );
  } else if (recoveryState.mode === "recovering") {
    if (recoveryReady && recoveryState.elapsed > 0.42) {
      transitionRecoveryState(recoveryState, "stable");
    } else {
      transitionRecoveryState(recoveryState, "recovering");
    }
  } else if (recoveryState.mode === "landing") {
    transitionRecoveryState(
      recoveryState,
      recoveryState.elapsed < 0.2 ? "landing" : moderateInstability ? "stumbling" : "stable",
    );
  } else if (moderateInstability) {
    transitionRecoveryState(recoveryState, "stumbling");
  } else {
    transitionRecoveryState(recoveryState, "stable");
  }

  return MathUtils.clamp(
    recoveryState.mode === "recovering"
      ? recoveryState.elapsed / 0.85
      : recoveryState.mode === "landing"
        ? recoveryState.elapsed / 0.2
        : recoveryState.mode === "stumbling"
          ? recoveryState.elapsed / 0.3
          : 1,
    0,
    1,
  );
}
