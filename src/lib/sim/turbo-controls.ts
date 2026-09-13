export type TurboSelection = { port: boolean; starboard: boolean };
export const NO_TURBO: TurboSelection = { port: false, starboard: false };
export const TURBO_MIN_THROTTLE = 0.96;
export const TURBO_RPM = 20_000;
// Allows the fleet's 20k boost without clipping at the old 10k thrust limit.
export const MAX_TURBO_THRUST_MULTIPLIER = 144;

export type TurboControlInput = {
  buttons: TurboSelection;
  eligible: TurboSelection;
  deviceId: string | null;
  resetKey: string;
  keyboardToggle?: boolean;
};

export type TurboControlState = {
  active: TurboSelection;
  buttons: TurboSelection;
  deviceId: string | null;
  resetKey: string;
};

export function createTurboControlState(): TurboControlState {
  return { active: NO_TURBO, buttons: NO_TURBO, deviceId: null, resetKey: "" };
}

export function isTcaQuadrant(deviceId: string | null) {
  return deviceId !== null && /TCA.*Q-?Eng|044f.*0407/i.test(deviceId);
}

/** TCA handle pushbuttons are USB buttons 1/2 (Gamepad API indexes 0/1). */
export function readTurboButtons(deviceId: string | null, rawButtons: readonly number[], swapped: boolean): TurboSelection {
  if (!isTcaQuadrant(deviceId)) return NO_TURBO;
  return { port: (rawButtons[swapped ? 1 : 0] ?? 0) > 0.5, starboard: (rawButtons[swapped ? 0 : 1] ?? 0) > 0.5 };
}

/** A held button cannot retrigger, or arm a boost later when the lever moves. */
export function stepTurboControls(state: TurboControlState, input: TurboControlInput): TurboControlState {
  const reset = state.resetKey !== input.resetKey || state.deviceId !== input.deviceId;
  let port = !reset && input.eligible.port && state.active.port;
  let starboard = !reset && input.eligible.starboard && state.active.starboard;
  if (!reset) {
    if (input.buttons.port && !state.buttons.port && input.eligible.port) port = !port;
    if (input.buttons.starboard && !state.buttons.starboard && input.eligible.starboard) starboard = !starboard;
  }
  if (input.keyboardToggle) {
    const off = port || starboard;
    port = !off && input.eligible.port;
    starboard = !off && input.eligible.starboard;
  }
  if (!reset && port === state.active.port && starboard === state.active.starboard &&
    input.buttons.port === state.buttons.port && input.buttons.starboard === state.buttons.starboard) return state;
  return { active: { port, starboard }, buttons: input.buttons, deviceId: input.deviceId, resetKey: input.resetKey };
}
