import { useFrame, useThree } from "@react-three/fiber";
import {
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";
import { MathUtils, Vector3 } from "three";

const referenceAxisA = new Vector3(0, 1, 0);
const referenceAxisB = new Vector3(1, 0, 0);
const localEast = new Vector3();
const localNorth = new Vector3();
const focus = new Vector3();
const focusDelta = new Vector3();
const focusPlanarDelta = new Vector3();
const desiredPosition = new Vector3();
const desiredViewVector = new Vector3();
const rawFocus = new Vector3();
const smoothedUp = new Vector3();
const smoothedFocus = new Vector3();

const CAMERA_POSITION_LAMBDA = 10;
const CAMERA_UP_LAMBDA = 10;
const CAMERA_FOCUS_PLANAR_LAMBDA = 14;
const CAMERA_FOCUS_VERTICAL_LAMBDA = 6;

export function DemoPlanetCamera(props: {
  positionRef: MutableRefObject<Vector3>;
  upRef: MutableRefObject<Vector3>;
  viewVectorRef: MutableRefObject<Vector3>;
}) {
  const { camera, gl } = useThree();
  const yawRef = useRef(Math.PI * 0.14);
  const pitchRef = useRef(-0.34);
  const radiusRef = useRef(7.4);
  const initializedRef = useRef(false);

  useEffect(() => {
    const element = gl.domElement;

    const onPointerDown = () => {
      if (document.pointerLockElement !== element) {
        void element.requestPointerLock();
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== element) {
        return;
      }

      yawRef.current -= event.movementX * 0.0024;
      pitchRef.current = MathUtils.clamp(
        pitchRef.current - event.movementY * 0.0018,
        -1.05,
        0.35,
      );
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      radiusRef.current = MathUtils.clamp(
        radiusRef.current + event.deltaY * 0.008,
        3.8,
        11.5,
      );
    };

    element.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("mousemove", onMouseMove);
    element.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("mousemove", onMouseMove);
      element.removeEventListener("wheel", onWheel);
    };
  }, [gl]);

  useFrame((_, dt) => {
    const dampingDelta = Math.min(dt, 1 / 20);
    const up = props.upRef.current.clone().normalize();
    rawFocus.copy(props.positionRef.current).addScaledVector(up, 1.1);

    if (!initializedRef.current) {
      initializedRef.current = true;
      smoothedUp.copy(up);
      smoothedFocus.copy(rawFocus);
    } else {
      smoothedUp.lerp(up, 1 - Math.exp(-CAMERA_UP_LAMBDA * dampingDelta));
      smoothedUp.normalize();

      focusDelta.copy(rawFocus).sub(smoothedFocus);
      focusPlanarDelta.copy(focusDelta).addScaledVector(
        smoothedUp,
        -focusDelta.dot(smoothedUp),
      );

      smoothedFocus.addScaledVector(
        focusPlanarDelta,
        1 - Math.exp(-CAMERA_FOCUS_PLANAR_LAMBDA * dampingDelta),
      );

      const verticalDelta = focusDelta.dot(smoothedUp);
      smoothedFocus.addScaledVector(
        smoothedUp,
        verticalDelta * (1 - Math.exp(-CAMERA_FOCUS_VERTICAL_LAMBDA * dampingDelta)),
      );
    }

    const cameraUp = smoothedUp;
    const referenceAxis = Math.abs(up.dot(referenceAxisA)) > 0.92
      ? referenceAxisB
      : referenceAxisA;

    localEast.crossVectors(referenceAxis, cameraUp).normalize();
    localNorth.crossVectors(cameraUp, localEast).normalize();
    focus.copy(smoothedFocus);

    const planarRadius = Math.cos(pitchRef.current) * radiusRef.current;
    desiredPosition
      .copy(localNorth)
      .multiplyScalar(Math.cos(yawRef.current) * planarRadius)
      .addScaledVector(localEast, Math.sin(yawRef.current) * planarRadius)
      .addScaledVector(cameraUp, -Math.sin(pitchRef.current) * radiusRef.current)
      .add(focus);

    camera.up.copy(cameraUp);
    camera.position.lerp(
      desiredPosition,
      1 - Math.exp(-CAMERA_POSITION_LAMBDA * dampingDelta),
    );
    camera.lookAt(focus);

    desiredViewVector
      .copy(focus)
      .sub(camera.position)
      .addScaledVector(
        cameraUp,
        -focus.clone().sub(camera.position).dot(cameraUp),
      )
      .normalize();
    props.viewVectorRef.current.copy(desiredViewVector);
  });

  return null;
}
