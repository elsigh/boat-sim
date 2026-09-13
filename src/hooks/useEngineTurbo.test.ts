import assert from "node:assert/strict";
import { test } from "node:test";
import { readTurboEligibility } from "./useEngineTurbo";
import { createTurboControlState, NO_TURBO, stepTurboControls, TURBO_MIN_THROTTLE, TURBO_RPM } from "../lib/sim/turbo-controls";
import { createEngineDynamics, DEFAULT_ENGINE, normalizeThrottle, stepEngineDynamics } from "../lib/sim/engine-dynamics";
import { smoothThrottleCommand, tcaThrottleCommand } from "../lib/sim/throttle-input";

const running = { port: true, starboard: true };
const input = { buttons: NO_TURBO, eligible: running, deviceId: "TCA Q-Eng 1&2", resetKey: "bonum:0" };

test("a quick full-travel press after repair survives throttle smoothing and spools to 20k", () => {
  let state = stepTurboControls(createTurboControlState(), input);
  state = stepTurboControls(state, { ...input, buttons: running });
  state = stepTurboControls(state, { ...input, buttons: running, eligible: NO_TURBO });
  const repaired = { ...input, resetKey: "bonum:1" };
  state = stepTurboControls(state, { ...repaired, buttons: running });
  assert.deepEqual(state.active, NO_TURBO, "repair must not retrigger held buttons");
  state = stepTurboControls(state, { ...repaired, eligible: NO_TURBO });

  const lever = tcaThrottleCommand(-1, 0, []);
  let filtered = smoothThrottleCommand(0, lever, 0.22, 0.02);
  assert.ok(normalizeThrottle(filtered) < TURBO_MIN_THROTTLE, "the old smoothed-input gate would discard this press");
  const eligible = readTurboEligibility({ portLever: lever, starboardLever: lever }, running);
  state = stepTurboControls(state, { ...repaired, eligible, buttons: { port: true, starboard: false } });
  assert.deepEqual(state.active, { port: true, starboard: false });
  let engine = createEngineDynamics();
  engine = stepEngineDynamics(engine, normalizeThrottle(filtered), true, false, 1 / 60, DEFAULT_ENGINE, state.active.port);
  assert.equal(engine.turboActive, false, "the physical engine still needs to engage and spool up");
  for (let frame = 0; frame < 180; frame++) {
    state = stepTurboControls(state, { ...repaired, eligible });
    filtered = smoothThrottleCommand(filtered, lever, 0.22, 0.02);
    engine = stepEngineDynamics(engine, normalizeThrottle(filtered), true, false, 1 / 60, DEFAULT_ENGINE, state.active.port);
  }
  assert.equal(engine.turboActive, true);
  assert.ok(Math.abs(engine.rpm - TURBO_RPM) < 1);
  state = stepTurboControls(state, { ...repaired, eligible, buttons: { port: false, starboard: true } });
  assert.deepEqual(state.active, running, "starboard still toggles independently after repair");
});

test("neutral, astern, stopped engines and paused exercises cannot arm turbo", () => {
  for (const lever of [0, -1, 0.5]) {
    assert.deepEqual(readTurboEligibility({ portLever: lever, starboardLever: lever }, running), NO_TURBO);
  }
  assert.deepEqual(readTurboEligibility({ portLever: 1, starboardLever: 1 }, NO_TURBO), NO_TURBO);
  assert.deepEqual(readTurboEligibility({ portLever: 1, starboardLever: 1 }, running, true), NO_TURBO);
  const eligible = readTurboEligibility({ portLever: 0, starboardLever: 1 }, running);
  const state = stepTurboControls(stepTurboControls(createTurboControlState(), input), { ...input, eligible, keyboardToggle: true });
  assert.deepEqual(state.active, { port: false, starboard: true });
});
