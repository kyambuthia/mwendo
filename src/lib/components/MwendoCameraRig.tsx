import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Euler, Object3D, Raycaster, Vector3 } from "three";
import { useMwendoStore, useMwendoStoreApi } from "../MwendoProvider";
import type { MwendoVec3 } from "../types";

const focus = new Vector3();
const desiredPosition = new Vector3();
const correctedPosition = new Vector3();
const rayDirection = new Vector3();
const rotation = new Euler(0, 0, 0, "YXZ");
const occlusionRaycaster = new Raycaster();
const MWENDO_IGNORE_CAMERA_OCCLUSION = "mwendoIgnoreCameraOcclusion";

function shouldIgnoreCameraOcclusion(object: Object3D | null) {
  let current: Object3D | null = object;

  while (current) {
    if (current.userData?.[MWENDO_IGNORE_CAMERA_OCCLUSION]) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

export type MwendoCameraRigProps = {
  followOffset?: MwendoVec3;
  focusHeight?: number;
  pointerLock?: boolean;
  yawSensitivity?: number;
  pitchSensitivity?: number;
  smoothing?: number;
  collisionEnabled?: boolean;
  collisionPadding?: number;
  minCollisionDistance?: number;
};

export function MwendoCameraRig({
  followOffset = [0, 1.85, 5.1],
  focusHeight = 1.2,
  pointerLock = true,
  yawSensitivity = 0.0026,
  pitchSensitivity = 0.002,
  smoothing = 8,
  collisionEnabled = true,
  collisionPadding = 0.18,
  minCollisionDistance = 1.2,
}: MwendoCameraRigProps) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const adjustCamera = useMwendoStore((state) => state.adjustCamera);
  const storeApi = useMwendoStoreApi();
  const offset = useMemo(
    () => new Vector3(...followOffset),
    [followOffset],
  );

  useEffect(() => {
    if (!pointerLock) {
      return;
    }

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

      adjustCamera(
        -event.movementX * yawSensitivity,
        -event.movementY * pitchSensitivity,
      );
    };

    element.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("mousemove", onMouseMove);

    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [adjustCamera, gl, pitchSensitivity, pointerLock, yawSensitivity]);

  useFrame((_, delta) => {
    const state = storeApi.getState();
    const [x, y, z] = state.playerPosition;

    focus.set(x, y + focusHeight, z);
    rotation.set(state.cameraPitch, state.cameraYaw, 0);
    desiredPosition.copy(offset).applyEuler(rotation).add(focus);

    let targetPosition = desiredPosition;

    if (collisionEnabled) {
      rayDirection.subVectors(desiredPosition, focus);
      const desiredDistance = rayDirection.length();

      if (desiredDistance > 0.001) {
        rayDirection.normalize();
        occlusionRaycaster.set(focus, rayDirection);
        occlusionRaycaster.camera = camera;
        occlusionRaycaster.far = desiredDistance;

        const occluder = occlusionRaycaster
          .intersectObjects(scene.children, true)
          .find(
            (intersection) =>
              !shouldIgnoreCameraOcclusion(intersection.object),
          );

        if (occluder) {
          const safeDistance = Math.max(
            minCollisionDistance,
            occluder.distance - collisionPadding,
          );
          correctedPosition
            .copy(focus)
            .addScaledVector(rayDirection, safeDistance);
          targetPosition = correctedPosition;
        }
      }
    }

    camera.position.lerp(
      targetPosition,
      1 - Math.exp(-delta * smoothing),
    );
    camera.lookAt(focus);
  });

  return null;
}
