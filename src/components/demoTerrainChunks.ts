import { BufferAttribute, BufferGeometry, Color, Vector3 } from "three";
import {
  DEMO_PLANET_RADIUS,
  sampleDemoPlanetHeight,
  writeDemoPlanetColorFromHeight,
} from "./demoTerrain";

/**
 * Cubed-sphere face bases.
 * Each entry: [forward, tangent, bitangent] where tangent × bitangent = forward
 * (outward-pointing normal direction; ensures CCW winding from outside).
 */
export const CUBE_FACE_BASES = [
  { f: [1, 0, 0],  t: [0, 1, 0],  b: [0, 0, 1]  }, // +X
  { f: [-1, 0, 0], t: [0, 1, 0],  b: [0, 0, -1] }, // -X
  { f: [0, 1, 0],  t: [1, 0, 0],  b: [0, 0, -1] }, // +Y
  { f: [0, -1, 0], t: [1, 0, 0],  b: [0, 0, 1]  }, // -Y
  { f: [0, 0, 1],  t: [1, 0, 0],  b: [0, 1, 0]  }, // +Z
  { f: [0, 0, -1], t: [-1, 0, 0], b: [0, 1, 0]  }, // -Z
] as const;

/** Patches per face axis → 6 × GRID × GRID total patches. */
export const CHUNK_FACE_GRID = 4;

/** Vertex segments for near (physics) patches. */
export const CHUNK_NEAR_SEGS = 16;

/** Vertex segments for far (visual-only) patches. */
export const CHUNK_FAR_SEGS = 8;

/** How many nearest patches receive a Rapier TrimeshCollider. */
export const PHYSICS_CHUNK_COUNT = 9;

const _dir = new Vector3();
const _color = new Color();

function cubedSphereDir(
  face: (typeof CUBE_FACE_BASES)[number],
  u: number,
  v: number,
  out: Vector3,
) {
  out
    .set(
      face.f[0] + face.t[0] * u + face.b[0] * v,
      face.f[1] + face.t[1] * u + face.b[1] * v,
      face.f[2] + face.t[2] * u + face.b[2] * v,
    )
    .normalize();
}

export function buildChunkGeometry(
  faceIdx: number,
  gu: number,
  gv: number,
  segs: number,
): BufferGeometry {
  const face = CUBE_FACE_BASES[faceIdx]!;
  const stride = segs + 1;
  const vertCount = stride * stride;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);

  // Cube-face UV range for this patch
  const uMin = (gu / CHUNK_FACE_GRID) * 2 - 1;
  const uMax = ((gu + 1) / CHUNK_FACE_GRID) * 2 - 1;
  const vMin = (gv / CHUNK_FACE_GRID) * 2 - 1;
  const vMax = ((gv + 1) / CHUNK_FACE_GRID) * 2 - 1;

  // Center height for pseudo-slope colouring
  cubedSphereDir(face, (uMin + uMax) * 0.5, (vMin + vMax) * 0.5, _dir);
  const centerH = sampleDemoPlanetHeight(_dir);

  for (let row = 0; row <= segs; row++) {
    const v = vMin + (row / segs) * (vMax - vMin);
    for (let col = 0; col <= segs; col++) {
      const u = uMin + (col / segs) * (uMax - uMin);
      const off = (row * stride + col) * 3;

      cubedSphereDir(face, u, v, _dir);
      const h = sampleDemoPlanetHeight(_dir);
      const r = DEMO_PLANET_RADIUS + h;

      positions[off]     = _dir.x * r;
      positions[off + 1] = _dir.y * r;
      positions[off + 2] = _dir.z * r;

      const slope = Math.min(1, Math.abs(h - centerH) * 0.26);
      writeDemoPlanetColorFromHeight(_dir, h, slope, _color);
      colors[off]     = _color.r;
      colors[off + 1] = _color.g;
      colors[off + 2] = _color.b;
    }
  }

  // Indexed triangles — CCW from outside
  const indices = new Uint32Array(segs * segs * 6);
  let idx = 0;
  for (let row = 0; row < segs; row++) {
    for (let col = 0; col < segs; col++) {
      const a = row * stride + col;
      const b = row * stride + col + 1;
      const c = (row + 1) * stride + col;
      const d = (row + 1) * stride + col + 1;
      indices[idx++] = a; indices[idx++] = b; indices[idx++] = c;
      indices[idx++] = b; indices[idx++] = d; indices[idx++] = c;
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setAttribute("color",    new BufferAttribute(colors,    3));
  geo.setIndex(new BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export interface ChunkDef {
  id: string;
  faceIdx: number;
  gu: number;
  gv: number;
  centerDir: Vector3;
}

export function buildAllChunkDefs(): ChunkDef[] {
  const defs: ChunkDef[] = [];
  for (let f = 0; f < 6; f++) {
    for (let gv = 0; gv < CHUNK_FACE_GRID; gv++) {
      for (let gu = 0; gu < CHUNK_FACE_GRID; gu++) {
        const face = CUBE_FACE_BASES[f]!;
        const u = ((gu + 0.5) / CHUNK_FACE_GRID) * 2 - 1;
        const v = ((gv + 0.5) / CHUNK_FACE_GRID) * 2 - 1;
        const centerDir = new Vector3(
          face.f[0] + face.t[0] * u + face.b[0] * v,
          face.f[1] + face.t[1] * u + face.b[1] * v,
          face.f[2] + face.t[2] * u + face.b[2] * v,
        ).normalize();
        defs.push({ id: `${f}:${gu}:${gv}`, faceIdx: f, gu, gv, centerDir });
      }
    }
  }
  return defs;
}
