/**
 * Minimal Jolt integration test.
 * Load via ?mode=jolt-test
 *
 * Exercises:
 *   1. WASM init + physics stepping
 *   2. Static floor + dynamic box creation
 *   3. Body transform sync to Three.js mesh
 *   4. Gravity making the box fall and land
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3 } from "three";
import {
  JoltPhysics,
  useJolt,
  LAYER_NON_MOVING,
  LAYER_MOVING,
} from "../lib/jolt-integration/JoltPhysics";

// ---------------------------------------------------------------------------
// Falling box
// ---------------------------------------------------------------------------

function FallingBox() {
  const { Jolt, bodyInterface } = useJolt();
  const meshRef = useRef<any>(null);
  const bodyRef = useRef<any>(null);
  const spawnedRef = useRef(false);

  // Create body once
  if (!spawnedRef.current && meshRef.current) {
    spawnedRef.current = true;

    // Shape: 1×1×1 box
    const halfExtent = new Jolt.Vec3(0.5, 0.5, 0.5);
    const shape = new Jolt.BoxShape(halfExtent, 0.05, null);
    Jolt.destroy(halfExtent);

    // Body at (0, 4, 0)
    const pos = new Jolt.RVec3(0, 4, 0);
    const rot = Jolt.Quat.prototype.sIdentity();
    const settings = new Jolt.BodyCreationSettings(
      shape, pos, rot, Jolt.EMotionType_Dynamic, LAYER_MOVING,
    );
    settings.mRestitution = 0.0;
    settings.mFriction = 0.6;

    const body = bodyInterface.CreateBody(settings);
    bodyInterface.AddBody(body.GetID(), Jolt.EActivation_Activate);

    bodyRef.current = body;

    Jolt.destroy(pos);
    Jolt.destroy(settings);
  }

  // Sync body → mesh
  useFrame(() => {
    const body = bodyRef.current;
    const mesh = meshRef.current;
    if (!body || !mesh) return;

    const pos = body.GetPosition();
    const rot = body.GetRotation();
    mesh.position.set(pos.GetX(), pos.GetY(), pos.GetZ());
    mesh.quaternion.set(rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW());
  });

  return (
    <mesh ref={meshRef} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#4af" />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Floor
// ---------------------------------------------------------------------------

function Floor() {
  const { Jolt, bodyInterface } = useJolt();
  const meshRef = useRef<any>(null);
  const spawnedRef = useRef(false);

  if (!spawnedRef.current && meshRef.current) {
    spawnedRef.current = true;

    const halfExtent = new Jolt.Vec3(10, 0.1, 10);
    const shape = new Jolt.BoxShape(halfExtent, 0.05, null);
    Jolt.destroy(halfExtent);

    const pos = new Jolt.RVec3(0, 0, 0);
    const rot = Jolt.Quat.prototype.sIdentity();
    const settings = new Jolt.BodyCreationSettings(
      shape, pos, rot, Jolt.EMotionType_Static, LAYER_NON_MOVING,
    );

    const body = bodyInterface.CreateBody(settings);
    bodyInterface.AddBody(body.GetID(), Jolt.EActivation_Activate);

    meshRef.current.userData.body = body;

    Jolt.destroy(pos);
    Jolt.destroy(settings);
  }

  return (
    <mesh ref={meshRef} receiveShadow position={[0, -0.1, 0]}>
      <boxGeometry args={[20, 0.2, 20]} />
      <meshStandardMaterial color="#556" />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export function JoltMinimalTest() {
  return (
    <JoltPhysics gravity={[0, -9.81, 0]}>
      <Floor />
      <FallingBox />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1} />
    </JoltPhysics>
  );
}
