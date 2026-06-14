import { describe, expect, it } from "vitest";
import { advanceRecoveryState, deriveRecoverySignals } from "./recovery";
import type { RecoveryState } from "./controllerTypes";

function createRecoveryState(mode: RecoveryState["mode"]): RecoveryState {
  return {
    mode,
    elapsed: 0,
  };
}

describe("recovery", () => {
  it("detects bootstrap stability with single or double support", () => {
    const signals = deriveRecoverySignals({
      groundedAfterControl: true,
      supportState: "left",
      standingSupport: true,
      supportHeight: 0.9,
      pelvisTilt: 0.2,
      chestTilt: 0.25,
      captureUrgency: 0.1,
      supportLateralError: 0.05,
      supportForwardError: 0.06,
      captureLateralError: 0.04,
      captureForwardError: 0.05,
    });

    expect(signals.standBootstrapStable).toBe(true);
  });

  it("routes severe bootstrap instability to landing instead of fallen", () => {
    const recoveryState = createRecoveryState("stable");

    advanceRecoveryState({
      recoveryState,
      jumpTriggered: false,
      groundedAfterControl: true,
      predictedVelocityY: 0,
      previousGrounded: true,
      spawnSettleActive: true,
      severeInstability: true,
      moderateInstability: true,
      recoveryReady: false,
      standBootstrapStable: false,
    });

    expect(recoveryState.mode).toBe("landing");
  });
});