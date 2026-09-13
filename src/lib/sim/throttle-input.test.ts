import assert from "node:assert/strict";
import { test } from "node:test";
import { Quaternion, Vector3 } from "three";
import { BOAT_CATALOG } from "../boats/catalog";
import { CALM_TEST_ENVIRONMENT, computeBoatPhysics } from "./boat-physics";
import { createEngineDynamics, normalizeThrottle, rpmFromThrottle, stepEngineDynamics } from "./engine-dynamics";
import { smoothThrottleCommand, tcaThrottleCommand } from "./throttle-input";
import { TURBO_MIN_THROTTLE, TURBO_RPM } from "./turbo-controls";

const boat = BOAT_CATALOG[0];
const buttons = (indexes: number[]) => Array.from({ length: 31 }, (_, index) => indexes.includes(index) ? 1 : 0);
const rest = { worldPosition: new Vector3(), worldRotation: new Quaternion(), worldLinearVelocity: new Vector3(), yawRateRadPerSecond: 0 };
const thrust = (throttle: number) => computeBoatPhysics(boat, rest, { portThrottle: throttle, starboardThrottle: throttle, bowThruster: 0 }, CALM_TEST_ENVIRONMENT).applications.filter(a => a.name.endsWith("-engine")).reduce((sum, a) => sum + a.force.z, 0);

test("recorded TCA neutral positions give zero drive, including after full throttle", () => {
  for (const [axis, raw] of [[0, -0.01759368], [1, -0.01838714], [0, -0.02659649], [1, -0.04957658]]) {
    const command = tcaThrottleCommand(raw, axis, buttons([10, 14]));
    assert.equal(command, 0);
    assert.equal(smoothThrottleCommand(1, command, 0.22, 0.02), 0);
    const engine = stepEngineDynamics({ ...createEngineDynamics(), gear: 1, effectiveThrottle: 1, rpm: 2400 }, command, true, false, 1 / 60);
    assert.equal(engine.gear, 0);
    assert.equal(engine.effectiveThrottle, 0);
    assert.equal(thrust(engine.effectiveThrottle), 0);
  }
});

test("the measured first forward notch uses midrange RPM instead of being pinned to idle", () => {
  for (const [axis, raw] of [[0, -0.45537502], [1, -0.45818263], [0, -0.49938202], [1, -0.5]]) {
    const demand = normalizeThrottle(tcaThrottleCommand(raw, axis, buttons([9, 13])));
    let engine = { ...createEngineDynamics(), rpm: boat.engine.idleRpm };
    for (let i = 0; i < 120; i++) engine = stepEngineDynamics(engine, demand, true, false, 1 / 60, boat.engine);
    assert.equal(engine.gear, 1);
    assert.ok(engine.rpm > 1_000 && engine.rpm < 1_250);
    assert.ok(thrust(engine.effectiveThrottle) > thrust(normalizeThrottle(tcaThrottleCommand(-0.25, axis, []))));
  }
});

test("forward travel adds power smoothly before, through and beyond the first notch", () => {
  for (const axis of [0, 1]) {
    let previousRpm = rpmFromThrottle(normalizeThrottle(tcaThrottleCommand(-0.2, axis, [])));
    let previousThrust = thrust(normalizeThrottle(tcaThrottleCommand(-0.2, axis, [])));
    assert.ok(previousRpm >= boat.engine.idleRpm && previousRpm < boat.engine.idleRpm + 60);
    for (let percent = 21; percent <= 100; percent++) {
      const raw = -percent / 100;
      const command = tcaThrottleCommand(raw, axis, []);
      assert.equal(tcaThrottleCommand(raw, axis, buttons([9, 13])), command,
        "the forward contacts must never change demand at the same lever position");
      const demand = normalizeThrottle(command);
      const rpm = rpmFromThrottle(demand);
      const force = thrust(demand);
      assert.ok(rpm > previousRpm && rpm - previousRpm < 35, `smooth RPM at ${percent}% travel`);
      assert.ok(force > previousThrust, `increasing thrust at ${percent}% travel`);
      previousRpm = rpm;
      previousThrust = force;
    }
    assert.equal(previousRpm, boat.engine.maxRpm);
  }
});

test("neutral contacts follow physical axes when levers are swapped", () => {
  const contacts = buttons([9, 14]);
  const port = tcaThrottleCommand(-0.025, 1, contacts);
  const starboard = tcaThrottleCommand(-0.5, 0, contacts);
  assert.equal(port, 0);
  assert.ok(starboard > 0);
  assert.equal(starboard, tcaThrottleCommand(-0.5, 0, []));
  assert.ok(rpmFromThrottle(normalizeThrottle(starboard)) > 1_000);
});

test("full ahead remains turbo eligible and reverse stays available", () => {
  const fullAhead = normalizeThrottle(tcaThrottleCommand(-1, 0, buttons([8])));
  assert.ok(fullAhead >= TURBO_MIN_THROTTLE);
  let engine = createEngineDynamics();
  for (let i = 0; i < 600; i++) engine = stepEngineDynamics(engine, fullAhead, true, false, 1 / 60, boat.engine, true);
  assert.ok(Math.abs(engine.rpm - TURBO_RPM) < 1);
  assert.equal(tcaThrottleCommand(1, 0, []), -1);
  assert.ok(tcaThrottleCommand(0.5, 1, []) < 0);
  assert.equal(tcaThrottleCommand(undefined, 0, []), 0);
});
