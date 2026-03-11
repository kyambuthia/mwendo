export type MwendoMovementMode =
  | "idle"
  | "walk"
  | "run"
  | "crouch"
  | "jump"
  | "fall";

export type MwendoSupportState = "none" | "left" | "right" | "double";

export type MwendoVec3 = [number, number, number];

export type MwendoInputState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
  crouch: boolean;
  jump: boolean;
};

export type MwendoPlayerSnapshot = {
  position: MwendoVec3;
  focusPosition?: MwendoVec3;
  facing: number;
  movementMode: MwendoMovementMode;
  grounded: boolean;
  supportState: MwendoSupportState;
  velocity: MwendoVec3;
};

export const DEFAULT_MWENDO_INPUT: MwendoInputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  run: false,
  crouch: false,
  jump: false,
};

export function mergeMwendoInput(
  ...inputs: Array<Partial<MwendoInputState> | null | undefined>
): MwendoInputState {
  return inputs.reduce<MwendoInputState>(
    (accumulator, input) => ({
      forward: accumulator.forward || Boolean(input?.forward),
      backward: accumulator.backward || Boolean(input?.backward),
      left: accumulator.left || Boolean(input?.left),
      right: accumulator.right || Boolean(input?.right),
      run: accumulator.run || Boolean(input?.run),
      crouch: accumulator.crouch || Boolean(input?.crouch),
      jump: accumulator.jump || Boolean(input?.jump),
    }),
    { ...DEFAULT_MWENDO_INPUT },
  );
}
