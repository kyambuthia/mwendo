import { useFrame } from "@react-three/fiber";
import {
  useEffect,
  useRef,
  type RefObject,
} from "react";
import { Group, MathUtils, Vector3 } from "three";
import { BoxmanHero } from "../lib/components/BoxmanHero";
import {
  useCharacterCtrlrStore,
  useCharacterCtrlrStoreApi,
} from "../lib/CharacterCtrlrProvider";
import { useCharacterCtrlrKeyboardInput } from "../lib/useCharacterCtrlrKeyboardInput";
import {
  DEFAULT_CHARACTER_CTRLR_INPUT,
  mergeCharacterCtrlrInput,
  type CharacterCtrlrInputState,
  type CharacterCtrlrMovementMode,
  type CharacterCtrlrPlayerSnapshot,
  type CharacterCtrlrVec3,
} from "../lib/types";
import { sampleDemoTerrainHeight } from "./demoTerrain";

const forward = new Vector3();
const right = new Vector3();
const movement = new Vector3();
const targetVelocity = new Vector3();
const velocity = new Vector3();
const position = new Vector3();

const CHARACTER_RIDE_HEIGHT = 0.6;
const JUMP_VELOCITY = 6.7;
const GRAVITY = 18;

function dampAngle(current: number, target: number, lambda: number, delta: number) {
  const difference = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  const alpha = 1 - Math.exp(-lambda * delta);

  return current + difference * alpha;
}

export function DemoBoxmanPlayer(props: {
  position?: CharacterCtrlrVec3;
  inputRef?: RefObject<CharacterCtrlrInputState | null>;
}) {
  const storeApi = useCharacterCtrlrStoreApi();
  const setPlayerSnapshot = useCharacterCtrlrStore((state) => state.setPlayerSnapshot);
  const movementMode = useCharacterCtrlrStore((state) => state.movementMode);
  const keyboardInputRef = useCharacterCtrlrKeyboardInput(true);
  const groupRef = useRef<Group>(null);
  const pelvisRef = useRef<Group>(null);
  const spineRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const leftUpperArmRef = useRef<Group>(null);
  const leftLowerArmRef = useRef<Group>(null);
  const rightUpperArmRef = useRef<Group>(null);
  const rightLowerArmRef = useRef<Group>(null);
  const leftUpperLegRef = useRef<Group>(null);
  const leftLowerLegRef = useRef<Group>(null);
  const rightUpperLegRef = useRef<Group>(null);
  const rightLowerLegRef = useRef<Group>(null);
  const groundedRef = useRef(false);
  const jumpHeldRef = useRef(false);
  const facingRef = useRef(0);
  const initialPositionRef = useRef(props.position ?? [0, 2, 18]);

  useEffect(() => {
    position.set(
      initialPositionRef.current[0],
      initialPositionRef.current[1],
      initialPositionRef.current[2],
    );
    const initialSnapshot: CharacterCtrlrPlayerSnapshot = {
      position: [position.x, position.y, position.z],
      focusPosition: [position.x, position.y + 1.15, position.z],
      facing: facingRef.current,
      movementMode: "idle",
      grounded: false,
      supportState: "none",
      velocity: [0, 0, 0],
    };

    setPlayerSnapshot(initialSnapshot);
  }, [setPlayerSnapshot]);

  useFrame((_, dt) => {
    const delta = Math.min(dt, 1 / 20);
    const mergedInput = mergeCharacterCtrlrInput(
      keyboardInputRef.current ?? DEFAULT_CHARACTER_CTRLR_INPUT,
      props.inputRef?.current,
    );
    const { cameraYaw } = storeApi.getState();

    forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    right.set(-forward.z, 0, forward.x);
    movement.set(0, 0, 0);

    if (mergedInput.forward) movement.add(forward);
    if (mergedInput.backward) movement.sub(forward);
    if (mergedInput.right) movement.add(right);
    if (mergedInput.left) movement.sub(right);

    const hasMovementInput = movement.lengthSq() > 0.0001;
    if (hasMovementInput) {
      movement.normalize();
    }

    const desiredSpeed = mergedInput.crouch
      ? 2.2
      : mergedInput.run
        ? 7
        : hasMovementInput
          ? 4.6
          : 0;

    targetVelocity.copy(movement).multiplyScalar(desiredSpeed);

    const horizontalLambda = hasMovementInput ? 10 : 14;
    velocity.x = MathUtils.damp(velocity.x, targetVelocity.x, horizontalLambda, delta);
    velocity.z = MathUtils.damp(velocity.z, targetVelocity.z, horizontalLambda, delta);

    const jumpPressed = mergedInput.jump;
    const jumpTriggered = groundedRef.current && jumpPressed && !jumpHeldRef.current;
    jumpHeldRef.current = jumpPressed;

    if (jumpTriggered) {
      velocity.y = JUMP_VELOCITY;
      groundedRef.current = false;
    } else {
      velocity.y -= GRAVITY * delta;
    }

    position.addScaledVector(velocity, delta);

    const groundY = sampleDemoTerrainHeight(position.x, position.z) + CHARACTER_RIDE_HEIGHT;
    if (position.y <= groundY && velocity.y <= 0) {
      position.y = groundY;
      velocity.y = 0;
      groundedRef.current = true;
    } else if (position.y > groundY + 0.16) {
      groundedRef.current = false;
    }

    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    if (horizontalSpeed > 0.05) {
      const targetFacing = Math.atan2(velocity.x, velocity.z);
      facingRef.current = dampAngle(
        facingRef.current,
        targetFacing,
        groundedRef.current ? 12 : 7,
        delta,
      );
    }

    const nextMovementMode: CharacterCtrlrMovementMode = groundedRef.current
      ? mergedInput.crouch
        ? "crouch"
        : horizontalSpeed < 0.25
          ? "idle"
          : mergedInput.run
            ? "run"
            : "walk"
      : velocity.y > 0.15
        ? "jump"
        : "fall";

    if (groupRef.current) {
      groupRef.current.position.copy(position);
      groupRef.current.rotation.y = facingRef.current;
    }

    const snapshot: CharacterCtrlrPlayerSnapshot = {
      position: [position.x, position.y, position.z],
      focusPosition: [position.x, position.y + 1.15, position.z],
      facing: facingRef.current,
      movementMode: nextMovementMode,
      grounded: groundedRef.current,
      supportState: groundedRef.current ? "double" : "none",
      velocity: [velocity.x, velocity.y, velocity.z],
    };

    setPlayerSnapshot(snapshot);
  });

  return (
    <BoxmanHero
      movementMode={movementMode}
      rig={{
        rootRef: groupRef,
        pelvisRef,
        spineRef,
        headRef,
        leftUpperArmRef,
        leftLowerArmRef,
        rightUpperArmRef,
        rightLowerArmRef,
        leftUpperLegRef,
        leftLowerLegRef,
        rightUpperLegRef,
        rightLowerLegRef,
      }}
    />
  );
}
