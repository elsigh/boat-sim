import assert from "node:assert/strict";
import { test } from "node:test";
import { createTurboControlState, NO_TURBO, readTurboButtons, stepTurboControls, type TurboControlInput } from "./turbo-controls";

const deviceId = "TCA Q-Eng 1&2 (Vendor: 044f Product: 0407)";
const eligible = { port: true, starboard: true };
const input: TurboControlInput = { buttons: NO_TURBO, eligible, deviceId, resetKey: "bonum:0" };
const ready = () => stepTurboControls(createTurboControlState(), input);

test("TCA handle buttons follow lever assignment without consuming master or bow-thruster switches", () => {
  const buttons = [1, 0, 1, 1, 1, 1, 0, 1];
  assert.deepEqual(readTurboButtons(deviceId, buttons, false), { port: true, starboard: false });
  assert.deepEqual(readTurboButtons(deviceId, buttons, true), { port: false, starboard: true });
  assert.deepEqual(readTurboButtons(deviceId, [0, 0, 1, 1, 1, 1, 0, 1], false), NO_TURBO);
  assert.deepEqual(readTurboButtons("Generic gamepad", buttons, false), NO_TURBO);
});

test("each physical button toggles only its engine and holding never repeats", () => {
  const port = { port: true, starboard: false };
  let state = stepTurboControls(ready(), { ...input, buttons: port });
  assert.deepEqual(state.active, port);
  for (let i = 0; i < 180; i++) state = stepTurboControls(state, { ...input, buttons: port });
  assert.deepEqual(state.active, port);
  state = stepTurboControls(state, { ...input, buttons: eligible });
  assert.deepEqual(state.active, eligible);
  state = stepTurboControls(state, input);
  state = stepTurboControls(state, { ...input, buttons: port });
  assert.deepEqual(state.active, { port: false, starboard: true });
});

test("an ineligible press cannot arm turbo for later; pulling one lever back clears only that side", () => {
  let state = stepTurboControls(ready(), { ...input, buttons: eligible, eligible: NO_TURBO });
  state = stepTurboControls(state, { ...input, buttons: eligible });
  assert.deepEqual(state.active, NO_TURBO);
  state = stepTurboControls(state, input);
  state = stepTurboControls(state, { ...input, buttons: eligible });
  state = stepTurboControls(state, { ...input, buttons: eligible, eligible: { port: false, starboard: true } });
  assert.deepEqual(state.active, { port: false, starboard: true });
  state = stepTurboControls(state, { ...input, buttons: eligible });
  assert.equal(state.active.port, false, "pushing the lever forward again must require a fresh press");
});

test("reset, pause, disconnect, and reconnect with held buttons never restart a boost", () => {
  const active = stepTurboControls(ready(), { ...input, buttons: eligible });
  for (const change of [{ resetKey: "bonum:1" }, { deviceId: null }, { eligible: NO_TURBO }]) {
    let state = stepTurboControls(active, { ...input, buttons: eligible, ...change });
    assert.deepEqual(state.active, NO_TURBO);
    state = stepTurboControls(state, { ...input, buttons: eligible });
    assert.deepEqual(state.active, NO_TURBO);
  }
  const connectedHeld = stepTurboControls(createTurboControlState(), { ...input, buttons: eligible });
  assert.deepEqual(connectedHeld.active, NO_TURBO);
});

test("T enables eligible engines and cancels both when either is already boosted", () => {
  let state = stepTurboControls(ready(), { ...input, keyboardToggle: true, eligible: { port: false, starboard: true } });
  assert.deepEqual(state.active, { port: false, starboard: true });
  state = stepTurboControls(state, { ...input, keyboardToggle: true });
  assert.deepEqual(state.active, NO_TURBO);
  state = stepTurboControls(state, { ...input, keyboardToggle: true });
  assert.deepEqual(state.active, eligible);
});
