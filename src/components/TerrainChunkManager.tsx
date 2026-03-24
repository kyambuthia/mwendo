import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState, type MutableRefObject } from "react";
import { Vector3 } from "three";
import { RigidBody } from "@react-three/rapier";
import {
  buildAllChunkDefs,
  buildChunkGeometry,
  CHUNK_NEAR_SEGS,
  CHUNK_FAR_SEGS,
  PHYSICS_CHUNK_COUNT,
  type ChunkDef,
} from "./demoTerrainChunks";
import { topographicMaterialOnBeforeCompile } from "./demoTerrain";

const PHYSICS_CHECK_INTERVAL = 0.4; // seconds between LOD re-evaluations

function nearestChunkSet(
  chunks: ChunkDef[],
  playerDir: Vector3,
  count: number,
): Set<number> {
  return new Set(
    chunks
      .map((c, i) => ({ i, dot: c.centerDir.dot(playerDir) }))
      .sort((a, b) => b.dot - a.dot)
      .slice(0, count)
      .map((x) => x.i),
  );
}

const TerrainMaterial = (
  <meshStandardMaterial
    color="#ffffff"
    vertexColors
    metalness={0.02}
    roughness={0.96}
    onBeforeCompile={topographicMaterialOnBeforeCompile}
  />
);

export function TerrainChunkManager(props: {
  positionRef: MutableRefObject<Vector3>;
}) {
  const chunks = useMemo(() => buildAllChunkDefs(), []);

  // Pre-build geometries for both LOD tiers at startup (once, never rebuilt)
  const nearGeos = useMemo(
    () => chunks.map((c) => buildChunkGeometry(c.faceIdx, c.gu, c.gv, CHUNK_NEAR_SEGS)),
    [chunks],
  );
  const farGeos = useMemo(
    () => chunks.map((c) => buildChunkGeometry(c.faceIdx, c.gu, c.gv, CHUNK_FAR_SEGS)),
    [chunks],
  );

  const playerDir = useRef(new Vector3(0, 0, 1));
  const checkTimer = useRef(0);

  const [physicsSet, setPhysicsSet] = useState<Set<number>>(
    () => nearestChunkSet(chunks, playerDir.current, PHYSICS_CHUNK_COUNT),
  );

  useFrame((_, dt) => {
    checkTimer.current += dt;
    if (checkTimer.current < PHYSICS_CHECK_INTERVAL) return;
    checkTimer.current = 0;

    const pos = props.positionRef.current;
    const len = pos.length();
    if (len < 0.001) return;

    playerDir.current.copy(pos).divideScalar(len);
    setPhysicsSet(nearestChunkSet(chunks, playerDir.current, PHYSICS_CHUNK_COUNT));
  });

  return (
    <>
      {chunks.map((chunk, i) => {
        const isNear = physicsSet.has(i);
        const geometry = isNear ? nearGeos[i]! : farGeos[i]!;

        if (isNear) {
          return (
            <RigidBody key={`${chunk.id}-phys`} type="fixed" colliders="trimesh">
              <mesh geometry={geometry} castShadow receiveShadow>
                {TerrainMaterial}
              </mesh>
            </RigidBody>
          );
        }

        return (
          <mesh key={`${chunk.id}-vis`} geometry={geometry} castShadow receiveShadow>
            {TerrainMaterial}
          </mesh>
        );
      })}
    </>
  );
}
