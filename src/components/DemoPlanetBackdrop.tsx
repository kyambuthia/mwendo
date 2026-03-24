import { Stars } from "@react-three/drei";

export function DemoPlanetBackdrop() {
  return (
    <>
      <Stars
        radius={260}
        depth={90}
        count={4500}
        factor={5.6}
        saturation={0}
        fade
        speed={0.2}
      />

      <mesh position={[140, 92, -110]}>
        <sphereGeometry args={[13, 28, 28]} />
        <meshBasicMaterial color="#f8e8be" transparent opacity={0.96} />
      </mesh>

      <mesh position={[140, 92, -110]} scale={1.6}>
        <sphereGeometry args={[13, 20, 20]} />
        <meshBasicMaterial color="#f6d18c" transparent opacity={0.08} />
      </mesh>
    </>
  );
}
