import type { RapierCollider, RapierContext, RapierRigidBody } from "@react-three/rapier";
import { Quaternion, Vector3 } from "three";
import type { Fracture, RawImpact } from "./collision-damage";

/** Timber rupture consumes work, not all of the vessel's momentum. Tangential
 * motion is untouched. Low-speed docking and insufficient-energy hits stay solid. */
export function velocityAfterFracture(speedMps: number, massKg: number, workJ: number): number | null {
  if (!Number.isFinite(speedMps) || speedMps < 2.5 || massKg <= 0 || workJ <= 0) return null;
  const energy = 0.5 * massKg * speedMps * speedMps;
  if (energy < workJ * 1.2) return null;
  return Math.sqrt(2 * (energy - workJ) / massKg);
}

/** Runs before Rapier's contact solver. Sweep the actual rounded hull through
 * this step, disable only failed members immediately, then publish their IDs
 * for React's matching deck/collider removal. A solid obstacle ends the sweep. */
export function fractureAlongSweep(
  world: RapierContext["world"], body: RapierRigidBody, massKg: number, dt: number,
  getMember: (collider: RapierCollider) => Fracture | undefined,
  report: (hit: RawImpact) => void,
) {
  if (dt <= 0 || body.numColliders() === 0) return 0;
  const hull = body.collider(0);
  if (hull.isSensor()) return 0;
  const position = hull.translation(), rotation = hull.rotation();
  const inverse = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).invert();
  let count = 0;
  // Bound the work in a single physics tick, even in a dense field of rubble.
  for (; count < 32; count++) {
    const velocity = body.linvel();
    if (Math.hypot(velocity.x, velocity.z) < 2.5) break;
    const hit = world.castShape(position, rotation, velocity, hull.shape, 0.04, dt, false,
      undefined, hull.collisionGroups(), hull, body, (collider) => collider.isEnabled() && !collider.isSensor());
    if (!hit) break;
    const member = getMember(hit.collider);
    if (!member) break; // Land, stone breakwaters and other solid objects remain solid.
    // World queries return the obstacle witness and outward normal in world space.
    const normal = new Vector3(-hit.normal1.x, 0, -hit.normal1.z);
    if (normal.lengthSq() < 0.1) break;
    normal.normalize();
    const otherBody = hit.collider.parent();
    const otherVelocity = otherBody?.linvel() ?? { x: 0, z: 0 };
    const closing = (velocity.x - otherVelocity.x) * normal.x + (velocity.z - otherVelocity.z) * normal.z;
    const remaining = velocityAfterFracture(closing, massKg, member.workJ);
    if (remaining === null) break;
    const local = new Vector3(hit.witness1.x - position.x - velocity.x * hit.time_of_impact, 0,
      hit.witness1.z - position.z - velocity.z * hit.time_of_impact).applyQuaternion(inverse);
    const targetLocal = new Vector3(hit.witness1.x, hit.witness1.y, hit.witness1.z);
    if (otherBody) {
      const p = otherBody.translation(), r = otherBody.rotation();
      targetLocal.sub(new Vector3(p.x, p.y, p.z)).applyQuaternion(new Quaternion(r.x, r.y, r.z, r.w).invert());
    }
    hit.collider.setEnabled(false);
    const loss = closing - remaining;
    body.setLinvel({ x: velocity.x - normal.x * loss, y: 0, z: velocity.z - normal.z * loss }, true);
    report({ otherName: member.objectName, fracture: member, vesselMassKg: massKg, targetVessel: member.vessel,
      closingSpeedMps: closing, world: { x: hit.witness1.x, z: hit.witness1.z },
      local: { x: local.x, z: local.z }, targetLocal: { x: targetLocal.x, z: targetLocal.z },
      normal: { x: normal.x, z: normal.z }, atMs: performance.now() });
  }
  return count;
}
