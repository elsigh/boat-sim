const METERS_PER_SECOND_TO_KNOTS = 1 / 0.514444;

export type ImpactSurface =
  | "dock"
  | "piling"
  | "land"
  | "moored"
  | "traffic"
  | "unknown";

export type ImpactSeverity = "scuff" | "minor" | "major" | "severe";

/** Raw contact sample straight from the physics callback, before filtering. */
export type RawImpact = {
  /** Collider name of what was struck, e.g. "dock:fh-g-finger-left-3". */
  otherName: string;
  /** Speed component toward the obstacle just before the solver ran, m/s. */
  closingSpeedMps: number;
  /** Approximate contact point in world space. */
  world: { x: number; z: number };
  /** Approximate contact point in the boat's local frame (+z bow, +x port). */
  local: { x: number; z: number };
  atMs: number;
};

export type ImpactIncident = {
  id: number;
  atMs: number;
  surface: ImpactSurface;
  /** Human label of the struck object ("finger dock", "piling", ...). */
  surfaceLabel: string;
  objectName: string;
  closingSpeedKnots: number;
  severity: ImpactSeverity;
  /** Hull integrity lost by this hit, percentage points. */
  hullDamagePct: number;
  /** Where on the boat: "port bow", "starboard quarter", ... */
  hullLocation: string;
  description: string;
  world: { x: number; z: number };
  local: { x: number; z: number };
};

// Anything slower than a firm fender push is a normal docking touch.
const HARMLESS_BELOW_KNOTS = 0.6;
// While resting against a dock the contact fires every frame; only log a new
// incident against the same object after it has had time to be a new event.
const PER_OBJECT_COOLDOWN_MS = 1500;

export function severityForClosingSpeed(knots: number): ImpactSeverity | null {
  if (knots < HARMLESS_BELOW_KNOTS) {
    return null;
  }

  if (knots < 1.2) {
    return "scuff";
  }

  if (knots < 2.5) {
    return "minor";
  }

  if (knots < 5) {
    return "major";
  }

  return "severe";
}

/**
 * Percentage points of hull integrity lost. Tuned so a 1 kt bump costs ~2%,
 * 2.5 kt ~11%, and anything over 6 kt into a solid object is catastrophic.
 * Kinetic energy grows with v^2; gelcoat and planking fail super-linearly
 * once the fenders bottom out, hence the 1.6 exponent on the excess speed.
 */
export function hullDamageForClosingSpeed(knots: number): number {
  const excess = Math.max(0, knots - HARMLESS_BELOW_KNOTS + 0.05);
  return Math.min(80, Math.round(Math.pow(excess, 1.6) * 6 * 10) / 10);
}

export function classifySurface(colliderName: string | undefined): {
  surface: ImpactSurface;
  surfaceLabel: string;
} {
  const [prefix = "", rest = ""] = (colliderName ?? "").split(":");

  switch (prefix) {
    case "dock":
      return {
        surface: "dock",
        surfaceLabel: /finger/.test(rest) ? "finger dock" : "dock",
      };
    case "piling":
      return { surface: "piling", surfaceLabel: "piling" };
    case "land":
      return { surface: "land", surfaceLabel: "shore" };
    case "moored":
      return { surface: "moored", surfaceLabel: "moored boat" };
    case "traffic":
      return { surface: "traffic", surfaceLabel: "passing boat" };
    default:
      return { surface: "unknown", surfaceLabel: "obstruction" };
  }
}

/** Port is local +x in this frame; bow is +z. */
export function describeHullLocation(
  local: { x: number; z: number },
  boatLengthM: number,
): string {
  const alongRatio = local.z / Math.max(1, boatLengthM * 0.5);
  const side = local.x > 0.35 ? "port" : local.x < -0.35 ? "starboard" : "";
  const along =
    alongRatio > 0.55 ? "bow" : alongRatio < -0.55 ? (side ? "quarter" : "stern") : "amidships";

  if (alongRatio > 0.85 && Math.abs(local.x) < 0.6) {
    return "stem";
  }

  return side ? `${side} ${along}` : along;
}

function describeIncident(
  severity: ImpactSeverity,
  surface: ImpactSurface,
  surfaceLabel: string,
  hullLocation: string,
  knots: number,
): string {
  const speed = `${knots.toFixed(1)} kt`;

  if (surface === "land" && severity !== "scuff") {
    return severity === "severe"
      ? `Ran hard aground at ${speed} — hull holed at the ${hullLocation}.`
      : `Ran aground at ${speed} — keel and ${hullLocation} scraped.`;
  }

  switch (severity) {
    case "scuff":
      return `Firm touch on the ${surfaceLabel} at ${speed} — fenders took it, gelcoat scuffed on the ${hullLocation}.`;
    case "minor":
      return `Hit the ${surfaceLabel} at ${speed} — gelcoat cracked along the ${hullLocation}.`;
    case "major":
      return surface === "dock" || surface === "piling"
        ? `Slammed the ${surfaceLabel} at ${speed} — splintered the timber and stove in the ${hullLocation}.`
        : `Collided with a ${surfaceLabel} at ${speed} — serious damage to both hulls at your ${hullLocation}.`;
    case "severe":
      return surface === "dock" || surface === "piling"
        ? `Drove into the ${surfaceLabel} at ${speed} — dock section destroyed, hull breached at the ${hullLocation}.`
        : `Catastrophic collision with a ${surfaceLabel} at ${speed} — hull breached at the ${hullLocation}.`;
  }
}

/**
 * Turns the raw per-frame contact stream into discrete incidents: applies the
 * harmless-speed floor and a per-object cooldown so resting against a dock
 * doesn't rack up damage every physics step.
 */
export class ImpactTracker {
  private lastIncidentAt = new Map<string, number>();
  private nextId = 1;

  reset() {
    this.lastIncidentAt.clear();
  }

  register(raw: RawImpact, boatLengthM: number): ImpactIncident | null {
    const knots = raw.closingSpeedMps * METERS_PER_SECOND_TO_KNOTS;
    const severity = severityForClosingSpeed(knots);

    if (!severity) {
      return null;
    }

    const lastAt = this.lastIncidentAt.get(raw.otherName);

    if (lastAt !== undefined && raw.atMs - lastAt < PER_OBJECT_COOLDOWN_MS) {
      return null;
    }

    this.lastIncidentAt.set(raw.otherName, raw.atMs);

    const { surface, surfaceLabel } = classifySurface(raw.otherName);
    const hullLocation = describeHullLocation(raw.local, boatLengthM);
    const hullDamagePct = hullDamageForClosingSpeed(knots);

    return {
      id: this.nextId++,
      atMs: raw.atMs,
      surface,
      surfaceLabel,
      objectName: raw.otherName,
      closingSpeedKnots: Math.round(knots * 10) / 10,
      severity,
      hullDamagePct,
      hullLocation,
      description: describeIncident(severity, surface, surfaceLabel, hullLocation, knots),
      world: raw.world,
      local: raw.local,
    };
  }
}
