import {
  CuboidCollider,
  RigidBody,
  type RapierRigidBody,
  type RigidBodyProps,
} from "@react-three/rapier";
import {
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";
import {
  DEFAULT_CHARACTER_CTRLR_INPUT,
  type CharacterCtrlrInputState,
  useCharacterCtrlrStore,
} from "../lib";

const DEMO_VALIDATION_SCENARIO =
  new URLSearchParams(window.location.search).get("scenario");

function deriveScenarioInput(
  scenario: string | null,
  elapsedSeconds: number,
): CharacterCtrlrInputState {
  if (!scenario) {
    return { ...DEFAULT_CHARACTER_CTRLR_INPUT };
  }

  switch (scenario) {
    case "turn_in_place_stability":
      return elapsedSeconds >= 2 && elapsedSeconds < 6
        ? { ...DEFAULT_CHARACTER_CTRLR_INPUT, right: true }
        : { ...DEFAULT_CHARACTER_CTRLR_INPUT };
    case "walk_start_from_rest":
      return elapsedSeconds >= 2 && elapsedSeconds < 5
        ? { ...DEFAULT_CHARACTER_CTRLR_INPUT, forward: true }
        : { ...DEFAULT_CHARACTER_CTRLR_INPUT };
    case "steady_forward_walk":
    case "no_persistent_leg_scissoring":
      return elapsedSeconds >= 2 && elapsedSeconds < 10
        ? { ...DEFAULT_CHARACTER_CTRLR_INPUT, forward: true }
        : { ...DEFAULT_CHARACTER_CTRLR_INPUT };
    case "walk_run_walk_transition":
      if (elapsedSeconds >= 2 && elapsedSeconds < 5) {
        return { ...DEFAULT_CHARACTER_CTRLR_INPUT, forward: true };
      }
      if (elapsedSeconds >= 5 && elapsedSeconds < 8) {
        return { ...DEFAULT_CHARACTER_CTRLR_INPUT, forward: true, run: true };
      }
      if (elapsedSeconds >= 8 && elapsedSeconds < 11) {
        return { ...DEFAULT_CHARACTER_CTRLR_INPUT, forward: true };
      }
      return { ...DEFAULT_CHARACTER_CTRLR_INPUT };
    case "mild_push_recovery":
    case "spawn_idle_stability":
      return { ...DEFAULT_CHARACTER_CTRLR_INPUT };
    case "no_persistent_foot_chatter":
      if (elapsedSeconds >= 2 && elapsedSeconds < 7) {
        return { ...DEFAULT_CHARACTER_CTRLR_INPUT, forward: true };
      }
      return { ...DEFAULT_CHARACTER_CTRLR_INPUT };
    default:
      return { ...DEFAULT_CHARACTER_CTRLR_INPUT };
  }
}

export function useDemoValidationScenario() {
  const inputRef = useRef<CharacterCtrlrInputState | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (!DEMO_VALIDATION_SCENARIO) {
      inputRef.current = null;
      return;
    }

    let frameHandle = 0;
    const startTime = performance.now();

    const update = () => {
      elapsedRef.current = (performance.now() - startTime) / 1000;
      inputRef.current = deriveScenarioInput(
        DEMO_VALIDATION_SCENARIO,
        elapsedRef.current,
      );

      if (typeof window !== "undefined") {
        (
          window as typeof window & {
            __characterCtrlrValidation?: unknown;
          }
        ).__characterCtrlrValidation = {
          scenario: DEMO_VALIDATION_SCENARIO,
          elapsed: elapsedRef.current,
          input: inputRef.current,
        };
      }

      frameHandle = window.requestAnimationFrame(update);
    };

    update();

    return () => {
      window.cancelAnimationFrame(frameHandle);
    };
  }, []);

  return {
    scenario: DEMO_VALIDATION_SCENARIO,
    inputRef,
    elapsedRef,
  };
}

export function DemoValidationPusher(props: {
  scenario: string | null;
  elapsedRef: MutableRefObject<number>;
}) {
  const { scenario, elapsedRef } = props;
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const playerPosition = useCharacterCtrlrStore((state) => state.playerPosition);
  const launchedRef = useRef(false);

  useEffect(() => {
    if (scenario !== "mild_push_recovery") {
      launchedRef.current = false;
      return;
    }

    const interval = window.setInterval(() => {
      if (launchedRef.current || elapsedRef.current < 3.2) {
        return;
      }

      const body = bodyRef.current;
      if (!body) {
        return;
      }

      launchedRef.current = true;
      body.setTranslation(
        {
          x: playerPosition[0] + 1.6,
          y: playerPosition[1] + 0.8,
          z: playerPosition[2] - 3.6,
        },
        true,
      );
      body.setLinvel(
        { x: -1.2, y: 0.2, z: 4.8 },
        true,
      );
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }, 50);

    return () => {
      window.clearInterval(interval);
    };
  }, [elapsedRef, playerPosition, scenario]);

  if (scenario !== "mild_push_recovery") {
    return null;
  }

  return (
    <RigidBody
      canSleep={false}
      colliders={false}
      linearDamping={0.1}
      ref={bodyRef}
      restitution={0}
      type={"dynamic" satisfies RigidBodyProps["type"]}
    >
      <CuboidCollider args={[0.22, 0.22, 0.22]} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.44, 0.44, 0.44]} />
        <meshStandardMaterial color="#d34e36" roughness={0.5} />
      </mesh>
    </RigidBody>
  );
}
