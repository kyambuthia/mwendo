import {
  Color,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";

export const DEMO_PLANET_RADIUS = 28;
export const DEMO_PLANET_DETAIL = 5;
export const DEMO_PLANET_PLAYER_RIDE_HEIGHT = 0.6;
export const DEMO_PLANET_PLAYER_SPAWN_CLEARANCE =
  DEMO_PLANET_PLAYER_RIDE_HEIGHT + 0.04;
export const DEMO_PLANET_RAGDOLL_SPAWN_CLEARANCE = 2.8;
export const DEMO_PLANET_DUMMY_SPAWN_CLEARANCE = 4.6;
export const DEMO_PLANET_SPAWN_DIRECTION: [number, number, number] = [
  0.22,
  0.14,
  0.965,
];
export const DEMO_PLANET_DUMMY_DIRECTION: [number, number, number] = [
  -0.42,
  0.26,
  0.868,
];
export const DEMO_PLANET_OBSTACLE_DEFS = [
  {
    direction: [0.35, 0.18, 0.92] as [number, number, number],
    radius: 1.2,
    height: 2.4,
    color: "#6f655c",
    shape: "boulder" as const,
    twist: 0.3,
  },
  {
    direction: [0.08, 0.29, 0.954] as [number, number, number],
    radius: 0.95,
    height: 3.6,
    color: "#807768",
    shape: "column" as const,
    twist: -0.55,
  },
  {
    direction: [-0.18, 0.12, 0.976] as [number, number, number],
    radius: 1.35,
    height: 2.8,
    color: "#5d564f",
    shape: "boulder" as const,
    twist: 0.72,
  },
  {
    direction: [0.31, -0.09, 0.946] as [number, number, number],
    radius: 0.9,
    height: 4.1,
    color: "#8a7f72",
    shape: "column" as const,
    twist: -0.18,
  },
];

const normalizedDirection = new Vector3();
const tangentA = new Vector3();
const tangentB = new Vector3();
const sampleA = new Vector3();
const sampleB = new Vector3();
const sampleCenter = new Vector3();
const surfaceNormal = new Vector3();
const surfaceColor = new Color();
const lowColor = new Color();
const midColor = new Color();
const highColor = new Color();
const rockColor = new Color();
const shadeColor = new Color();
const spawnDirectionVector = new Vector3(...DEMO_PLANET_SPAWN_DIRECTION).normalize();
const dummyDirectionVector = new Vector3(...DEMO_PLANET_DUMMY_DIRECTION).normalize();
const basisUp = new Vector3();
const basisTangent = new Vector3();
const basisBitangent = new Vector3();
const basisTwistedTangent = new Vector3();
const basisTwistedBitangent = new Vector3();
const basisMatrix = new Matrix4();
const polarColor = new Color();

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash3(x: number, y: number, z: number) {
  const value = Math.sin(x * 127.1 + y * 311.7 + z * 191.999) * 43758.5453123;
  return value - Math.floor(value);
}

function valueNoise3(x: number, y: number, z: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;
  const sx = smoothstep(0, 1, x - x0);
  const sy = smoothstep(0, 1, y - y0);
  const sz = smoothstep(0, 1, z - z0);

  const n000 = hash3(x0, y0, z0);
  const n100 = hash3(x1, y0, z0);
  const n010 = hash3(x0, y1, z0);
  const n110 = hash3(x1, y1, z0);
  const n001 = hash3(x0, y0, z1);
  const n101 = hash3(x1, y0, z1);
  const n011 = hash3(x0, y1, z1);
  const n111 = hash3(x1, y1, z1);

  const nx00 = n000 + (n100 - n000) * sx;
  const nx10 = n010 + (n110 - n010) * sx;
  const nx01 = n001 + (n101 - n001) * sx;
  const nx11 = n011 + (n111 - n011) * sx;
  const nxy0 = nx00 + (nx10 - nx00) * sy;
  const nxy1 = nx01 + (nx11 - nx01) * sy;

  return nxy0 + (nxy1 - nxy0) * sz;
}

function fbm3(
  x: number,
  y: number,
  z: number,
  octaves: number,
  lacunarity: number,
  gain: number,
) {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  let normalizer = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    sum += (valueNoise3(x * frequency, y * frequency, z * frequency) * 2 - 1) * amplitude;
    normalizer += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return normalizer > 0 ? sum / normalizer : 0;
}

function ridgeNoise3(x: number, y: number, z: number) {
  return 1 - Math.abs(fbm3(x, y, z, 4, 2.05, 0.52));
}

function tupleDirectionToVector(
  tuple: [number, number, number],
  out = new Vector3(),
) {
  return out.set(tuple[0], tuple[1], tuple[2]).normalize();
}

function angleBetweenDirections(a: Vector3, b: Vector3) {
  return Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
}

function flattenAroundDirection(
  height: number,
  direction: Vector3,
  padDirection: Vector3,
  padRadius: number,
  padBlend: number,
  targetHeight: number,
) {
  const angle = angleBetweenDirections(direction, padDirection);
  const blend = 1 - smoothstep(padRadius, padRadius + padBlend, angle);
  return height * (1 - blend) + targetHeight * blend;
}

export function sampleDemoPlanetHeight(direction: Vector3 | [number, number, number]) {
  const dir = Array.isArray(direction)
    ? tupleDirectionToVector(direction, normalizedDirection)
    : normalizedDirection.copy(direction).normalize();

  const warpX = dir.x + fbm3(dir.x * 2.8 + 4.3, dir.y * 2.8 - 1.2, dir.z * 2.8 + 6.1, 3, 2, 0.5) * 0.28;
  const warpY = dir.y + fbm3(dir.x * 3.1 - 2.7, dir.y * 3.1 + 3.4, dir.z * 3.1 + 0.8, 3, 2.1, 0.5) * 0.28;
  const warpZ = dir.z + fbm3(dir.x * 2.6 + 1.6, dir.y * 2.6 + 5.7, dir.z * 2.6 - 2.4, 3, 2.05, 0.5) * 0.28;

  const continental = fbm3(warpX * 2.1, warpY * 2.1, warpZ * 2.1, 5, 2.02, 0.52) * 2.5;
  const ridges = ridgeNoise3(warpX * 4.8, warpY * 4.8, warpZ * 4.8) * 1.8;
  const detail = fbm3(warpX * 12.5, warpY * 12.5, warpZ * 12.5, 4, 2.2, 0.46) * 0.35;
  const basin =
    -Math.exp(-((dir.x - 0.18) ** 2 + (dir.y + 0.26) ** 2 + (dir.z - 0.74) ** 2) / 0.09) * 1.2;
  const uplift =
    Math.exp(-((dir.x + 0.52) ** 2 + (dir.y - 0.08) ** 2 + (dir.z - 0.44) ** 2) / 0.06) * 1.4;

  let height = continental + ridges + detail + basin + uplift;

  height = flattenAroundDirection(height, dir, spawnDirectionVector, 0.09, 0.08, 0.45);
  height = flattenAroundDirection(height, dir, dummyDirectionVector, 0.08, 0.07, 0.22);

  return height;
}

export function sampleDemoPlanetSurface(
  direction: Vector3 | [number, number, number],
) {
  const dir = Array.isArray(direction)
    ? tupleDirectionToVector(direction, normalizedDirection)
    : normalizedDirection.copy(direction).normalize();
  const height = sampleDemoPlanetHeight(dir);
  const radius = DEMO_PLANET_RADIUS + height;
  const point = dir.clone().multiplyScalar(radius);

  return {
    point,
    normal: dir.clone(),
    height,
    radius,
  };
}

export function sampleDemoPlanetSurfaceAtPosition(position: Vector3 | [number, number, number]) {
  const dir = Array.isArray(position)
    ? tupleDirectionToVector(position, normalizedDirection)
    : normalizedDirection.copy(position).normalize();

  return sampleDemoPlanetSurface(dir);
}

export function writeDemoPlanetColorFromHeight(
  direction: Vector3,
  height: number,
  surfaceSlope: number,
  out = new Color(),
) {
  const height01 = smoothstep(-1.2, 3.2, height);
  const rock01 = smoothstep(0.08, 0.34, surfaceSlope);
  const polar01 = smoothstep(0.68, 0.94, Math.abs(direction.y));

  lowColor.setRGB(0.23, 0.36, 0.21);
  midColor.setRGB(0.52, 0.58, 0.33);
  highColor.setRGB(0.74, 0.7, 0.62);
  rockColor.setRGB(0.44, 0.42, 0.41);
  shadeColor.setRGB(0.18, 0.2, 0.18);
  polarColor.setRGB(0.86, 0.87, 0.9);

  out.copy(lowColor).lerp(midColor, height01 * 0.72);
  out.lerp(highColor, Math.max(0, height01 - 0.35) * 0.75);
  out.lerp(rockColor, rock01 * 0.85);
  out.lerp(polarColor, polar01 * 0.45);
  out.lerp(shadeColor, surfaceSlope * 0.18);

  return out;
}

export function writeDemoPlanetColor(
  direction: Vector3,
  surfaceSlope: number,
  out = new Color(),
) {
  const height = sampleDemoPlanetHeight(direction);
  return writeDemoPlanetColorFromHeight(direction, height, surfaceSlope, out);
}

export function sampleDemoPlanetNormal(
  direction: Vector3 | [number, number, number],
  sampleOffset = 0.012,
) {
  const dir = Array.isArray(direction)
    ? tupleDirectionToVector(direction, normalizedDirection)
    : normalizedDirection.copy(direction).normalize();

  tangentA.set(-dir.z, 0, dir.x);
  if (tangentA.lengthSq() < 1e-6) {
    tangentA.set(1, 0, 0);
  }
  tangentA.normalize();
  tangentB.crossVectors(dir, tangentA).normalize();

  sampleCenter.copy(sampleDemoPlanetSurface(dir).point);
  sampleA
    .copy(dir)
    .addScaledVector(tangentA, sampleOffset)
    .normalize();
  sampleB
    .copy(dir)
    .addScaledVector(tangentB, sampleOffset)
    .normalize();

  sampleA.copy(sampleDemoPlanetSurface(sampleA).point);
  sampleB.copy(sampleDemoPlanetSurface(sampleB).point);
  tangentA.subVectors(sampleA, sampleCenter);
  tangentB.subVectors(sampleB, sampleCenter);
  surfaceNormal.crossVectors(tangentA, tangentB).normalize();

  if (surfaceNormal.dot(sampleCenter) < 0) {
    surfaceNormal.multiplyScalar(-1);
  }

  return surfaceNormal.clone();
}

export function getDemoPlanetSpawnPosition(
  direction: [number, number, number],
  clearance: number,
): [number, number, number] {
  const surface = sampleDemoPlanetSurface(direction);
  const point = surface.point.addScaledVector(surface.normal, clearance);
  return [point.x, point.y, point.z];
}

export function createSurfaceFrameQuaternion(
  normal: Vector3,
  twist = 0,
) {
  basisUp.copy(normal).normalize();
  basisTangent.set(-basisUp.z, 0, basisUp.x);
  if (basisTangent.lengthSq() < 1e-6) {
    basisTangent.set(1, 0, 0);
  }
  basisTangent.normalize();
  basisBitangent.crossVectors(basisUp, basisTangent).normalize();
  basisTwistedTangent
    .copy(basisTangent)
    .multiplyScalar(Math.cos(twist))
    .addScaledVector(basisBitangent, Math.sin(twist))
    .normalize();
  basisTwistedBitangent.crossVectors(basisUp, basisTwistedTangent).normalize();

  basisMatrix.makeBasis(basisTwistedTangent, basisUp, basisTwistedBitangent);
  return new Quaternion().setFromRotationMatrix(basisMatrix);
}

export function getDemoPlanetObstacles() {
  return DEMO_PLANET_OBSTACLE_DEFS.map((definition) => {
    const surface = sampleDemoPlanetSurface(definition.direction);
    const center = surface.point
      .clone()
      .addScaledVector(surface.normal, definition.height * 0.45);

    return {
      ...definition,
      base: surface.point,
      center,
      normal: surface.normal,
      quaternion: createSurfaceFrameQuaternion(surface.normal, definition.twist),
    };
  });
}

export function createDemoPlanetGeometry() {
  const geometry = new IcosahedronGeometry(DEMO_PLANET_RADIUS, DEMO_PLANET_DETAIL);
  const positionAttribute = geometry.getAttribute("position");
  const positions = positionAttribute.array as Float32Array;

  for (let index = 0; index < positions.length; index += 3) {
    normalizedDirection
      .set(positions[index] ?? 0, positions[index + 1] ?? 0, positions[index + 2] ?? 0)
      .normalize();
    const surface = sampleDemoPlanetSurface(normalizedDirection);
    positions[index] = surface.point.x;
    positions[index + 1] = surface.point.y;
    positions[index + 2] = surface.point.z;
  }

  positionAttribute.needsUpdate = true;
  geometry.computeVertexNormals();

  const normalAttribute = geometry.getAttribute("normal");
  const normals = normalAttribute.array as Float32Array;
  const colors = new Float32Array((positions.length / 3) * 3);

  for (let index = 0; index < positions.length; index += 3) {
    const px = positions[index] ?? 0;
    const py = positions[index + 1] ?? 0;
    const pz = positions[index + 2] ?? 0;
    normalizedDirection.set(px, py, pz).normalize();
    const radius = Math.sqrt(px * px + py * py + pz * pz);
    const height = radius - DEMO_PLANET_RADIUS;
    const slope = 1 - Math.max(
      0,
      normals[index] * normalizedDirection.x +
        normals[index + 1] * normalizedDirection.y +
        normals[index + 2] * normalizedDirection.z,
    );

    writeDemoPlanetColorFromHeight(normalizedDirection, height, slope, surfaceColor);

    colors[index] = surfaceColor.r;
    colors[index + 1] = surfaceColor.g;
    colors[index + 2] = surfaceColor.b;
  }

  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  return {
    geometry,
  };
}

export const topographicMaterialOnBeforeCompile = (shader: any) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
varying vec3 vWorldSpacePosition;`
  ).replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
vWorldSpacePosition = (modelMatrix * vec4(position, 1.0)).xyz;`
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>
varying vec3 vWorldSpacePosition;`
  ).replace(
    '#include <dithering_fragment>',
    `#include <dithering_fragment>
float topoScale = 4.0;
float topoDist = length(vWorldSpacePosition) * topoScale;
float topoLine = abs(fract(topoDist - 0.5) - 0.5) / fwidth(topoDist);
float topoWeight = 1.0 - smoothstep(0.0, 1.5, topoLine);
gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.4, topoWeight * 0.8);`
  );
};
