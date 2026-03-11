import type { MwendoVec3 } from "../types";
import { MwendoHumanoidRagdoll } from "./MwendoHumanoidRagdoll";

export type MwendoRagdollDummyProps = {
  position?: MwendoVec3;
  debug?: boolean;
  paused?: boolean;
  timeScale?: number;
  manualStepCount?: number;
};

export function MwendoRagdollDummy({
  position = [0, 4.5, 0],
  debug = false,
  paused = false,
  timeScale = 1,
  manualStepCount = 0,
}: MwendoRagdollDummyProps) {
  return (
    <MwendoHumanoidRagdoll
      debug={debug}
      manualStepCount={manualStepCount}
      paused={paused}
      position={position}
      timeScale={timeScale}
    />
  );
}
