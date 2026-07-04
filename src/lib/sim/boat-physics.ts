import { Quaternion, Vector3 } from "three";

const KNOTS_TO_METERS_PER_SECOND = 0.514444;

export type PropellerHandedness = "left" | "right";

export type BoatControlInputs = {
  portThrottle: number;
  starboardThrottle: number;
  bowThruster: number;
};

export type BoatState = {
  worldPosition: Vector3;
  worldRotation: Quaternion;
  worldLinearVelocity: Vector3;
  yawRateRadPerSecond: number;
};

export type ForceApplication = {
  name: string;
  force: Vector3;
  point: Vector3;
};

export type DockingTelemetry = {
  headingDeg: number;
  speedKnots: number;
  yawRateDegPerSecond: number;
  lateralDriftKnots: number;
  surgeSpeedKnots: number;
  worldX: number;
  worldZ: number;
  worldVelocityX: number;
  worldVelocityZ: number;
};

export type SimulationEnvironment = {
  windVelocity: Vector3;
  currentVelocity: Vector3;
};

export type BoatConfiguration = {
  label: string;
  massKg: number;
  lengthM: number;
  beamM: number;
  engineLateralOffsetM: number;
  forwardYawAuthorityScale: number;
  reverseYawAuthorityScale: number;
  engineLongitudinalOffsetM: number;
  bowThrusterLongitudinalOffsetM: number;
  windCenterLongitudinalOffsetM: number;
  maxForwardThrustN: number;
  maxReverseThrustN: number;
  maxBowThrusterForceN: number;
  maxPropWalkForceN: number;
  throttleExponent: number;
  throttleLinearBlend: number;
  waterLinearDragSurge: number;
  waterLinearDragSway: number;
  waterDragSurge: number;
  waterDragSway: number;
  yawLinearDrag: number;
  yawDrag: number;
  windageAreaM2: number;
  windLongitudinalCoefficient: number;
  windLateralCoefficient: number;
  propellerHandedness: {
    port: PropellerHandedness;
    starboard: PropellerHandedness;
  };
};

export type BoatPhysicsResult = {
  applications: ForceApplication[];
  centerForce: Vector3;
  yawTorque: Vector3;
  telemetry: DockingTelemetry;
};

function signedSquare(value: number) {
  return value * Math.abs(value);
}

function waterResistance(velocity: number, linearDrag: number, quadraticDrag: number) {
  return -velocity * linearDrag - signedSquare(velocity) * quadraticDrag;
}

function toKnots(speedMetersPerSecond: number) {
  return speedMetersPerSecond / KNOTS_TO_METERS_PER_SECOND;
}

function normalizeDegrees(degrees: number) {
  return (degrees + 360) % 360;
}

function polarToWorldVector(speedKnots: number, directionDeg: number) {
  const speed = speedKnots * KNOTS_TO_METERS_PER_SECOND;
  const radians = (directionDeg * Math.PI) / 180;

  return new Vector3(
    Math.sin(radians) * speed,
    0,
    Math.cos(radians) * speed,
  );
}

function toWorldPoint(
  localPoint: Vector3,
  worldPosition: Vector3,
  worldRotation: Quaternion,
) {
  return localPoint.clone().applyQuaternion(worldRotation).add(worldPosition);
}

function toWorldVector(localVector: Vector3, worldRotation: Quaternion) {
  return localVector.clone().applyQuaternion(worldRotation);
}

function throttleToThrust(
  throttle: number,
  waterRelativeSurgeSpeed: number,
  config: BoatConfiguration,
) {
  const magnitude = Math.abs(throttle);
  const shapedMagnitude =
    magnitude * config.throttleLinearBlend +
    Math.pow(magnitude, config.throttleExponent) * (1 - config.throttleLinearBlend);
  const shapedThrottle = Math.sign(throttle) * shapedMagnitude;
  const baseThrust =
    shapedThrottle >= 0
      ? shapedThrottle * config.maxForwardThrustN
      : shapedThrottle * config.maxReverseThrustN;
  const speedWithProp = Math.max(0, Math.sign(baseThrust) * waterRelativeSurgeSpeed);
  const slipReduction = 1 / (1 + speedWithProp * 0.22);

  return baseThrust * slipReduction;
}

// In this right-handed, y-up, z-forward frame the boat's starboard side is
// local -x (and world +x renders as west). A left-handed prop in astern walks
// the stern to starboard (-x); a right-handed prop walks it to port (+x).
function reversePropWalkDirection(handedness: PropellerHandedness) {
  return handedness === "left" ? -1 : 1;
}

export function buildEnvironment(input: {
  windKnots: number;
  windTowardDeg: number;
  currentKnots: number;
  currentTowardDeg: number;
}): SimulationEnvironment {
  return {
    windVelocity: polarToWorldVector(input.windKnots, input.windTowardDeg),
    currentVelocity: polarToWorldVector(input.currentKnots, input.currentTowardDeg),
  };
}

export const CALM_TEST_ENVIRONMENT: SimulationEnvironment = {
  windVelocity: new Vector3(0, 0, 0),
  currentVelocity: new Vector3(0, 0, 0),
};

export const DEFAULT_DOCKING_TELEMETRY: DockingTelemetry = {
  headingDeg: 0,
  speedKnots: 0,
  yawRateDegPerSecond: 0,
  lateralDriftKnots: 0,
  surgeSpeedKnots: 0,
  worldX: 0,
  worldZ: 0,
  worldVelocityX: 0,
  worldVelocityZ: 0,
};

