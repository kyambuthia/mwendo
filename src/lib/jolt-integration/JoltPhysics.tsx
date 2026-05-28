/**
 * Minimal JoltPhysics integration — no rapier compat, raw Jolt API.
 *
 * Based on the official JoltPhysics.js examples (example.js / falling_shapes.html).
 * Usage:
 *   <JoltPhysics gravity={[0, -9.81, 0]}>
 *     <YourScene />
 *   </JoltPhysics>
 *
 * Then useJolt() anywhere inside to get:
 *   { Jolt, bodyInterface, physicsSystem, step }
 */

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JoltContextValue = {
  Jolt: any;
  joltInterface: any;
  physicsSystem: any;
  bodyInterface: any;
  step: (dt: number) => void;
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

const JoltContext = createContext<JoltContextValue | null>(null);

let _joltModule: any = null;
let _joltPromise: Promise<any> | null = null;

async function loadJolt(): Promise<any> {
  if (_joltModule) return _joltModule;
  if (_joltPromise) return _joltPromise;

  _joltPromise = import("jolt-physics/wasm-compat").then(async (mod) => {
    const initFn = mod.default ?? mod;
    const Jolt = await initFn();
    _joltModule = Jolt;
    return Jolt;
  });

  return _joltPromise;
}

// ---------------------------------------------------------------------------
// Layer constants (follow official example pattern)
// ---------------------------------------------------------------------------

const LAYER_NON_MOVING = 0;
const LAYER_MOVING = 1;
const NUM_OBJECT_LAYERS = 2;
const NUM_BP_LAYERS = 2;

function setupCollisionFiltering(Jolt: any, settings: any) {
  // Object layer pair filter: which layers collide
  const objectFilter = new Jolt.ObjectLayerPairFilterTable(NUM_OBJECT_LAYERS);
  objectFilter.EnableCollision(LAYER_NON_MOVING, LAYER_MOVING);
  objectFilter.EnableCollision(LAYER_MOVING, LAYER_MOVING);

  // Broadphase layer interface: maps object layers → broadphase layers
  const bpInterface = new Jolt.BroadPhaseLayerInterfaceTable(NUM_OBJECT_LAYERS, NUM_BP_LAYERS);
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_NON_MOVING, new Jolt.BroadPhaseLayer(0));
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_MOVING, new Jolt.BroadPhaseLayer(1));

  settings.mObjectLayerPairFilter = objectFilter;
  settings.mBroadPhaseLayerInterface = bpInterface;
  settings.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(
    settings.mBroadPhaseLayerInterface,
    NUM_BP_LAYERS,
    settings.mObjectLayerPairFilter,
    NUM_OBJECT_LAYERS,
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function JoltPhysics({
  children,
  gravity = [0, -9.81, 0],
  paused = false,
}: {
  children: ReactNode;
  gravity?: [number, number, number];
  paused?: boolean;
}) {
  const [ctx, setCtx] = useState<JoltContextValue | null>(null);
  const stateRef = useRef<any>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let disposed = false;

    loadJolt().then((Jolt) => {
      if (disposed) return;

      const settings = new Jolt.JoltSettings();
      setupCollisionFiltering(Jolt, settings);

      const joltInterface = new Jolt.JoltInterface(settings);
      Jolt.destroy(settings);

      const physicsSystem = joltInterface.GetPhysicsSystem();
      const bodyInterface = physicsSystem.GetBodyInterface();

      const gravVec = new Jolt.Vec3(gravity[0], gravity[1], gravity[2]);
      physicsSystem.SetGravity(gravVec);
      Jolt.destroy(gravVec);

      stateRef.current = {
        Jolt,
        joltInterface,
        physicsSystem,
        bodyInterface,
      };

      setCtx({
        Jolt,
        joltInterface,
        physicsSystem,
        bodyInterface,
        step: (dt: number) => {
          joltInterface.Step(Math.min(dt, 1 / 30), 1);
        },
      });
    });

    return () => {
      disposed = true;
      stateRef.current = null;
    };
  }, []);

  useFrame((_, delta) => {
    if (!stateRef.current || pausedRef.current) return;
    stateRef.current.joltInterface.Step(Math.min(delta, 1 / 30), 1);
  });

  if (!ctx) return null;

  return createElement(JoltContext.Provider, { value: ctx }, children);
}

export function useJolt(): JoltContextValue {
  const ctx = useContext(JoltContext);
  if (!ctx) throw new Error("useJolt must be used inside <JoltPhysics>");
  return ctx;
}

export { LAYER_NON_MOVING, LAYER_MOVING };
