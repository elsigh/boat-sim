"use client";

// Installed as a temporary dev route by capture-boat-portraits.mjs.
import { Suspense, useCallback, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Box3, Group, OrthographicCamera, Vector3 } from "three";
import { BoatVisual } from "@/components/sim/BoatVisual";
import { BOAT_CATALOG, getBoatProfile, type BoatProfile } from "@/lib/boats/catalog";

function Portrait({ boat, onReady }: { boat: BoatProfile; onReady: () => void }) {
  const hull = useRef<Group>(null);
  const frames = useRef(0);
  const { camera, size } = useThree();

  useLayoutEffect(() => {
    if (!hull.current || !(camera instanceof OrthographicCamera)) return;
    hull.current.updateWorldMatrix(true, true);
    const bounds = new Box3().setFromObject(hull.current);
    const center = bounds.getCenter(new Vector3());
    // Show the bow and port side, with enough elevation to see the deck plan.
    camera.position.copy(center).add(new Vector3(-1.15, 0.68, 0.85).normalize().multiplyScalar(boat.lengthM * 3));
    camera.lookAt(center);
    camera.updateMatrixWorld();
    const projected = new Box3();
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          projected.expandByPoint(new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
        }
      }
    }
    const span = projected.getSize(new Vector3());
    camera.zoom = Math.min(size.width / span.x, size.height / span.y) * 0.85;
    camera.updateProjectionMatrix();
    frames.current = 0;
  }, [boat, camera, size]);

  useFrame(() => {
    // Allow material textures and the fitted camera to render before capture.
    frames.current += 1;
    if (frames.current === 5) onReady();
  });

  return <group ref={hull}><BoatVisual boat={boat} turboActive={false} /></group>;
}

function Studio() {
  const params = useSearchParams();
  const boat = getBoatProfile(params.get("boat"));
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <main
      style={{ width: 1200, height: 750, background: "#122631" }}
      data-portrait-ready={ready ? boat.profileSlug : undefined}
      data-boat-slugs={BOAT_CATALOG.map((entry) => entry.profileSlug).join(",")}
    >
      <Canvas orthographic dpr={1} camera={{ position: [-30, 20, 25], near: 0.1, far: 1000 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
        <color attach="background" args={["#122631"]} />
        <hemisphereLight args={["#e2f3ff", "#698594", 2]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[-25, 45, 30]} intensity={3.5} color="#fff2d8" />
        <directionalLight position={[20, 15, -30]} intensity={2} color="#badfeb" />
        <Portrait boat={boat} onReady={onReady} />
      </Canvas>
    </main>
  );
}

export default function BoatPortraitStudio() {
  return <Suspense fallback={null}><Studio /></Suspense>;
}
