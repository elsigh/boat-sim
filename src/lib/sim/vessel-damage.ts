import type { BoatProfile } from "../boats/catalog";
import type { TwinEngineState } from "../../hooks/useEngineState";
import type { ImpactIncident } from "./collision-damage";

/** Gameplay approximation of compartment flooding, not a stability calculation.
 * All progression uses simulation seconds, so opening the plotter pauses it. */
export type VesselDamage = {
  hullIntegrityPct: number;
  floodingPct: number;
  breach: number;
  fire: number;
  portDamage: number;
  starboardDamage: number;
  listBias: number;
  trimBias: number;
  sinking: number;
  /** Structural separation, distinct from loss of watertight integrity. */
  breakup: number;
};

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

export function createVesselDamage(): VesselDamage {
  return { hullIntegrityPct: 100, floodingPct: 0, breach: 0, fire: 0,
    portDamage: 0, starboardDamage: 0, listBias: 0, trimBias: 0, sinking: 0, breakup: 0 };
}

export function applyVesselImpact(state: VesselDamage, hit: ImpactIncident, lengthM: number): VesselDamage {
  if (state.sinking >= 1) return state;
  const hullIntegrityPct = Math.max(0, state.hullIntegrityPct - hit.hullDamagePct);
  const structural = hit.severity === "major" || hit.severity === "severe";
  const severe = hit.severity === "severe";
  const machineryHit = structural && hit.local.z < lengthM * 0.12;
  const driveLoss = machineryHit ? hit.hullDamagePct / 100 * 0.85 : 0;
  const side = clamp(hit.local.x / 0.8, -1, 1);
  const breach = clamp(state.breach + (severe ? hit.hullDamagePct / 100 : 0)
    + (structural && hullIntegrityPct < 30 ? 0.15 : 0));
  const breakup = structural ? Math.max(state.breakup, clamp((45 - hullIntegrityPct) / 45)) : state.breakup;
  // Once the hull separates through its machinery compartments, even a
  // bow-first ram can tear fuel lines and electrical feeds out of the engines.
  const ignites = (machineryHit || breakup >= 0.65) && hit.closingSpeedKnots >= 8 && state.floodingPct < 55;
  const ignition = clamp(0.45 + (hit.closingSpeedKnots - 8) * 0.016 + breakup * 0.15, 0.45, 0.85);
  return { ...state, hullIntegrityPct, breach, breakup,
    fire: ignites ? Math.max(state.fire, ignition) : state.fire,
    portDamage: clamp(state.portDamage + driveLoss * (side >= 0 ? 1 : 0.2)),
    starboardDamage: clamp(state.starboardDamage + driveLoss * (side <= 0 ? 1 : 0.2)),
    listBias: structural ? clamp(state.listBias + side * hit.hullDamagePct / 100, -1, 1) : state.listBias,
    trimBias: structural ? clamp(state.trimBias + hit.local.z / (lengthM * 0.5) * hit.hullDamagePct / 100, -1, 1) : state.trimBias,
  };
}

export function stepVesselDamage(state: VesselDamage, dt: number, massKg: number): VesselDamage {
  if (dt <= 0 || !Number.isFinite(dt) || state.sinking >= 1 || (!state.breach && !state.fire)) return state;
  const sizeResponse = clamp(Math.sqrt(26308 / Math.max(500, massKg)), 0.45, 2.2);
  // Automatic bilge pump copes with seepage, but cannot keep up with a hole.
  const ingress = (state.breach * 1.6 + state.breakup ** 2 * 18) * sizeResponse * (1 + state.floodingPct / 160);
  const floodingPct = clamp(state.floodingPct + (ingress - 0.1) * dt, 0, 100);
  const fire = floodingPct > 65 || state.sinking > 0.15
    ? Math.max(0, state.fire - dt * 0.22)
    : state.fire > 0 ? clamp(state.fire + dt * 0.025) : 0;
  const hullIntegrityPct = Math.max(0, state.hullIntegrityPct - fire * dt * 0.4);
  const breakup = state.breakup > 0 ? clamp(state.breakup + dt * (state.hullIntegrityPct < 10 ? 0.09 : 0.008)) : 0;
  const sinking = floodingPct >= 78 ? clamp(state.sinking + dt / (38 - breakup * 26)) : state.sinking;
  return { ...state, floodingPct, fire, hullIntegrityPct, sinking, breakup,
    breach: clamp(state.breach + fire * dt * 0.002) };
}

/** The struck boat takes the hit in its own local frame. A fractured hull is
 * destroyed, even when its yielding structure spares some of the player's hull. */
export function applyTargetVesselImpact(state: VesselDamage, hit: ImpactIncident, lengthM: number): VesselDamage {
  return applyVesselImpact(state, { ...hit, hullDamagePct: hit.fracture ? 100 : hit.hullDamagePct,
    local: hit.targetLocal ?? { x: 1, z: 0 } }, lengthM);
}

export function damageHandling(state: VesselDamage) {
  const stopped = state.floodingPct >= 62 || state.sinking > 0 || state.breakup >= 0.85;
  const reserve = (1 - state.floodingPct / 120) * (1 - state.fire * 0.5) * (1 - state.breakup * 0.7);
  return {
    portPower: stopped ? 0 : reserve * Math.max(0, 1 - state.portDamage),
    starboardPower: stopped ? 0 : reserve * Math.max(0, 1 - state.starboardDamage),
    drag: state.floodingPct / 100 * 2.5 + (100 - state.hullIntegrityPct) / 100 * 0.4 + state.breakup * 1.4,
    stopped,
  };
}

/** Keep tachs, sound, prop wash and actual propulsion in agreement. */
export function damagedEngineState(engines: TwinEngineState, damage: VesselDamage): TwinEngineState {
  const handling = damageHandling(damage);
  if (handling.portPower === 1 && handling.starboardPower === 1) return engines;
  const channel = (engine: TwinEngineState["port"], power: number) => ({ ...engine,
    turboActive: engine.turboActive && damage.floodingPct < 1 && power > 0.03,
    running: engine.running && power > 0.03,
    starting: engine.starting && power > 0.03,
    rpm: power > 0.03 ? engine.rpm * (0.55 + power * 0.45) : 0,
    effectiveThrottle: power > 0.03 ? engine.effectiveThrottle * power : 0,
  });
  return { ...engines, port: channel(engines.port, handling.portPower), starboard: channel(engines.starboard, handling.starboardPower) };
}

export function damagePose(state: VesselDamage, lengthM: number) {
  const flood = state.floodingPct / 100;
  return {
    // +x is port, so a port breach needs negative rotation around +z.
    roll: -state.listBias * (flood * 0.28 + state.sinking * 0.55),
    pitch: state.trimBias * (flood * 0.12 + state.sinking * 0.32),
    sinkDepth: flood * 0.85 + state.sinking ** 1.5 * Math.max(7, lengthM * 0.55),
  };
}
