/** Twin levers are independent. Only trim the hardware's neutral noise. */
export const THROTTLE_NEUTRAL_DEADBAND = 0.045;
export const ENGINE_IDLE_RPM = 650;
export const ENGINE_MAX_RPM = 2400;
export type EngineGear = -1 | 0 | 1;

export type EngineDynamics = {
  effectiveThrottle: number;
  gear: EngineGear;
  shiftRemaining: number;
  rpm: number;
};

export function createEngineDynamics(): EngineDynamics {
  return { effectiveThrottle: 0, gear: 0, shiftRemaining: 0, rpm: 0 };
}

export function normalizeThrottle(value: number) {
  const magnitude = Math.min(1, Math.abs(value));
  return magnitude <= THROTTLE_NEUTRAL_DEADBAND
    ? 0
    : Math.sign(value) * (magnitude - THROTTLE_NEUTRAL_DEADBAND) / (1 - THROTTLE_NEUTRAL_DEADBAND);
}

export function rpmFromThrottle(throttle: number) {
  const magnitude = Math.min(1, Math.abs(throttle));
  const shaped = 0.22 * magnitude + 0.78 * magnitude ** 1.6;
  return ENGINE_IDLE_RPM + shaped * ((throttle < 0 ? 1400 : ENGINE_MAX_RPM) - ENGINE_IDLE_RPM);
}

/** Deterministic clutch dwell and engine response; independent of React. */
export function stepEngineDynamics(
  current: EngineDynamics,
  demand: number,
  running: boolean,
  starting: boolean,
  deltaSeconds: number,
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
    const rate = Math.abs(demand) < Math.abs(effectiveThrottle) ? 4.5 : 3.2;
    effectiveThrottle += Math.sign(demand - effectiveThrottle) * Math.min(Math.abs(demand - effectiveThrottle), rate * dt);
  }

  const targetRpm = rpmFromThrottle(effectiveThrottle);
  const rpm = current.rpm + (targetRpm - current.rpm) * (1 - Math.exp(-dt * 6));
  return { effectiveThrottle, gear, shiftRemaining, rpm };
}
