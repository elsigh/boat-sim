import assert from "node:assert/strict";
import { test } from "node:test";
import { Quaternion, Vector3 } from "three";
import { BOAT_CATALOG } from "../boats/catalog";
import { CALM_TEST_ENVIRONMENT, computeBoatPhysics, type BoatState, type BoatControlInputs, type SimulationEnvironment } from "./boat-physics";
import { createEngineDynamics, normalizeThrottle, rpmFromThrottle, stepEngineDynamics } from "./engine-dynamics";

const boat = BOAT_CATALOG[0];
const neutral = { portThrottle: 0, starboardThrottle: 0, bowThruster: 0 };
function state(surge = 0, sway = 0, yaw = 0): BoatState {
  return { worldPosition: new Vector3(), worldRotation: new Quaternion(), worldLinearVelocity: new Vector3(sway, 0, surge), yawRateRadPerSecond: yaw };
}
function forces(s: BoatState, controls: BoatControlInputs = neutral, environment: SimulationEnvironment = CALM_TEST_ENVIRONMENT, profile = boat) {
  const result = computeBoatPhysics(profile, s, controls, environment);
  const force = result.centerForce.clone();
  const torque = result.yawTorque.clone();
  for (const application of result.applications) {
    force.add(application.force);
    torque.add(application.point.clone().sub(s.worldPosition).cross(application.force));
  }
  return { force, torque, telemetry: result.telemetry };
}
function equilibrium(throttle: number) {
  let lo = 0, hi = 20;
  for (let i = 0; i < 50; i++) {
    const speed = (lo + hi) / 2;
    if (forces(state(speed), { ...neutral, portThrottle: throttle, starboardThrottle: throttle }).force.z > 0) lo = speed;
    else hi = speed;
  }
  return (lo + hi) / 2 / 0.514444;
}

test("engine levers retain small intentional differences outside neutral", () => {
  assert.equal(normalizeThrottle(0.035), 0);
  assert.equal(normalizeThrottle(-0.045), 0);
  assert.ok(normalizeThrottle(0.3) > normalizeThrottle(0.28));
  assert.ok(normalizeThrottle(-0.3) < normalizeThrottle(-0.28));
  assert.equal(normalizeThrottle(1), 1);
});

test("clutch opens immediately, dwells before reversal, and shutdown removes drive", () => {
  let engine = createEngineDynamics();
  for (let i = 0; i < 120; i++) engine = stepEngineDynamics(engine, 0.5, true, false, 1 / 60);
  assert.equal(engine.effectiveThrottle, 0.5);
  engine = stepEngineDynamics(engine, -0.5, true, false, 1 / 60);
  assert.equal(engine.effectiveThrottle, 0);
  assert.equal(engine.gear, 0);
  for (let i = 0; i < 30; i++) {
    engine = stepEngineDynamics(engine, -0.5, true, false, 1 / 60);
    assert.equal(engine.effectiveThrottle, 0);
  }
  for (let i = 0; i < 90; i++) engine = stepEngineDynamics(engine, -0.5, true, false, 1 / 60);
  assert.equal(engine.effectiveThrottle, -0.5);
  assert.equal(stepEngineDynamics(engine, 0, true, false, 1 / 60).effectiveThrottle, 0);
  const stopped = stepEngineDynamics(engine, -1, false, false, 1 / 60);
  assert.equal(stopped.effectiveThrottle, 0);
  assert.equal(stopped.rpm, 0);
});

test("engine response is consistent at 30, 60, and 120 Hz", () => {
  const results = [30, 60, 120].map((hz) => {
    let engine = createEngineDynamics();
    for (let i = 0; i < hz * 3; i++) engine = stepEngineDynamics(engine, 0.6, true, false, 1 / hz);
    return engine;
  });
  assert.ok(results.every((engine) => engine.effectiveThrottle === 0.6));
  assert.ok(Math.max(...results.map((engine) => engine.rpm)) - Math.min(...results.map((engine) => engine.rpm)) < 1);
});

test("a hull drifting with both water and air has no force, but GPS still reads speed", () => {
  const flow = new Vector3(0.8, 0, 0.6);
  const result = forces({ ...state(), worldLinearVelocity: flow.clone() }, neutral, { currentVelocity: flow.clone(), windVelocity: flow.clone() });
  assert.ok(result.force.length() < 1e-8);
  assert.ok(result.torque.length() < 1e-8);
  assert.equal(result.telemetry.speedThroughWaterKnots, 0);
  assert.ok(result.telemetry.speedKnots > 1.9);
});

