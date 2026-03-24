import { Canvas } from "@react-three/fiber";
import { Physics, useRapier } from "@react-three/rapier";
import { Suspense, useEffect, useRef } from "react";
import { Vector3 } from "three";
import { FlatArena } from "./components/FlatArena";
import { KeyRibbon } from "./components/KeyRibbon";
import { Lights } from "./components/Lights";
import { DemoBoxmanPlayer } from "./components/DemoBoxmanPlayer";
import { DemoPlanetCamera } from "./components/DemoPlanetCamera";
import { TerrainArena } from "./components/TerrainArena";
import {
  DEMO_PLANET_DUMMY_DIRECTION,
  DEMO_PLANET_DUMMY_SPAWN_CLEARANCE,
  DEMO_PLANET_PLAYER_SPAWN_CLEARANCE,
  DEMO_PLANET_SPAWN_DIRECTION,
  getDemoPlanetSpawnPosition,
} from "./components/demoTerrain";
import { useDemoTouchInput } from "./components/useDemoTouchInput";
import {
  DemoValidationPusher,
  useDemoValidationScenario,
} from "./components/useDemoValidationScenario";
import {
  DEMO_PHYSICS_STEP,
  useDemoPhysicsDebugControls,
} from "./components/useDemoPhysicsDebugControls";
import {
  CharacterCtrlrActiveRagdollPlayer,
  type CharacterCtrlrMixamoMotionSource,
  CharacterCtrlrProvider,
  CharacterCtrlrRagdollDummy,
} from "./lib";

const DEMO_PLAYER_MODE =
  new URLSearchParams(window.location.search).get("player") === "ragdoll"
    ? "ragdoll"
    : "boxman";
const DEMO_DEBUG =
  new URLSearchParams(window.location.search).get("debug") === "1";
const DEMO_ARENA_MODE =
  new URLSearchParams(window.location.search).get("arena") === "flat"
    ? "flat"
    : "planet";
const DEMO_MOTION_MODE =
  new URLSearchParams(window.location.search).get("motion") === "mixamo"
    ? "mixamo"
    : "procedural";
const USE_PLANET_DEMO =
  DEMO_PLAYER_MODE === "boxman" && DEMO_ARENA_MODE === "planet";
const DEMO_MIXAMO_SOURCE: CharacterCtrlrMixamoMotionSource | undefined =
  DEMO_MOTION_MODE === "mixamo"
    ? {
        rigUrl: "/mixamo/character.fbx",
        clips: {
          idle: "/mixamo/idle.fbx",
          walk: "/mixamo/walk.fbx",
          run: "/mixamo/run.fbx",
          crouch: "/mixamo/crouch-walk.fbx",
          jump: "/mixamo/jump.fbx",
        },
        blend: 0.9,
      }
    : undefined;
const DEMO_PLAYER_POSITION: [number, number, number] =
  USE_PLANET_DEMO
    ? getDemoPlanetSpawnPosition(
        DEMO_PLANET_SPAWN_DIRECTION,
        DEMO_PLANET_PLAYER_SPAWN_CLEARANCE,
      )
    : [0, 2.02, 6];
const DEMO_DUMMY_POSITION: [number, number, number] =
  USE_PLANET_DEMO
    ? getDemoPlanetSpawnPosition(
        DEMO_PLANET_DUMMY_DIRECTION,
        DEMO_PLANET_DUMMY_SPAWN_CLEARANCE,
      )
    : [-4, 5.5, -6];
const SHOW_RAGDOLL_DUMMY =
  DEMO_DEBUG &&
  (new URLSearchParams(window.location.search).get("dummy") === "1" ||
    DEMO_PLAYER_MODE === "ragdoll");

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
  const validationScenario = useDemoValidationScenario();
  const activeInputRef =
    validationScenario.scenario ? validationScenario.inputRef : touchInputRef;
  const playerPositionRef = useRef(new Vector3(...DEMO_PLAYER_POSITION));
  const playerUpRef = useRef(new Vector3(0, 1, 0));
  const cameraViewRef = useRef(new Vector3(0, 0, 1));

  return (
    <>
      {DEMO_DEBUG ? <KeyRibbon /> : null}
      <Canvas
        camera={{ fov: 42, near: 0.1, far: 250, position: [0, 3.5, 8] }}
        gl={{ antialias: true }}
        shadows
      >
        <color attach="background" args={["#d9e7d2"]} />
        <fog attach="fog" args={["#d9e7d2", 45, 180]} />
        <Suspense fallback={null}>
          <Lights />
          {USE_PLANET_DEMO ? (
            <>
              <TerrainArena />
              <DemoBoxmanPlayer
                inputRef={activeInputRef}
                position={DEMO_PLAYER_POSITION}
                positionRef={playerPositionRef}
                upRef={playerUpRef}
                viewVectorRef={cameraViewRef}
              />
              <DemoPlanetCamera
                positionRef={playerPositionRef}
                upRef={playerUpRef}
                viewVectorRef={cameraViewRef}
              />
            </>
          ) : (
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
              <CharacterCtrlrActiveRagdollPlayer
                controls="keyboard"
                debug={DEMO_DEBUG}
                inputRef={activeInputRef}
                mixamoSource={DEMO_MIXAMO_SOURCE}
                position={DEMO_PLAYER_POSITION}
              />
            ) : (
                <></>
              )}
              <DemoValidationPusher
                elapsedRef={validationScenario.elapsedRef}
                scenario={validationScenario.scenario}
              />
              {SHOW_RAGDOLL_DUMMY ? (
                <CharacterCtrlrRagdollDummy
                  debug
                  manualStepCount={physicsDebug.manualStepCount}
                  paused={physicsDebug.paused}
                  position={DEMO_DUMMY_POSITION}
                  timeScale={physicsDebug.timeScale}
                />
              ) : null}
            </Physics>
          )}
        </Suspense>
      </Canvas>
    </>
  );
}

export default function App() {
  return (
    <CharacterCtrlrProvider initialState={{ playerPosition: DEMO_PLAYER_POSITION }}>
      <DemoScene />
    </CharacterCtrlrProvider>
  );
}
