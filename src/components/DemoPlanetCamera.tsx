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
const desiredPosition = new Vector3();
const desiredViewVector = new Vector3();

export function DemoPlanetCamera(props: {
  positionRef: MutableRefObject<Vector3>;
  upRef: MutableRefObject<Vector3>;
  viewVectorRef: MutableRefObject<Vector3>;
}) {
  const { camera, gl } = useThree();
  const yawRef = useRef(Math.PI * 0.14);
  const pitchRef = useRef(-0.34);
  const radiusRef = useRef(7.4);

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
    const up = props.upRef.current.clone().normalize();
    const referenceAxis = Math.abs(up.dot(referenceAxisA)) > 0.92
      ? referenceAxisB
      : referenceAxisA;

    localEast.crossVectors(referenceAxis, up).normalize();
    localNorth.crossVectors(up, localEast).normalize();
    focus.copy(props.positionRef.current).addScaledVector(up, 1.1);

    const planarRadius = Math.cos(pitchRef.current) * radiusRef.current;
    desiredPosition
      .copy(localNorth)
      .multiplyScalar(Math.cos(yawRef.current) * planarRadius)
      .addScaledVector(localEast, Math.sin(yawRef.current) * planarRadius)
      .addScaledVector(up, Math.sin(pitchRef.current) * radiusRef.current)
      .add(focus);

    camera.up.copy(up);
    camera.position.lerp(desiredPosition, 1 - Math.exp(-10 * Math.min(dt, 1 / 20)));
    camera.lookAt(focus);

    desiredViewVector
      .copy(focus)
      .sub(camera.position)
      .addScaledVector(up, -focus.clone().sub(camera.position).dot(up))
      .normalize();
    props.viewVectorRef.current.copy(desiredViewVector);
  });

  return null;
}
