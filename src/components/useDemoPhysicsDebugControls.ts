import { useEffect, useState } from "react";

export const DEMO_PHYSICS_STEP = 1 / 60;

export type DemoPhysicsDebugControls = {
  paused: boolean;
  timeScale: number;
  stepRequest: number;
  manualStepCount: number;
  acknowledgeStep: () => void;
};

function shouldIgnoreKeyTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export function useDemoPhysicsDebugControls(): DemoPhysicsDebugControls {
  const [paused, setPaused] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [stepRequest, setStepRequest] = useState(0);
  const [manualStepCount, setManualStepCount] = useState(0);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreKeyTarget(event.target)) {
        return;
      }

      if (event.repeat && event.code !== "Period") {
        return;
      }

      switch (event.code) {
        case "Digit1":
          setTimeScale(1);
          break;
        case "Digit2":
          setTimeScale(0.5);
          break;
        case "Digit3":
          setTimeScale(0.25);
          break;
        case "KeyP":
          event.preventDefault();
          setPaused((current) => !current);
          break;
        case "Period":
          if (!paused) {
            return;
          }

          event.preventDefault();
          setStepRequest((current) => current + 1);
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [paused]);

  return {
    paused,
    timeScale,
    stepRequest,
    manualStepCount,
    acknowledgeStep: () => setManualStepCount((current) => current + 1),
  };
}
