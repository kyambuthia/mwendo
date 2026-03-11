import { Canvas } from "@react-three/fiber";
import { Physics, useRapier } from "@react-three/rapier";
import { Suspense, useEffect, useRef } from "react";
import { FlatArena } from "./components/FlatArena";
import { KeyRibbon } from "./components/KeyRibbon";
import { Lights } from "./components/Lights";
import { useDemoTouchInput } from "./components/useDemoTouchInput";
import {
  DEMO_PHYSICS_STEP,
  useDemoPhysicsDebugControls,
} from "./components/useDemoPhysicsDebugControls";
import {
  MwendoActiveRagdollPlayer,
  MwendoCameraRig,
  MwendoPlayer,
  MwendoProvider,
  MwendoRagdollDummy,
} from "./lib";

const DEMO_PLAYER_MODE =
  new URLSearchParams(window.location.search).get("player") === "capsule"
    ? "capsule"
    : "ragdoll";

function DemoPhysicsStepper({
  paused,
  stepRequest,
  timeScale,
  onStep,
}: {
  paused: boolean;
  stepRequest: number;
  timeScale: number;
  onStep: () => void;
}) {
  const { step } = useRapier();
  const handledRequest = useRef(0);

  useEffect(() => {
    if (!paused) {
      handledRequest.current = stepRequest;
      return;
    }

    if (stepRequest === handledRequest.current) {
      return;
    }

    const pendingSteps = stepRequest - handledRequest.current;

    handledRequest.current = stepRequest;

    for (let index = 0; index < pendingSteps; index += 1) {
      step(DEMO_PHYSICS_STEP * timeScale);
      onStep();
    }
  }, [onStep, paused, step, stepRequest, timeScale]);

  return null;
}

function DemoScene() {
  const touchInputRef = useDemoTouchInput();
  const physicsDebug = useDemoPhysicsDebugControls();

  return (
    <>
      <KeyRibbon />
      <Canvas
        camera={{ fov: 42, near: 0.1, far: 250, position: [0, 3.5, 8] }}
        gl={{ antialias: true }}
        shadows
      >
        <color attach="background" args={["#c9dcff"]} />
        <fog attach="fog" args={["#c9dcff", 30, 120]} />
        <Suspense fallback={null}>
          <Lights />
          <Physics
            gravity={[0, -9.81, 0]}
            paused={physicsDebug.paused}
            timeStep={DEMO_PHYSICS_STEP * physicsDebug.timeScale}
          >
            <DemoPhysicsStepper
              onStep={physicsDebug.acknowledgeStep}
              paused={physicsDebug.paused}
              stepRequest={physicsDebug.stepRequest}
              timeScale={physicsDebug.timeScale}
            />
            <FlatArena />
            {DEMO_PLAYER_MODE === "ragdoll" ? (
              <MwendoActiveRagdollPlayer
                controls="keyboard"
                inputRef={touchInputRef}
                position={[0, 2.5, 6]}
              />
            ) : (
              <MwendoPlayer
                controls="keyboard"
                debug
                inputRef={touchInputRef}
                position={[0, 2.5, 6]}
              />
            )}
            <MwendoRagdollDummy
              manualStepCount={physicsDebug.manualStepCount}
              paused={physicsDebug.paused}
              position={[-4, 5.5, -6]}
              timeScale={physicsDebug.timeScale}
            />
          </Physics>
          <MwendoCameraRig />
        </Suspense>
      </Canvas>
    </>
  );
}

export default function App() {
  return (
    <MwendoProvider initialState={{ playerPosition: [0, 2.5, 6] }}>
      <DemoScene />
    </MwendoProvider>
  );
}
