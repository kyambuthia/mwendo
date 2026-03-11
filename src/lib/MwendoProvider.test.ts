import { describe, expect, it } from "vitest";
import { createMwendoStore } from "./MwendoProvider";

describe("createMwendoStore", () => {
  it("respects initial state overrides", () => {
    const store = createMwendoStore({
      playerPosition: [1, 2, 3],
      playerFocusPosition: [1.5, 2.5, 3.5],
      playerVelocity: [0.1, 0.2, 0.3],
      grounded: true,
      movementMode: "run",
      supportState: "double",
      cameraYaw: 0.75,
      cameraPitch: -0.35,
    });

    expect(store.getState()).toMatchObject({
      playerPosition: [1, 2, 3],
      playerFocusPosition: [1.5, 2.5, 3.5],
      playerVelocity: [0.1, 0.2, 0.3],
      grounded: true,
      movementMode: "run",
      supportState: "double",
      cameraYaw: 0.75,
      cameraPitch: -0.35,
    });
  });

  it("updates the player snapshot as one payload", () => {
    const store = createMwendoStore();

    store.getState().setPlayerSnapshot({
      position: [4, 5, 6],
      focusPosition: [4.1, 6.2, 6.3],
      velocity: [1, 2, 3],
      facing: 1.25,
      movementMode: "jump",
      grounded: false,
      supportState: "left",
    });

    expect(store.getState()).toMatchObject({
      playerPosition: [4, 5, 6],
      playerFocusPosition: [4.1, 6.2, 6.3],
      playerVelocity: [1, 2, 3],
      playerFacing: 1.25,
      movementMode: "jump",
      grounded: false,
      supportState: "left",
    });
  });

  it("clears a custom focus target when the next snapshot omits it", () => {
    const store = createMwendoStore({
      playerFocusPosition: [2, 3, 4],
    });

    store.getState().setPlayerSnapshot({
      position: [5, 6, 7],
      velocity: [0, 0, 0],
      facing: 0.5,
      movementMode: "idle",
      grounded: true,
      supportState: "double",
    });

    expect(store.getState().playerFocusPosition).toBeNull();
  });

  it("clamps camera pitch while preserving yaw deltas", () => {
    const store = createMwendoStore({
      cameraYaw: 0,
      cameraPitch: 0,
    });

    store.getState().adjustCamera(0.5, 10);
    expect(store.getState().cameraYaw).toBeCloseTo(0.5);
    expect(store.getState().cameraPitch).toBeCloseTo(0.35);

    store.getState().adjustCamera(-0.25, -10);
    expect(store.getState().cameraYaw).toBeCloseTo(0.25);
    expect(store.getState().cameraPitch).toBeCloseTo(-1.1);
  });
});
