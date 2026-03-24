import { useFrame } from "@react-three/fiber";
import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { Group, MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import { BoxmanHero } from "../lib/components/BoxmanHero";
import { useCharacterCtrlrStore } from "../lib/CharacterCtrlrProvider";
import { useCharacterCtrlrKeyboardInput } from "../lib/useCharacterCtrlrKeyboardInput";
import {
  DEFAULT_CHARACTER_CTRLR_INPUT,
  mergeCharacterCtrlrInput,
  type CharacterCtrlrInputState,
  type CharacterCtrlrMovementMode,
  type CharacterCtrlrPlayerSnapshot,
  type CharacterCtrlrVec3,
} from "../lib/types";
import {
  DEMO_PLANET_PLAYER_RIDE_HEIGHT,
  sampleDemoPlanetSurfaceAtPosition,
} from "./demoTerrain";

const worldForward = new Vector3(0, 0, 1);
const worldRight = new Vector3(1, 0, 0);
const movement = new Vector3();
const tangentForward = new Vector3();
const tangentRight = new Vector3();
const tangentVelocity = new Vector3();
const targetTangentialVelocity = new Vector3();
const radialVelocity = new Vector3();
const velocity = new Vector3();
const position = new Vector3();
const up = new Vector3();
const desiredForward = new Vector3();
const facingForward = new Vector3();
const basisRight = new Vector3();
const basisForward = new Vector3();
const basisMatrix = new Matrix4();

const JUMP_VELOCITY = 6.8;
const GRAVITY = 18;

function projectDirectionOnPlane(source: Vector3, planeNormal: Vector3, fallback: Vector3) {
  const projected = source.clone().addScaledVector(
    planeNormal,
    -source.dot(planeNormal),
  );

  if (projected.lengthSq() < 1e-6) {
    return fallback.clone();
  }

  return projected.normalize();
}

export function DemoBoxmanPlayer(props: {
  position?: CharacterCtrlrVec3;
  inputRef?: RefObject<CharacterCtrlrInputState | null>;
  positionRef: MutableRefObject<Vector3>;
  upRef: MutableRefObject<Vector3>;
  viewVectorRef: MutableRefObject<Vector3>;
}) {
  const setPlayerSnapshot = useCharacterCtrlrStore((state) => state.setPlayerSnapshot);
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
  const facingDirectionRef = useRef(new Vector3(0, 0, 1));
  const initialPositionRef = useRef(props.position ?? [0, 2, 18]);
  const [movementMode, setMovementMode] = useState<CharacterCtrlrMovementMode>("idle");

  useEffect(() => {
    position.set(
      initialPositionRef.current[0],
      initialPositionRef.current[1],
      initialPositionRef.current[2],
    );
    up.copy(position).normalize();
    props.positionRef.current.copy(position);
    props.upRef.current.copy(up);
    facingDirectionRef.current.copy(
      projectDirectionOnPlane(worldForward, up, worldRight),
    );
    const initialSnapshot: CharacterCtrlrPlayerSnapshot = {
      position: [position.x, position.y, position.z],
      focusPosition: [
        position.x + up.x * 1.15,
        position.y + up.y * 1.15,
        position.z + up.z * 1.15,
      ],
      facing: 0,
      movementMode: "idle",
      grounded: false,
      supportState: "none",
      velocity: [0, 0, 0],
    };

    setPlayerSnapshot(initialSnapshot);
  }, [props.positionRef, props.upRef, setPlayerSnapshot]);

  useFrame((_, dt) => {
    const delta = Math.min(dt, 1 / 20);
    const mergedInput = mergeCharacterCtrlrInput(
      keyboardInputRef.current ?? DEFAULT_CHARACTER_CTRLR_INPUT,
      props.inputRef?.current,
    );

    up.copy(position).normalize();
    tangentForward.copy(
      projectDirectionOnPlane(
        props.viewVectorRef.current,
        up,
        facingDirectionRef.current,
      ),
    );
    tangentRight.crossVectors(up, tangentForward).normalize();
    movement.set(0, 0, 0);

    if (mergedInput.forward) movement.add(tangentForward);
    if (mergedInput.backward) movement.sub(tangentForward);
    if (mergedInput.right) movement.add(tangentRight);
    if (mergedInput.left) movement.sub(tangentRight);

    const hasMovementInput = movement.lengthSq() > 0.0001;
    if (hasMovementInput) {
      movement.normalize();
    }

    const desiredSpeed = mergedInput.crouch
      ? 2.2
      : mergedInput.run
        ? 7
        : hasMovementInput
          ? 4.8
          : 0;

    targetTangentialVelocity.copy(movement).multiplyScalar(desiredSpeed);

    radialVelocity.copy(up).multiplyScalar(velocity.dot(up));
    tangentVelocity.copy(velocity).sub(radialVelocity);

    const horizontalLambda = groundedRef.current
      ? hasMovementInput
        ? 10
        : 14
      : hasMovementInput
        ? 4
        : 6;
    tangentVelocity.lerp(
      targetTangentialVelocity,
      1 - Math.exp(-horizontalLambda * delta),
    );

    let radialSpeed = velocity.dot(up);
    const jumpPressed = mergedInput.jump;
    const jumpTriggered = groundedRef.current && jumpPressed && !jumpHeldRef.current;
    jumpHeldRef.current = jumpPressed;

    if (jumpTriggered) {
      radialSpeed = JUMP_VELOCITY;
      groundedRef.current = false;
    } else {
      radialSpeed -= GRAVITY * delta;
    }

    velocity.copy(tangentVelocity).addScaledVector(up, radialSpeed);
    position.addScaledVector(velocity, delta);

    const surface = sampleDemoPlanetSurfaceAtPosition(position);
    const surfaceRadius = surface.radius + DEMO_PLANET_PLAYER_RIDE_HEIGHT;
    const radialDistance = position.length();

    if (radialDistance <= surfaceRadius && radialSpeed <= 0) {
      position.copy(surface.normal).multiplyScalar(surfaceRadius);
      radialSpeed = 0;
      groundedRef.current = true;
    } else if (radialDistance > surfaceRadius + 0.18) {
      groundedRef.current = false;
    }

    up.copy(position).normalize();
    tangentVelocity.copy(velocity).addScaledVector(up, -velocity.dot(up));
    velocity.copy(tangentVelocity).addScaledVector(up, radialSpeed);

    const horizontalSpeed = tangentVelocity.length();
    if (horizontalSpeed > 0.05) {
      desiredForward.copy(tangentVelocity).normalize();
      facingDirectionRef.current.lerp(desiredForward, 1 - Math.exp(-12 * delta));
      facingDirectionRef.current.copy(
        projectDirectionOnPlane(facingDirectionRef.current, up, tangentForward),
      );
    } else {
      facingDirectionRef.current.copy(
        projectDirectionOnPlane(facingDirectionRef.current, up, tangentForward),
      );
    }

    basisForward.copy(facingDirectionRef.current).normalize();
    basisRight.crossVectors(up, basisForward).normalize();
    basisForward.crossVectors(basisRight, up).normalize();

    if (groupRef.current) {
      basisMatrix.makeBasis(basisRight, up, basisForward);
      groupRef.current.position.copy(position);
      groupRef.current.quaternion.setFromRotationMatrix(basisMatrix);
    }

    const nextMovementMode: CharacterCtrlrMovementMode = groundedRef.current
      ? mergedInput.crouch
        ? "crouch"
        : horizontalSpeed < 0.2
          ? "idle"
          : mergedInput.run
            ? "run"
            : "walk"
      : radialSpeed > 0.15
        ? "jump"
        : "fall";

    if (nextMovementMode !== movementMode) {
      setMovementMode(nextMovementMode);
    }

    props.positionRef.current.copy(position);
    props.upRef.current.copy(up);
    facingForward.copy(basisForward);

    const planarForward = projectDirectionOnPlane(facingForward, up, tangentForward);
    const facingAngle = Math.atan2(planarForward.x, planarForward.z);
    const focusPosition = position.clone().addScaledVector(up, 1.15);
    const snapshot: CharacterCtrlrPlayerSnapshot = {
      position: [position.x, position.y, position.z],
      focusPosition: [focusPosition.x, focusPosition.y, focusPosition.z],
      facing: Number.isFinite(facingAngle) ? facingAngle : 0,
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
