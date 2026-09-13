"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { geoToChart, type ChartData } from "@/lib/charts";
import { terrainHeightAt } from "@/lib/charts/terrain-relief";
import { ROCHE_COTTAGES, ROCHE_LANDMARKS } from "@/lib/marinas/roche-landmarks";

const ROOF = "#4c5753";
const SIDING = "#e3ddd0";
const GLASS = "#495e62";

type PartProps = { at: [number, number, number]; size: [number, number, number]; color?: string };
function Block({ at, size, color = SIDING }: PartProps) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.85} /></mesh>;
}

/** A small pyramidal roof for dormers and the chapel steeple. */
function Roof({ at, size, color = ROOF }: PartProps) {
  return <mesh position={at} rotation={[0, Math.PI / 4, 0]} scale={[size[0] / Math.SQRT2, size[1], size[2] / Math.SQRT2]} castShadow>
    <cylinderGeometry args={[0, 1, 1, 4, 1]} />
    <meshStandardMaterial color={color} roughness={0.93} />
  </mesh>;
}

// The pitched roof used by the cottage instances has a continuous ridge.
function cottageRoof() {
  const g = new BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, 0);
  g.computeVertexNormals();
  return g;
}

function Gable({ at, size, color = ROOF }: PartProps) {
  const geometry = useMemo(cottageRoof, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={at} scale={size} castShadow><meshStandardMaterial color={color} roughness={0.92} /></mesh>;
}

function HillHouse() {
  return <group name="Roche hill house — architectural impression" rotation={[0, -0.7, 0]}>
    <Block at={[0, -0.9, 0]} size={[29, 2.4, 18]} color="#858575" />
    <Block at={[0, 4.6, 0]} size={[25, 9.2, 14]} />
    <Gable at={[0, 12.1, 0]} size={[26.5, 6.8, 15]} />
    <Block at={[-8, 4.9, 4]} size={[7, 9.8, 13]} color="#eae4d8" />
    <Gable at={[-8, 12, 4]} size={[8, 5.2, 14]} />
    <Block at={[1, 2.3, 8]} size={[19, 0.24, 4]} color="#cbc6b6" />
    <Block at={[1, 4.8, 8]} size={[19.8, 0.22, 4.3]} color="#ded6c3" />
    {[-7, -3, 1, 5, 9].map((x) => <Block key={x} at={[x, 3.6, 9.6]} size={[0.22, 2.6, 0.22]} color="#f2eadb" />)}
    {[-7, -2, 3, 8].flatMap((x) => [3.3, 7.1].map((y) => <Block key={`${x}-${y}`} at={[x, y, 7.05]} size={[1.25, 2.15, 0.1]} color={GLASS} />))}
    {[-5, 2, 8].map((x) => <group key={x} position={[x, 10.8, 6]}>
      <Block at={[0, 0, 0]} size={[2.1, 2.2, 2]} />
      <Roof at={[0, 1.8, 0]} size={[2.9, 2.2, 2.8]} />
      <Block at={[0, 0, 1.06]} size={[0.85, 1.45, 0.05]} color={GLASS} />
    </group>)}
    {/* The taller octagonal turret is the distant silhouette, not an oversized castle. */}
    <mesh position={[11, 6.7, 5.5]} castShadow><cylinderGeometry args={[2.75, 2.9, 13.4, 8]} /><meshStandardMaterial color="#ddd7c9" roughness={0.85} /></mesh>
    <mesh position={[11, 16.5, 5.5]} castShadow><coneGeometry args={[3.4, 6.2, 8]} /><meshStandardMaterial color={ROOF} roughness={0.94} /></mesh>
    <Block at={[11, 10.1, 8.28]} size={[0.9, 2.1, 0.08]} color={GLASS} />
    <mesh position={[-11.5, 11, -4.8]} castShadow><cylinderGeometry args={[1.8, 1.9, 5.6, 8]} /><meshStandardMaterial color={SIDING} /></mesh>
    <mesh position={[-11.5, 15.1, -4.8]} castShadow><coneGeometry args={[2.2, 3.2, 8]} /><meshStandardMaterial color={ROOF} /></mesh>
    <Block at={[3, 13.8, -3]} size={[1.5, 4.8, 1.4]} color="#796e60" />
  </group>;
}

function Chapel() {
  return <group name="Our Lady of Good Voyage Chapel" rotation={[0, -1.17, 0]}>
    <Block at={[0, -0.5, 0]} size={[8.6, 1.4, 13]} color="#908b77" />
    <Block at={[0, 2.6, 0]} size={[7.4, 5.2, 12]} color="#ede9dc" />
    <Gable at={[0, 7, 0]} size={[8.4, 3.8, 13]} color="#526156" />
    <Block at={[0, 4.3, 5.7]} size={[2.8, 8.6, 2.8]} color="#eee9de" />
    <Roof at={[0, 11, 5.7]} size={[3.4, 4.8, 3.4]} color="#526156" />
    <Block at={[0, 14, 5.7]} size={[0.13, 1.4, 0.13]} color="#d9d2bc" />
    <Block at={[0, 14.15, 5.7]} size={[0.7, 0.12, 0.12]} color="#d9d2bc" />
    <Block at={[0, 1.4, 7.15]} size={[1.25, 2.8, 0.12]} color="#57483a" />
    {[-3.75, 3.75].flatMap((x) => [-3.7, 0, 3.6].map((z) => <Block key={`${x}-${z}`} at={[x, 3.1, z]} size={[0.07, 2.1, 0.9]} color={GLASS} />))}
  </group>;
}

function Hotel() {
  return <group name="Hotel de Haro" rotation={[0, -0.56, 0]}>
    <Block at={[0, -0.8, 0]} size={[12, 2, 28]} color="#a29882" />
    <Block at={[0, 3.7, 0]} size={[10, 7.4, 27]} color="#eee5c8" />
    <Gable at={[0, 9.15, 0]} size={[12.2, 3.5, 29]} color="#894f43" />
    <Block at={[6.4, 3.4, 0]} size={[3.2, 0.2, 28]} color="#ded5be" />
    <Block at={[6.4, 6.6, 0]} size={[3.3, 0.2, 28.5]} color="#eee4ce" />
    {[-12, -8, -4, 0, 4, 8, 12].map((z) => <group key={z}>
      <Block at={[7.7, 3.35, z]} size={[0.18, 6.7, 0.18]} color="#f4edd9" />
      <Block at={[5.05, 2, z]} size={[0.1, 1.9, 1.1]} color={GLASS} />
      <Block at={[5.05, 5.2, z]} size={[0.1, 1.9, 1.1]} color={GLASS} />
    </group>)}
    <Block at={[7.75, 4.15, 0]} size={[0.14, 0.14, 28]} color="#ede5cf" />
  </group>;
}

function Market() {
  return <group name="Main pier and Lime Kiln Cafe" rotation={[0, 0.36, 0]}>
    <Block at={[0, -1.4, 0]} size={[20, 3, 51]} color="#b3a183" />
    <Block at={[0, 2.4, 0]} size={[13, 4.8, 44]} color="#d6cbb2" />
    <Gable at={[0, 6.3, 0]} size={[15.5, 3, 46]} />
    {[-17, -10, -3, 4, 11, 18].map((z) => <Block key={z} at={[6.55, 2.4, z]} size={[0.1, 2.1, 2]} color={GLASS} />)}
  </group>;
}

function Village({ chart }: { chart: ChartData }) {
  const walls = useRef<InstancedMesh>(null), roofs = useRef<InstancedMesh>(null);
  const geometry = useMemo(cottageRoof, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const matrix = new Matrix4(), q = new Quaternion(), axis = new Vector3(0, 1, 0), color = new Color();
    ROCHE_COTTAGES.forEach(([lat, lon, w, l, heading], i) => {
      const [x, z] = geoToChart(chart, lat, lon);
      const ground = terrainHeightAt(chart, x, z), h = w > 10 ? 6.8 : 4.3;
      q.setFromAxisAngle(axis, -heading * Math.PI / 180);
      matrix.compose(new Vector3(x, ground + h / 2 - 0.6, z), q, new Vector3(w, h, l));
      walls.current!.setMatrixAt(i, matrix);
      walls.current!.setColorAt(i, color.set(["#d8d1b8", "#b9c4b6", "#d4ccbc", "#c0bda8"][i % 4]));
      matrix.compose(new Vector3(x, ground + h + 1.3 - 0.6, z), q, new Vector3(w + 1, 2.6, l + 1));
      roofs.current!.setMatrixAt(i, matrix);
    });
    walls.current!.instanceMatrix.needsUpdate = true;
    roofs.current!.instanceMatrix.needsUpdate = true;
    if (walls.current!.instanceColor) walls.current!.instanceColor.needsUpdate = true;
    walls.current!.computeBoundingSphere(); roofs.current!.computeBoundingSphere();
  }, [chart]);
  return <group name="Roche village">
    <instancedMesh ref={walls} args={[undefined, undefined, ROCHE_COTTAGES.length]} castShadow receiveShadow><boxGeometry /><meshStandardMaterial roughness={0.9} /></instancedMesh>
    <instancedMesh ref={roofs} args={[geometry, undefined, ROCHE_COTTAGES.length]} castShadow><meshStandardMaterial color="#58615a" roughness={0.95} /></instancedMesh>
  </group>;
}

export const RocheHarborScenery = memo(function RocheHarborScenery({ chart }: { chart: ChartData }) {
  const landmarks = useMemo(() => Object.fromEntries(Object.entries(ROCHE_LANDMARKS).map(([key, p]) => {
    const [x, z] = geoToChart(chart, p.lat, p.lon);
    return [key, [x, terrainHeightAt(chart, x, z), z] as [number, number, number]];
  })), [chart]);
  return <group name="Roche Harbor waterfront">
    <Village chart={chart} />
    <group position={landmarks.hillHouse}><HillHouse /></group>
    <group position={landmarks.chapel}><Chapel /></group>
    <group position={landmarks.hotel}><Hotel /></group>
    <group position={landmarks.market}><Market /></group>
  </group>;
});
