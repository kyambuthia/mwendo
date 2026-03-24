import { useMemo } from "react";
import { DoubleSide, Matrix4, Quaternion, Vector3 } from "three";
import {
  createDemoPlanetGeometry,
  DEMO_PLANET_PLAYER_RIDE_HEIGHT,
  DEMO_PLANET_SPAWN_DIRECTION,
  sampleDemoPlanetSurface,
} from "./demoTerrain";

const spawnDirection = new Vector3(...DEMO_PLANET_SPAWN_DIRECTION).normalize();

export function TerrainArena() {
  const planet = useMemo(() => createDemoPlanetGeometry(), []);
  const spawnSurface = useMemo(
    () => sampleDemoPlanetSurface(spawnDirection),
    [],
  );
  const spawnMarkerPosition = spawnSurface.point
    .clone()
    .addScaledVector(spawnSurface.normal, DEMO_PLANET_PLAYER_RIDE_HEIGHT + 0.03);
  const spawnMarkerQuaternion = useMemo(() => {
    const up = spawnSurface.normal.clone().normalize();
    const tangent = new Vector3(-up.z, 0, up.x);
    if (tangent.lengthSq() < 1e-6) {
      tangent.set(1, 0, 0);
    }
    tangent.normalize();
    const bitangent = new Vector3().crossVectors(up, tangent).normalize();

    return {
      tangent,
      bitangent,
      up,
    };
  }, [spawnSurface.normal]);
  const spawnMarkerRotation = useMemo(() => {
    const basis = new Matrix4().makeBasis(
      spawnMarkerQuaternion.tangent,
      spawnMarkerQuaternion.up,
      spawnMarkerQuaternion.bitangent,
    );
    return new Quaternion().setFromRotationMatrix(basis);
  }, [spawnMarkerQuaternion]);

  return (
    <>
      <mesh castShadow receiveShadow geometry={planet.geometry}>
        <meshStandardMaterial
          color="#66755a"
          metalness={0.02}
          roughness={0.96}
          vertexColors
        />
      </mesh>

      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[160, 40, 40]} />
        <meshBasicMaterial
          color="#c8d8ea"
          side={DoubleSide}
          transparent
          opacity={0.06}
        />
      </mesh>

      <group
        position={spawnMarkerPosition}
        quaternion={spawnMarkerRotation}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.6, 2.2, 48]} />
          <meshBasicMaterial color="#d8ebba" transparent opacity={0.34} />
        </mesh>
      </group>
    </>
  );
}
