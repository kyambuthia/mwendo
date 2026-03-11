import { describe, expect, it } from "vitest";
import {
  MWENDO_HUMANOID_BODY_DEFINITIONS,
  MWENDO_HUMANOID_JOINT_DEFINITIONS,
} from "./MwendoHumanoidData";

describe("MWENDO_HUMANOID_JOINT_DEFINITIONS", () => {
  it("keeps every joint anchor aligned in the bind pose", () => {
    const bodyPositions = Object.fromEntries(
      MWENDO_HUMANOID_BODY_DEFINITIONS.map((body) => [body.key, body.position]),
    );

    for (const joint of MWENDO_HUMANOID_JOINT_DEFINITIONS) {
      const bodyAPosition = bodyPositions[joint.bodyA];
      const bodyBPosition = bodyPositions[joint.bodyB];
      const worldAnchorA = joint.anchorA.map(
        (value, index) => value + bodyAPosition[index],
      );
      const worldAnchorB = joint.anchorB.map(
        (value, index) => value + bodyBPosition[index],
      );
      const alignmentError = Math.hypot(
        worldAnchorA[0] - worldAnchorB[0],
        worldAnchorA[1] - worldAnchorB[1],
        worldAnchorA[2] - worldAnchorB[2],
      );

      expect(
        alignmentError,
        `${joint.key} starts with ${alignmentError.toFixed(4)}m of anchor preload`,
      ).toBeLessThan(1e-6);
    }
  });
});
