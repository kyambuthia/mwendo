import { useMemo } from "react";
import { BackSide, DoubleSide, Matrix4, Quaternion, Vector3 } from "three";
import {
  DEMO_PLANET_RADIUS,
  DEMO_PLANET_PLAYER_RIDE_HEIGHT,
  DEMO_PLANET_SPAWN_DIRECTION,
  getDemoPlanetObstacles,
  sampleDemoPlanetSurface,
} from "./demoTerrain";

const spawnDirection = new Vector3(...DEMO_PLANET_SPAWN_DIRECTION).normalize();

export function TerrainArena() {
  const obstacles = useMemo(() => getDemoPlanetObstacles(), []);
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
      <mesh position={[0, 0, 0]} scale={1.028}>
        <sphereGeometry args={[DEMO_PLANET_RADIUS, 64, 64]} />
        <meshBasicMaterial
          color="#87b7ff"
          side={BackSide}
          transparent
          opacity={0.18}
        />
      </mesh>

      <mesh position={[0, 0, 0]} scale={1.04}>
        <sphereGeometry args={[DEMO_PLANET_RADIUS, 64, 64]} />
        <meshBasicMaterial
          color="#6ec5ff"
          side={BackSide}
          transparent
          opacity={0.05}
        />
      </mesh>

      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[160, 40, 40]} />
        <meshBasicMaterial
          color="#8db5ff"
          side={DoubleSide}
          transparent
          opacity={0.045}
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

      {obstacles.map((obstacle, index) => (
        <group
          key={`${obstacle.shape}-${index}`}
          position={obstacle.base}
          quaternion={obstacle.quaternion}
        >
          {obstacle.shape === "column" ? (
            <>
              <mesh castShadow receiveShadow position={[0, obstacle.height * 0.46, 0]}>
                <cylinderGeometry
                  args={[
                    obstacle.radius * 0.72,
                    obstacle.radius,
                    obstacle.height,
                    8,
                  ]}
                />
                <meshStandardMaterial
                  color={obstacle.color}
                  metalness={0.03}
                  roughness={0.94}
                />
              </mesh>
              <mesh castShadow receiveShadow position={[0, obstacle.height * 0.98, 0]}>
                <dodecahedronGeometry args={[obstacle.radius * 0.48, 0]} />
                <meshStandardMaterial
                  color="#a9a08f"
                  metalness={0.02}
                  roughness={0.9}
                />
              </mesh>
            </>
          ) : (
            <mesh castShadow receiveShadow position={[0, obstacle.height * 0.5, 0]}>
              <dodecahedronGeometry args={[obstacle.radius, 0]} />
              <meshStandardMaterial
                color={obstacle.color}
                metalness={0.02}
                roughness={0.96}
              />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}
