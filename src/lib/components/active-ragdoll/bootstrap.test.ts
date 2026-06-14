import { describe, expect, it } from "vitest";
import {
  advanceBootstrapTimer,
  createInitialBootstrapState,
  deriveBootstrapSupportState,
  deriveSpawnSettleActive,
  scaleBootstrapMotorGain,
  shouldSuppressLocomotionDuringBootstrap,
  STAND_BOOTSTRAP_MAX_DURATION,
} from "./bootstrap";
import { STAND_BOOTSTRAP_SETTLE_DURATION } from "./config";

describe("bootstrap", () => {
  it("keeps spawn settle active until the stable timer completes", () => {
    const state = createInitialBootstrapState();
    state.stableTimer = STAND_BOOTSTRAP_SETTLE_DURATION - 0.01;

    expect(
      deriveSpawnSettleActive({
        jointCalibrationReady: true,
        standingAssistRequested: true,
        bootstrapState: state,
      }),
    ).toBe(true);

    state.stableTimer = STAND_BOOTSTRAP_SETTLE_DURATION;

    expect(
      deriveSpawnSettleActive({
        jointCalibrationReady: true,
        standingAssistRequested: true,
        bootstrapState: state,
      }),
    ).toBe(false);
  });

  it("forces bootstrap exit after the max duration", () => {
    const state = createInitialBootstrapState();
    state.elapsed = STAND_BOOTSTRAP_MAX_DURATION;

    expect(
      deriveSpawnSettleActive({
        jointCalibrationReady: true,
        standingAssistRequested: true,
        bootstrapState: state,
      }),
    ).toBe(false);
  });

  it("decays the stable timer instead of hard-resetting it", () => {
    const state = createInitialBootstrapState();
    state.stableTimer = 0.2;

    advanceBootstrapTimer({
      state,
      delta: 0.05,
      standingAssistRequested: true,
      standBootstrapStable: false,
    });

    expect(state.stableTimer).toBeGreaterThan(0);
    expect(state.stableTimer).toBeLessThan(0.2);
  });

  it("prefers probed double support during bootstrap", () => {
    expect(
      deriveBootstrapSupportState({
        spawnSettleActive: true,
        contactSupportState: "none",
        probedSupportState: "double",
      }),
    ).toBe("double");
  });

  it("boosts motor gains during grounded bootstrap", () => {
    expect(scaleBootstrapMotorGain(20, true, true)).toBeCloseTo(27, 5);
    expect(scaleBootstrapMotorGain(20, false, true)).toBe(20);
  });

  it("suppresses locomotion while bootstrap is active", () => {
    expect(shouldSuppressLocomotionDuringBootstrap(true)).toBe(true);
    expect(shouldSuppressLocomotionDuringBootstrap(false)).toBe(false);
  });
});