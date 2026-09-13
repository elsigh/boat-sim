import { TURBO_MIN_THROTTLE, TURBO_RPM } from "./turbo-controls";

/** Twin levers are independent. Only trim the hardware's neutral noise. */
export const THROTTLE_NEUTRAL_DEADBAND = 0.045;
/** Initial clutch take-up makes idle thrust before asking the engine to rev. */
export const ENGINE_IDLE_THROTTLE = 0.04;
export const ENGINE_IDLE_RPM = 650;
export const ENGINE_MAX_RPM = 2400;
export type EngineSpecification = {
  label: string;
  fuel: "diesel" | "petrol";
  idleRpm: number;
  maxRpm: number;
  reverseRpm: number;
  startupMs: number;
  throttleRisePerSecond: number;
  rpmResponse: number;
  /** Audible envelope rate; synthesized character, not a measured recording. */
  idlePulseHz: number;
  fullPulseHz: number;
};

export const DEFAULT_ENGINE: EngineSpecification = {
  label: "Caterpillar 3126", fuel: "diesel", idleRpm: ENGINE_IDLE_RPM,
  maxRpm: ENGINE_MAX_RPM, reverseRpm: 1400, startupMs: 1100,
  throttleRisePerSecond: 3.2, rpmResponse: 6, idlePulseHz: 11, fullPulseHz: 34,
};
export type EngineGear = -1 | 0 | 1;

export type EngineDynamics = {
  turboActive: boolean;
  effectiveThrottle: number;
  gear: EngineGear;
  shiftRemaining: number;
  rpm: number;
};

export function createEngineDynamics(): EngineDynamics {
  return { effectiveThrottle: 0, gear: 0, shiftRemaining: 0, rpm: 0, turboActive: false };
}

export function normalizeThrottle(value: number) {
  const magnitude = Math.min(1, Math.abs(value));
  return magnitude <= THROTTLE_NEUTRAL_DEADBAND
    ? 0
    : Math.sign(value) * (magnitude - THROTTLE_NEUTRAL_DEADBAND) / (1 - THROTTLE_NEUTRAL_DEADBAND);
}

export function rpmFromThrottle(throttle: number, engine: EngineSpecification = DEFAULT_ENGINE) {
  const magnitude = Math.min(1, Math.abs(throttle));
  const aboveIdle = Math.min(1, Math.max(0, (magnitude - ENGINE_IDLE_THROTTLE) / 0.08));
  const shaped = (0.22 * magnitude + 0.78 * magnitude ** 1.6) * aboveIdle;
  return engine.idleRpm + shaped * ((throttle < 0 ? engine.reverseRpm : engine.maxRpm) - engine.idleRpm);
}

/** Deterministic clutch dwell and engine response; independent of React. */
export function stepEngineDynamics(
  current: EngineDynamics,
  demand: number,
  running: boolean,
  starting: boolean,
  deltaSeconds: number,
  engine: EngineSpecification = DEFAULT_ENGINE,
  turboRequested = false,
): EngineDynamics {
  const dt = Math.max(0, Math.min(0.1, deltaSeconds));
  if (!running) {
    return { ...createEngineDynamics(), rpm: starting ? 220 : 0 };
  }

  const requestedGear = Math.sign(demand) as EngineGear;
  let { gear, effectiveThrottle, shiftRemaining } = current;

  if (requestedGear !== gear) {
    if (gear !== 0) {
      gear = 0;
      // Clutch opens immediately: neutral removes drive, never boat momentum.
      effectiveThrottle = 0;
      shiftRemaining = 0.55;
    } else if (requestedGear !== 0 && shiftRemaining === 0) {
      gear = requestedGear;
      shiftRemaining = 0.25;
    }
  }

  if (shiftRemaining > 0) {
    shiftRemaining = Math.max(0, shiftRemaining - dt);
    effectiveThrottle = 0;
  } else if (gear !== 0) {
    const rate = Math.abs(demand) < Math.abs(effectiveThrottle) ? 4.5 : engine.throttleRisePerSecond;
    effectiveThrottle += Math.sign(demand - effectiveThrottle) * Math.min(Math.abs(demand - effectiveThrottle), rate * dt);
  }

  const turboActive = turboRequested && demand >= TURBO_MIN_THROTTLE && effectiveThrottle >= TURBO_MIN_THROTTLE && gear === 1 && shiftRemaining === 0;
  const targetRpm = turboActive ? TURBO_RPM : rpmFromThrottle(effectiveThrottle, engine);
  const rpm = current.rpm + (targetRpm - current.rpm) * (1 - Math.exp(-dt * engine.rpmResponse));
  return { effectiveThrottle, gear, shiftRemaining, rpm, turboActive };
}

/** Arcade boost still acts through its own propeller and follows spool-up. */
export function turboThrustMultiplier(engine: { running: boolean; turboActive: boolean; rpm: number }, specification: EngineSpecification) {
  if (!engine.running || !engine.turboActive) return 1;
  return Math.max(1, Math.min(TURBO_RPM, engine.rpm) / specification.maxRpm) ** 2;
}
