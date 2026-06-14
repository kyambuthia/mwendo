import { describe, expect, it } from "vitest";
import { applyStandingPoseTargets } from "./poseTargets";
import { deriveStandingPoseTargets } from "./standing";

describe("standing", () => {
  it("applies neutral articulated pose targets for standing", () => {
    const standingTargets = applyStandingPoseTargets({
      pelvisPitch: -0.2,
      pelvisRoll: 0.1,
      chestPitch: 0.3,
      chestRoll: -0.1,
      left: {
        hip: -0.5,
        knee: -0.8,
        ankle: -0.2,
        shoulder: 0.4,
        elbow: -0.1,
        wrist: 0.2,
      },
      right: {
        hip: -0.5,
        knee: -0.8,
        ankle: -0.2,
        shoulder: 0.4,
        elbow: -0.1,
        wrist: 0.2,
      },
    });

    expect(standingTargets.left.knee).toBeCloseTo(-0.22, 5);
    expect(standingTargets.right.ankle).toBeCloseTo(0.08, 5);
    expect(standingTargets.pelvisPitch).toBeCloseTo(0.01, 5);
  });

  it("adds bounded balance assist without saturating joint targets", () => {
    const assistedTargets = deriveStandingPoseTargets({
      baseTargets: applyStandingPoseTargets({
        pelvisPitch: 0.01,
        pelvisRoll: 0,
        chestPitch: 0.02,
        chestRoll: 0,
        left: {
          hip: -0.08,
          knee: -0.22,
          ankle: 0.08,
          shoulder: 0.1,
          elbow: -0.34,
          wrist: 0,
        },
        right: {
          hip: -0.08,
          knee: -0.22,
          ankle: 0.08,
          shoulder: 0.1,
          elbow: -0.34,
          wrist: 0,
        },
      }),
      supportLateralError: 0.4,
      supportForwardError: 0.35,
      captureLateralError: 0.3,
      captureForwardError: 0.25,
      yawError: 0.8,
      turnInPlaceRequested: true,
    });

    expect(Math.abs(assistedTargets.pelvisRoll)).toBeLessThanOrEqual(0.18);
    expect(assistedTargets.left.knee).toBeGreaterThanOrEqual(-0.32);
    expect(assistedTargets.right.knee).toBeGreaterThanOrEqual(-0.32);
  });
});