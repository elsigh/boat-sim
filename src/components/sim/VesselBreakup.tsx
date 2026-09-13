"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import { DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial, Vector3, type Material } from "three";
import type { VesselDamage } from "@/lib/sim/vessel-damage";
import { appendClippedGeometry, emptyFragment, fragmentGeometry, type FragmentBuffers } from "@/lib/sim/fracture-geometry";

type Piece = { group: Group; center: Vector3; side: number; row: number; phase: number };
type Wreck = { pieces: Piece[]; materials: Material[]; separation: number };

function disposeWreck(wreck: Wreck | null) {
  if (!wreck) return;
  for (const { group } of wreck.pieces) {
    group.traverse((object) => { if (object instanceof Mesh) object.geometry.dispose(); });
    group.removeFromParent();
  }
  for (const material of wreck.materials) material.dispose();
}

function materialKey(material: Material) {
  if (!(material instanceof MeshStandardMaterial)) return material.uuid;
  return [material.type, material.color.getHex(), material.map?.uuid, material.roughness, material.metalness,
    material.transparent, material.opacity, material.emissive.getHex(), material.emissiveIntensity].join(":");
}

/** Snapshot the actual fleet model, then split its hull, decks, windows and
 * fittings into eight islands. Intact boats incur no geometry work each frame. */
function breakModel(source: Group, destination: Group, lengthM: number, beamM: number): Wreck {
  source.updateWorldMatrix(true, true);
  const inverse = source.matrixWorld.clone().invert(), transform = new Matrix4();
  const materials = new Map<string, Material>();
  const pieces: Piece[] = [];
  for (let row = 0; row < 4; row++) for (const side of [-1, 1]) {
    const aft = row === 0 ? -lengthM * 2 : (row / 4 - 0.5) * lengthM;
    const fore = row === 3 ? lengthM * 2 : ((row + 1) / 4 - 0.5) * lengthM;
    const bounds = { left: side < 0 ? -beamM * 3 : 0, right: side < 0 ? 0 : beamM * 3, aft, fore };
    const batches = new Map<string, FragmentBuffers>();
    source.traverseVisible((object) => {
      if (!(object instanceof Mesh) || object.type === "InstancedMesh") return;
      const geometry = object.geometry;
      transform.multiplyMatrices(inverse, object.matrixWorld);
      const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.index?.count ?? geometry.getAttribute("position").count, materialIndex: 0 }];
      for (const group of groups) {
        const original: Material = Array.isArray(object.material) ? object.material[group.materialIndex ?? 0] : object.material;
        if (!original) continue;
        const key = materialKey(original);
        if (!materials.has(key)) { const material = original.clone(); material.side = DoubleSide; materials.set(key, material); }
        if (!batches.has(key)) batches.set(key, emptyFragment());
        appendClippedGeometry(geometry, transform, group.start, group.count, bounds, batches.get(key)!);
      }
    });
    const center = new Vector3(side * beamM * 0.22, 0, ((row + 0.5) / 4 - 0.5) * lengthM);
    const group = new Group();
    for (const [key, buffers] of batches) {
      if (!buffers.positions.length) continue;
      const geometry = fragmentGeometry(buffers); geometry.translate(-center.x, 0, -center.z);
      const mesh = new Mesh(geometry, materials.get(key)); mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.position.copy(center); destination.add(group);
    pieces.push({ group, center, side, row, phase: row * 1.7 + side });
  }
  return { pieces, materials: [...materials.values()], separation: 0 };
}

export function VesselBreakup({ damageRef, lengthM, beamM, children }: {
  damageRef?: MutableRefObject<VesselDamage>; lengthM: number; beamM: number; children: ReactNode;
}) {
  const source = useRef<Group>(null), fragments = useRef<Group>(null), wreck = useRef<Wreck | null>(null);
  const age = useRef(0);
  useEffect(() => () => { disposeWreck(wreck.current); wreck.current = null; }, [lengthM, beamM]);
  useFrame((_, delta) => {
    if (!source.current || !fragments.current) return;
    const damage = damageRef?.current, target = damage?.breakup ?? 0;
    if (target <= 0) {
      if (wreck.current) { disposeWreck(wreck.current); wreck.current = null; }
      source.current.visible = true; age.current = 0; return;
    }
    if (!wreck.current) wreck.current = breakModel(source.current, fragments.current, lengthM, beamM);
    source.current.visible = false;
    const dt = Math.min(delta, 0.05); age.current += dt;
    wreck.current.separation += (target - wreck.current.separation) * (1 - Math.exp(-dt * 3));
    const split = wreck.current.separation;
    for (const piece of wreck.current.pieces) {
      // Opening seams develop into detached, rolling bow/stern quarters. Each
      // section settles differently instead of one intact yacht disappearing.
      const end = Math.abs(piece.row - 1.5) / 1.5;
      const released = Math.max(0, split - (1 - end) * 0.2);
      piece.group.position.set(piece.center.x + piece.side * released * beamM * (0.25 + end * 0.6),
        Math.sin(age.current * 1.8 + piece.phase) * released * 0.12 - released * end * 0.8,
        piece.center.z + Math.sign(piece.row - 1.5) * released * lengthM * 0.14);
      piece.group.rotation.set((piece.row - 1.5) * released * 0.28,
        piece.side * released * (0.12 + end * 0.2), -piece.side * released * (0.2 + end * 0.7));
    }
  });
  return <><group ref={source}>{children}</group><group ref={fragments} /></>;
}
