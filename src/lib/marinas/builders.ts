import type { DockFloat, PilingRun, Vec2 } from "./types";

export function degToRad(value: number) {
  return (value * Math.PI) / 180;
}

/** Unit vector pointing toward a bearing (degrees true). */
export function bearingVector(bearingDeg: number): Vec2 {
  const radians = degToRad(bearingDeg);
  return [Math.sin(radians), Math.cos(radians)];
}

export function offset(origin: Vec2, bearingDeg: number, distanceM: number): Vec2 {
  const [dx, dz] = bearingVector(bearingDeg);
  return [origin[0] + dx * distanceM, origin[1] + dz * distanceM];
}

/**
 * A main walkway float with finger piers, the standard PNW marina module.
 * Fingers run perpendicular to the walkway on the requested sides.
 */
export function walkwayWithFingers(options: {
  id: string;
  center: Vec2;
  bearingDeg: number;
  lengthM: number;
  walkwayWidthM?: number;
  fingerLengthM: number;
  fingerSpacingM?: number;
  fingerWidthM?: number;
  sides: Array<"left" | "right">;
  color?: string;
}): { docks: DockFloat[]; pilings: PilingRun[] } {
  const {
    id,
    center,
    bearingDeg,
    lengthM,
    walkwayWidthM = 2.4,
    fingerLengthM,
    fingerSpacingM = 10.4,
    fingerWidthM = 0.95,
    sides,
    color,
  } = options;

  const docks: DockFloat[] = [
    {
      id,
      position: center,
      size: [walkwayWidthM, lengthM],
      rotationDeg: bearingDeg,
      color,
    },
  ];
  const pilings: PilingRun[] = [];
  const fingerCount = Math.max(1, Math.floor(lengthM / fingerSpacingM) - 1);

  for (const side of sides) {
    // "left" is 90° counterclockwise from the walkway bearing.
    const sideBearing = bearingDeg + (side === "left" ? -90 : 90);

    for (let index = 0; index < fingerCount; index += 1) {
      const along = -lengthM * 0.5 + (index + 1) * (lengthM / (fingerCount + 1));
      const root = offset(center, bearingDeg, along);
      const fingerCenter = offset(
        root,
        sideBearing,
        walkwayWidthM * 0.5 + fingerLengthM * 0.5,
      );

      docks.push({
        id: `${id}-finger-${side}-${index}`,
        position: fingerCenter,
        size: [fingerWidthM, fingerLengthM],
        rotationDeg: sideBearing,
      });

      const tip = offset(root, sideBearing, walkwayWidthM * 0.5 + fingerLengthM);
      pilings.push({
        id: `${id}-finger-piling-${side}-${index}`,
        from: tip,
        to: tip,
        count: 1,
      });
    }
  }

  return { docks, pilings };
}

/** Evenly spaced pilings along a float's outboard face. */
export function pilingsAlong(options: {
  id: string;
  center: Vec2;
  bearingDeg: number;
  lengthM: number;
  offsetM: number;
  count: number;
}): PilingRun {
  const { id, center, bearingDeg, lengthM, offsetM, count } = options;
  const sideBearing = bearingDeg + 90;
  const lineCenter = offset(center, sideBearing, offsetM);

  return {
    id,
    from: offset(lineCenter, bearingDeg, -lengthM * 0.5),
    to: offset(lineCenter, bearingDeg, lengthM * 0.5),
    count,
  };
}