export function computeBoatPhysics(
  config: BoatConfiguration,
  state: BoatState,
  input: BoatControlInputs,
  environment: SimulationEnvironment,
): BoatPhysicsResult {
  const inverseRotation = state.worldRotation.clone().invert();
  const localVelocity = state.worldLinearVelocity.clone().applyQuaternion(inverseRotation);
  const localCurrent = environment.currentVelocity.clone().applyQuaternion(inverseRotation);
  const localWind = environment.windVelocity.clone().applyQuaternion(inverseRotation);

  const waterRelativeVelocity = localVelocity.clone().sub(localCurrent);
  const airRelativeVelocity = localVelocity.clone().sub(localWind);

  const portThrust = throttleToThrust(
    input.portThrottle,
    waterRelativeVelocity.z,
    config,
  );
  const starboardThrust = throttleToThrust(
    input.starboardThrottle,
    waterRelativeVelocity.z,
    config,
  );
  const propWalkFlowFactor = 1 / (1 + Math.abs(waterRelativeVelocity.z) * 0.75);

  const portPropWalk =
    input.portThrottle < 0
      ? reversePropWalkDirection(config.propellerHandedness.port) *
        Math.pow(Math.abs(input.portThrottle), 1.15) *
        config.maxPropWalkForceN *
        propWalkFlowFactor
      : 0;
  const starboardPropWalk =
    input.starboardThrottle < 0
      ? reversePropWalkDirection(config.propellerHandedness.starboard) *
        Math.pow(Math.abs(input.starboardThrottle), 1.15) *
        config.maxPropWalkForceN *
        propWalkFlowFactor
      : 0;

  // Local port is +x, starboard is -x. Port ahead must swing the bow to
  // starboard, and vice versa.
  const portApplicationLocal = {
    name: "port-engine",
    force: new Vector3(portPropWalk, 0, portThrust),
    point: new Vector3(
      config.engineLateralOffsetM *
        (input.portThrottle < 0
          ? config.reverseYawAuthorityScale
          : config.forwardYawAuthorityScale),
      0,
      config.engineLongitudinalOffsetM,
    ),
  };

  const starboardApplicationLocal = {
    name: "starboard-engine",
    force: new Vector3(starboardPropWalk, 0, starboardThrust),
    point: new Vector3(
      -config.engineLateralOffsetM *
        (input.starboardThrottle < 0
          ? config.reverseYawAuthorityScale
          : config.forwardYawAuthorityScale),
      0,
      config.engineLongitudinalOffsetM,
    ),
  };

  // Positive command pushes the bow to starboard (-x).
  const bowThrusterApplicationLocal = {
    name: "bow-thruster",
    force: new Vector3(-input.bowThruster * config.maxBowThrusterForceN, 0, 0),
    point: new Vector3(0, 0, config.bowThrusterLongitudinalOffsetM),
  };

  const waterDragLocal = new Vector3(
    waterResistance(
      waterRelativeVelocity.x,
      config.waterLinearDragSway,
      config.waterDragSway,
    ),
    0,
    waterResistance(
      waterRelativeVelocity.z,
      config.waterLinearDragSurge,
      config.waterDragSurge,
    ),
  );

  const dynamicPressure = 0.5 * 1.225 * config.windageAreaM2;
  const windForceLocal = new Vector3(
    -signedSquare(airRelativeVelocity.x) *
      dynamicPressure *
      config.windLateralCoefficient,
    0,
    -signedSquare(airRelativeVelocity.z) *
      dynamicPressure *
      config.windLongitudinalCoefficient,
  );

  const windApplicationLocal = {
    name: "windage",
    force: windForceLocal,
    point: new Vector3(0, 0, config.windCenterLongitudinalOffsetM),
  };

  const yawTorqueLocal = new Vector3(
    0,
    -state.yawRateRadPerSecond * config.yawLinearDrag -
      state.yawRateRadPerSecond * Math.abs(state.yawRateRadPerSecond) * config.yawDrag,
    0,
  );

  const localApplications = [
    portApplicationLocal,
    starboardApplicationLocal,
    bowThrusterApplicationLocal,
    windApplicationLocal,
  ].filter((application) => application.force.lengthSq() > 0.0001);

  const applications = localApplications.map((application) => ({
    name: application.name,
    force: toWorldVector(application.force, state.worldRotation),
    point: toWorldPoint(
      application.point,
      state.worldPosition,
      state.worldRotation,
    ),
  }));
  const worldForward = toWorldVector(new Vector3(0, 0, 1), state.worldRotation);

  return {
    applications,
    centerForce: toWorldVector(waterDragLocal, state.worldRotation),
    yawTorque: toWorldVector(yawTorqueLocal, state.worldRotation),
    telemetry: {
      // Compass conventions: +x is world-west, so true heading needs -x, a
      // starboard (right) turn is negative yaw about +y, and starboard drift
      // is negative local x.
      headingDeg: normalizeDegrees((Math.atan2(-worldForward.x, worldForward.z) * 180) / Math.PI),
      speedKnots: toKnots(state.worldLinearVelocity.length()),
      yawRateDegPerSecond: (-state.yawRateRadPerSecond * 180) / Math.PI,
      lateralDriftKnots: -toKnots(localVelocity.x),
      surgeSpeedKnots: toKnots(localVelocity.z),
      worldX: state.worldPosition.x,
      worldZ: state.worldPosition.z,
      worldVelocityX: state.worldLinearVelocity.x,
      worldVelocityZ: state.worldLinearVelocity.z,
    },
  };
}
