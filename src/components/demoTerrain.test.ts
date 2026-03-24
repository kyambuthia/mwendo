import { describe, expect, it } from "vitest";
import {
  DEMO_PLANET_PLAYER_SPAWN_CLEARANCE,
  DEMO_PLANET_RADIUS,
  DEMO_PLANET_SPAWN_DIRECTION,
  getDemoPlanetSpawnPosition,
  sampleDemoPlanetHeight,
  sampleDemoPlanetNormal,
  sampleDemoPlanetSurface,
} from "./demoTerrain";

describe("demo planet helpers", () => {
  it("returns deterministic heights for the same direction", () => {
    const direction: [number, number, number] = [0.35, -0.22, 0.91];

    expect(sampleDemoPlanetHeight(direction)).toBeCloseTo(
      sampleDemoPlanetHeight(direction),
      8,
    );
  });

  it("keeps the spawn area smooth on the planet surface", () => {
    const centerHeight = sampleDemoPlanetHeight(DEMO_PLANET_SPAWN_DIRECTION);
    const nearbyDirection: [number, number, number] = [0.24, 0.14, 0.96];
    const fartherDirection: [number, number, number] = [0.3, 0.2, 0.93];
    const nearbyHeight = sampleDemoPlanetHeight(nearbyDirection);
    const fartherHeight = sampleDemoPlanetHeight(fartherDirection);
    const normal = sampleDemoPlanetNormal(DEMO_PLANET_SPAWN_DIRECTION);

    expect(Math.abs(centerHeight - nearbyHeight)).toBeLessThan(0.08);
    expect(Math.abs(centerHeight - fartherHeight)).toBeLessThan(0.18);
    expect(normal.dot(sampleDemoPlanetSurface(DEMO_PLANET_SPAWN_DIRECTION).normal)).toBeGreaterThan(0.97);
  });

  it("applies spawn clearance above the sampled planet surface radius", () => {
    const position = getDemoPlanetSpawnPosition(
      DEMO_PLANET_SPAWN_DIRECTION,
      DEMO_PLANET_PLAYER_SPAWN_CLEARANCE,
    );
    const distance = Math.hypot(position[0], position[1], position[2]);
    const surface = sampleDemoPlanetSurface(DEMO_PLANET_SPAWN_DIRECTION);

    expect(distance - (DEMO_PLANET_RADIUS + surface.height)).toBeCloseTo(
      DEMO_PLANET_PLAYER_SPAWN_CLEARANCE,
      6,
    );
  });
});