test("port ahead turns the bow to starboard; matched props track straight", () => {
  assert.ok(forces(state(), { ...neutral, portThrottle: 0.3 }).torque.y < 0);
  assert.ok(forces(state(), { ...neutral, starboardThrottle: 0.3 }).torque.y > 0);
  const twins = forces(state(), { ...neutral, portThrottle: 0.3, starboardThrottle: 0.3 });
  assert.ok(Math.abs(twins.torque.y) < 1e-8);
  assert.ok(Math.abs(twins.force.x) < 1e-8);
  assert.ok(forces(state(), { ...neutral, portThrottle: 0.3, starboardThrottle: 0.28 }).torque.y < 0);
});

test("reverse prop walk follows handedness and cancels for matched twins", () => {
  assert.ok(forces(state(), { ...neutral, portThrottle: -0.4 }).force.x < 0);
  assert.ok(forces(state(), { ...neutral, starboardThrottle: -0.4 }).force.x > 0);
  const twins = forces(state(), { ...neutral, portThrottle: -0.4, starboardThrottle: -0.4 });
  assert.ok(Math.abs(twins.force.x) < 1e-8);
  assert.ok(Math.abs(twins.torque.y) < 1e-8);
  assert.ok(twins.force.z < 0);
});

test("stationary idle thrust is useful in either gear and lower than cruise thrust", () => {
  const ahead = forces(state(), { ...neutral, portThrottle: 0.035, starboardThrottle: 0.035 }).force.z;
  const astern = forces(state(), { ...neutral, portThrottle: -0.035, starboardThrottle: -0.035 }).force.z;
  assert.ok(ahead > 300 && ahead < 900);
  assert.ok(astern < -300 && astern > -900);
});

test("bow thruster loses authority with headway and is absent on unequipped boats", () => {
  const atRest = forces(state(), { ...neutral, bowThruster: 1 });
  const underway = forces(state(3), { ...neutral, bowThruster: 1 });
  assert.ok(atRest.force.x < 0 && atRest.torque.y < 0);
  assert.ok(Math.abs(underway.force.x) < Math.abs(atRest.force.x) * 0.3);
  const noThruster = BOAT_CATALOG.find((profile) => profile.maxBowThrusterForceN === 0)!;
  assert.equal(forces(state(), { ...neutral, bowThruster: 1 }, CALM_TEST_ENVIRONMENT, noThruster).force.x, 0);
});

test("hull resistance dissipates energy at every tested combined sway, surge, and yaw", () => {
  for (const profile of BOAT_CATALOG) {
    for (const surge of [-5, 0, 5]) for (const sway of [-2, -0.1, 0, 0.1, 2]) for (const yaw of [-0.4, -0.03, 0, 0.03, 0.4]) {
      const result = forces(state(surge, sway, yaw), neutral, CALM_TEST_ENVIRONMENT, profile);
      const power = result.force.x * sway + result.force.z * surge + result.torque.y * yaw;
      assert.ok(Number.isFinite(power) && power <= 1e-7, `${profile.label}: resistance added energy`);
    }
  }
});

test("water-relative physics is invariant to a shared velocity offset", () => {
  const s = state(1.2, 0.3, -0.05);
  const a = forces(s, { ...neutral, portThrottle: 0.3, starboardThrottle: -0.2 });
  const offset = new Vector3(2.1, 0, -0.9);
  const b = forces({ ...s, worldLinearVelocity: s.worldLinearVelocity.clone().add(offset) }, { ...neutral, portThrottle: 0.3, starboardThrottle: -0.2 }, { windVelocity: offset.clone(), currentVelocity: offset.clone() });
  assert.ok(a.force.distanceTo(b.force) < 1e-7);
  assert.ok(a.torque.distanceTo(b.torque) < 1e-7);
});

test("neutral coasts with momentum; an astern burst shortens the stop", () => {
  function run(throttle: number) {
    let speed = 2 * 0.514444, distance = 0;
    for (let i = 0; i < 10 * 60; i++) {
      speed += forces(state(speed), { ...neutral, portThrottle: throttle, starboardThrottle: throttle }).force.z / boat.massKg / 60;
      distance += speed / 60;
    }
    return { speed, distance };
  }
  const coast = run(0), braking = run(-0.5);
  assert.ok(coast.speed > 0.5 && coast.distance > 7);
  assert.ok(braking.speed < coast.speed - 0.3);
  assert.ok(braking.distance < coast.distance);
});

test("Grand Banks retains approximately 12 kn at 1500–1550 RPM and 20 kn full ahead", () => {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const middle = (lo + hi) / 2;
    if (rpmFromThrottle(middle) < 1525) lo = middle;
    else hi = middle;
  }
  const cruise = equilibrium((lo + hi) / 2), full = equilibrium(1);
  assert.ok(cruise > 11.3 && cruise < 12.8, `cruise ${cruise.toFixed(2)} kn`);
  assert.ok(full > 19.4 && full < 21.1, `full ${full.toFixed(2)} kn`);
  console.log(`Grand Banks equilibrium: ${cruise.toFixed(2)} kn at 1525 RPM; ${full.toFixed(2)} kn full ahead`);
});
