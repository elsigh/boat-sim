import type { RapierRigidBody } from "@react-three/rapier";
import type { MutableRefObject } from "react";

/**
 * Returns the rigid body only if it is safe to read this frame.
 *
 * React StrictMode (and marina switches) tear down and rebuild the rapier
 * world; render-loop code holding a ref can observe a body whose WASM memory
 * is already freed. Touching it — even `isValid()` — throws "null pointer
 * passed to rust", and one uncaught throw inside useFrame kills the whole
 * @react-three/fiber frame loop. Hence the belt-and-suspenders try/catch.
 */
export function liveRigidBody(
  ref: MutableRefObject<RapierRigidBody | null>,
): RapierRigidBody | null {
  const body = ref.current;

  if (!body) {
    return null;
  }

  try {
    if (!body.isValid()) {
      return null;
    }
  } catch {
    return null;
  }

  return body;
}
