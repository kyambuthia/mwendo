export function Lights(props: {
  planetMode?: boolean;
}) {
  if (props.planetMode) {
    return (
      <>
        <ambientLight intensity={0.2} />
        <hemisphereLight
          args={["#d7e8ff", "#10203b", 0.4]}
        />
        <directionalLight
          castShadow
          intensity={2.2}
          color="#fff2cf"
          position={[54, 26, 34]}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={120}
          shadow-camera-left={-45}
          shadow-camera-right={45}
          shadow-camera-top={45}
          shadow-camera-bottom={-45}
        />
      </>
    );
  }

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        castShadow
        intensity={1.45}
        position={[10, 18, 8]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
    </>
  );
}
