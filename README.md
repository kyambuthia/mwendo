# Mwendo

`Mwendo` is a hybrid `library + demo` project for a React Three Fiber third-person controller stack. It ships a reusable primitive player, a follow camera with camera-occlusion handling, scoped controller state, a humanoid ragdoll dummy, and an in-world ragdoll debug lab.

## Production baseline

The library is now in a solid packageable baseline for:

- third-person movement with `idle`, `walk`, `run`, `crouch`, `jump`, and `fall`
- external or keyboard-driven input
- follow-camera control with pointer lock and scene-occlusion avoidance
- state snapshots and movement lifecycle callbacks
- a separate humanoid ragdoll test dummy with in-world debug visualization

What is not finished yet:

- step-up and slope-specialized controller handling
- active-ragdoll player handoff and recovery
- authored interaction systems for doors, vehicles, weapons, and golf
- skinned-character animation or motion-matching backends

## Install

```bash
npm install mwendo react react-dom three @react-three/fiber @react-three/rapier @react-three/drei
```

## Quick start

```tsx
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { MwendoCameraRig, MwendoPlayer, MwendoProvider } from "mwendo";

export function Scene() {
  return (
    <MwendoProvider initialState={{ playerPosition: [0, 2.5, 6] }}>
      <Canvas shadows camera={{ fov: 42, near: 0.1, far: 250, position: [0, 3.5, 8] }}>
        <Physics gravity={[0, -9.81, 0]}>
          <MwendoPlayer controls="keyboard" position={[0, 2.5, 6]} />
        </Physics>
        <MwendoCameraRig />
      </Canvas>
    </MwendoProvider>
  );
}
```

## Controlled input example

Use `controls="none"` when you want to drive the player from your own touch, gamepad, AI, or network state.

```tsx
import { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import {
  MwendoCameraRig,
  MwendoPlayer,
  MwendoProvider,
  useMwendoInputController,
} from "mwendo";

function BotDriver() {
  const controller = useMwendoInputController();

  useEffect(() => {
    controller.replaceInput({ forward: true, run: true });
    return () => controller.resetInput();
  }, [controller]);

  return (
    <>
      <MwendoPlayer
        controls="none"
        inputRef={controller.inputRef}
        onGroundedChange={(grounded) => {
          if (!grounded) {
            controller.pressInput("jump", false);
          }
        }}
      />
      <MwendoCameraRig />
    </>
  );
}

export function Scene() {
  return (
    <MwendoProvider>
      <Canvas>
        <Physics>
          <BotDriver />
        </Physics>
      </Canvas>
    </MwendoProvider>
  );
}
```

## Exported API

- `MwendoProvider`
- `createMwendoStore`
- `useMwendoStore`
- `useMwendoStoreApi`
- `useMwendoKeyboardInput`
- `useMwendoInputController`
- `MwendoActiveRagdollPlayer` experimental
- `MwendoPlayer`
- `MwendoCameraRig`
- `MwendoRagdollDummy`
- `DEFAULT_MWENDO_INPUT`
- `mergeMwendoInput`

Useful exported types:

- `MwendoControllerState`
- `MwendoStoreApi`
- `MwendoStoreInit`
- `MwendoInputState`
- `MwendoMovementMode`
- `MwendoPlayerSnapshot`
- `MwendoSupportState`
- `MwendoVec3`

## Key component props

`MwendoPlayer` supports:

- `controls="keyboard" | "none"`
- `input` and `inputRef` for additive external input
- tunables for `walkSpeed`, `runSpeed`, `crouchSpeed`, `jumpVelocity`, `acceleration`, `deceleration`, and `airControl`
- `onSnapshotChange`, `onMovementModeChange`, `onGroundedChange`, `onJump`, and `onLand`
- `debug` for the in-world player debug overlay
- emitted snapshots currently report `supportState` as a simple `"double"` or `"none"` fallback for the capsule baseline

`MwendoActiveRagdollPlayer` supports:

- the same input and lifecycle callback shape as `MwendoPlayer`
- experimental tunables for `jumpImpulse`, `uprightTorque`, `turnTorque`, and `balanceDamping`
- experimental camera-target tuning with `cameraFocusSmoothing`, `cameraFocusHeight`, and `cameraFocusLead`
- `debug` to view the articulated rig through the ragdoll debug overlay
- emitted snapshots report articulated foot support as `"none"`, `"left"`, `"right"`, or `"double"`

`MwendoCameraRig` supports:

- `followOffset`, `focusHeight`, and `smoothing`
- `pointerLock`, `yawSensitivity`, and `pitchSensitivity`
- `collisionEnabled`, `collisionPadding`, and `minCollisionDistance`

`MwendoRagdollDummy` supports:

- `position`
- `debug`
- paused/manual-step demo debugging props for the in-repo sandbox

## Repo layout

- `src/lib`: publishable library source
- `src/components`: demo-only scene pieces
- `dist`: library build output
- `demo-dist`: demo build output

## Scripts

- `npm run dev`: run the demo locally
- `npm run dev:lan`: run the demo on your LAN
- `npm run test`: run the library smoke tests
- `npm run build:lib`: build the package into `dist`
- `npm run build:demo`: build the demo into `demo-dist`
- `npm run build`: typecheck, test, and build both library and demo
- `npm run preview:lan`: preview the demo build on your LAN

Demo tip:

- add `?player=ragdoll` to the dev URL to load the experimental active-ragdoll player instead of the capsule baseline

## Design direction

The current shipping strategy is still deliberate: keep control, camera, state, and interaction logic deterministic first, then add more sophisticated animation systems later. That keeps the library debuggable for gameplay code now while leaving a clean upgrade path toward active ragdolls, authored interaction poses, or motion matching later.

See also:

- [ROADMAP.md](./ROADMAP.md)
- [RESEARCH.md](./RESEARCH.md)
