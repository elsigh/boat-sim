"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, ExtrudeGeometry, Shape, type Texture } from "three";
import { RoundedBox } from "@react-three/drei";
import type { BoatProfile } from "@/lib/boats/catalog";

type V3 = [number, number, number];
const DECK = 0.53;
const WHITE = "#f0f1ec", GLASS = "#42606e", CHROME = "#bfcbd0", TEAK = "#a68660", CUSHION = "#e2d8c7";

function Part({ at, size, color = WHITE, metal = false, rotation }: { at: V3; size: V3; color?: string; metal?: boolean; rotation?: V3 }) {
  return <RoundedBox position={at} args={size} radius={Math.min(0.045, ...size.map((n) => n * 0.2))} smoothness={2} bevelSegments={2} rotation={rotation} castShadow receiveShadow>
    <meshStandardMaterial color={color} roughness={metal ? 0.24 : color === GLASS ? 0.18 : 0.5} metalness={metal ? 0.8 : color === GLASS ? 0.12 : 0.04} />
  </RoundedBox>;
}

/** Tapered deckhouse with a raked front, glazed sides and visible mullions. */
function Cabin({ at, width, length, height, front = 0.83, windows = 5, color = WHITE }: {
  at: V3; width: number; length: number; height: number; front?: number; windows?: number; color?: string;
}) {
  const geometry = useMemo(() => {
    const g = new BoxGeometry(width, height, length), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i), top = p.getY(i) > 0;
      p.setX(i, p.getX(i) * (z > 0 ? front : 1));
      if (z > 0 && top) p.setZ(i, z - height * 0.18);
    }
    g.computeVertexNormals();
    return g;
  }, [width, length, height, front]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const roof = useMemo(() => {
    const g = new BoxGeometry(width + 0.18, 0.09, length + 0.18), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getZ(i) > 0) {
        p.setX(i, p.getX(i) * front);
        p.setZ(i, p.getZ(i) - height * 0.18);
      }
    }
    g.computeVertexNormals();
    return g;
  }, [width, length, height, front]);
  useEffect(() => () => roof.dispose(), [roof]);
  const slope = Math.atan(width * (1 - front) / (2 * length));
  return <group position={at}>
    <mesh geometry={geometry} position={[0, height / 2, 0]} castShadow receiveShadow><meshStandardMaterial color={color} roughness={0.42} /></mesh>
    {[-1, 1].flatMap((side) => Array.from({ length: windows }, (_, i) => {
      const t = (i + 0.5) / windows, z = (t - 0.5) * length * 0.86;
      const halfWidth = width / 2 * (1 - (z / length + 0.5) * (1 - front));
      return <Part key={`${side}-${i}`} at={[side * (halfWidth + 0.015), height * 0.65, z]} size={[0.045, height * 0.43, length * 0.76 / windows]} color={GLASS} rotation={[0, -side * slope, 0]} />;
    }))}
    {[-1, 0, 1].map((i) => <Part key={i} at={[i * width * front * 0.285, height * 0.65, length / 2 - height * 0.117 + 0.035]} size={[width * front * 0.26, height * 0.43, 0.045]} color={GLASS} rotation={[-0.178, 0, 0]} />)}
    <mesh position={[0, height + 0.045, 0]} geometry={roof} castShadow receiveShadow><meshStandardMaterial color={color} roughness={0.45} /></mesh>
    <Part at={[0, height * 0.44, -length / 2 - 0.03]} size={[width * 0.38, height * 0.8, 0.05]} color={GLASS} />
  </group>;
}

function Deck({ at, width, length, texture }: { at: V3; width: number; length: number; texture: Texture }) {
  const geometry = useMemo(() => {
    const deck = new BoxGeometry(width, 0.08, length);
    const uv = deck.attributes.uv;
    // The shared teak texture is calibrated in metres, not a unit-box UV.
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width, uv.getY(i) * length);
    return deck;
  }, [width, length]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh position={at} geometry={geometry} receiveShadow><meshStandardMaterial map={texture} roughness={0.68} /></mesh>;
}

/** Rounded, narrowing deck edges give the modern yacht its molded silhouette. */
function MoldedDeck({ at, width, length, thickness = 0.16, texture }: { at: V3; width: number; length: number; thickness?: number; texture?: Texture }) {
  const geometry = useMemo(() => {
    const w = width / 2, l = length / 2;
    const outline = new Shape();
    outline.moveTo(-w * 0.86, l);
    outline.lineTo(w * 0.86, l);
    outline.quadraticCurveTo(w, l, w, l * 0.7);
    outline.bezierCurveTo(w, -l * 0.15, w * 0.88, -l * 0.85, w * 0.68, -l);
    outline.lineTo(-w * 0.68, -l);
    outline.bezierCurveTo(-w * 0.88, -l * 0.85, -w, -l * 0.15, -w, l * 0.7);
    outline.quadraticCurveTo(-w, l, -w * 0.86, l);
    const deck = new ExtrudeGeometry(outline, { depth: thickness, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.035, bevelThickness: 0.02, steps: 1, curveSegments: 12 });
    deck.rotateX(-Math.PI / 2);
    deck.translate(0, -thickness / 2, 0);
    return deck;
  }, [width, length, thickness]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh position={at} geometry={geometry} castShadow receiveShadow><meshStandardMaterial color={texture ? "#ffffff" : WHITE} map={texture} roughness={texture ? 0.68 : 0.4} /></mesh>;
}
function Seat({ at, width = 1.1, color = CUSHION, rotation = 0 }: { at: V3; width?: number; color?: string; rotation?: number }) {
  return <group position={at} rotation={[0, rotation, 0]}>
    <Part at={[0, 0.18, 0]} size={[width, 0.36, 0.66]} color={WHITE} />
    <Part at={[0, 0.40, 0]} size={[width, 0.12, 0.69]} color={color} />
    <Part at={[0, 0.64, -0.29]} size={[width, 0.48, 0.13]} color={color} />
    {[-0.25, 0.25].map((x) => <Part key={x} at={[x * width, 0.47, 0]} size={[0.015, 0.008, 0.6]} color="#b5ad9f" />)}
  </group>;
}
function Sunpad({ at, width, length, color = CUSHION }: { at: V3; width: number; length: number; color?: string }) {
  return <group position={at}>
    <Part at={[0, 0, 0]} size={[width, 0.22, length]} color={color} />
    {[-0.25, 0.25].map((x) => <Part key={x} at={[width * x, 0.114, 0]} size={[0.018, 0.012, length * 0.95]} color="#b8ae9d" />)}
  </group>;
}
function Rail({ at, length, rotate = 0, height = 0.78 }: { at: V3; length: number; rotate?: number; height?: number }) {
  return <group position={at} rotation={[0, rotate, 0]}>
    {[0.5, 1].map((fraction) => <Part key={fraction} at={[0, height * fraction, 0]} size={[0.024, 0.024, length]} color={CHROME} metal />)}
    {Array.from({ length: Math.ceil(length / 1.4) + 1 }, (_, i) => {
      const count = Math.ceil(length / 1.4);
      return <Part key={i} at={[0, height / 2, -length / 2 + length * i / count]} size={[0.028, height, 0.028]} color={CHROME} metal />;
    })}
  </group>;
}
function Radar({ at, width = 2.2, large = false }: { at: V3; width?: number; large?: boolean }) {
  return <group position={at}>
    {[-1, 1].map((side) => <Part key={side} at={[side * width / 2, 0.6, 0]} size={[0.14, 1.25, 0.35]} rotation={[0, 0, side * 0.24]} />)}
    <Part at={[0, 1.15, 0]} size={[width, 0.18, 0.4]} />
    <Part at={[0, 1.4, 0]} size={[width * 0.75, 0.13, 0.2]} />
    {(large ? [-1, 1] : [0]).map((side) => <mesh key={side} position={[side * width * 0.32, 1.65, 0.3]} scale={[1, 1.1, 1]} castShadow><sphereGeometry args={[large ? 0.43 : 0.25, 16, 12]} /><meshStandardMaterial color={WHITE} roughness={0.35} /></mesh>)}
    {[-1, 1].map((side) => <Part key={side} at={[side * width * 0.52, 2.0, 0]} size={[0.018, 1.45, 0.018]} color={CHROME} />)}
  </group>;
}
function Tender({ at, scale = 1 }: { at: V3; scale?: number }) {
  return <group position={at} scale={scale}>
    {[-1, 1].map((side) => <mesh key={side} position={[side * 0.51, 0.26, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><capsuleGeometry args={[0.2, 2.05, 4, 10]} /><meshStandardMaterial color="#b5bdbb" roughness={0.65} /></mesh>)}
    <Part at={[0, 0.14, 0]} size={[0.9, 0.2, 2.45]} color="#929e9a" />
    <Part at={[0, 0.33, 0.95]} size={[1.0, 0.34, 0.3]} color="#b5bdbb" />
    <Part at={[0, 0.4, -1.23]} size={[0.3, 0.5, 0.4]} color="#253034" />
  </group>;
}
function Helm({ at, width = 0.9 }: { at: V3; width?: number }) {
  return <group position={at}>
    <Part at={[0, 0.48, 0]} size={[width, 0.95, 0.42]} />
    <Part at={[0, 0.88, -0.16]} size={[width * 0.85, 0.22, 0.05]} color={GLASS} rotation={[0.35, 0, 0]} />
    <mesh position={[-width * 0.2, 0.72, -0.30]} rotation={[0.45, 0, 0]}><torusGeometry args={[0.16, 0.018, 6, 20]} /><meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.2} /></mesh>
  </group>;
}
function Foredeck({ boat }: { boat: BoatProfile }) {
  return <group>
    <Part at={[0, DECK + 0.16, boat.lengthM * 0.39]} size={[0.44, 0.32, 0.65]} color={CHROME} metal />
    <Part at={[0, DECK + 0.1, boat.lengthM * 0.315]} size={[boat.beamM * 0.19, 0.08, boat.lengthM * 0.032]} color={GLASS} />
  </group>;
}

function Nordhavn({ boat, texture, large }: { boat: BoatProfile; texture: Texture; large: boolean }) {
  const L = boat.lengthM, B = boat.beamM, mainH = large ? 2.45 : 1.75;
  const upper = DECK + mainH + 0.13;
  return <group name={large ? "Nordhavn 86 expedition decks" : "Nordhavn 55 raised pilothouse"}>
    <Cabin at={[0, DECK, -L * 0.12]} width={B * 0.76} length={L * 0.4} height={mainH} front={0.9} />
    <Part at={[0, upper, -L * 0.19]} size={[B * 0.84, 0.17, L * 0.53]} />
    <Deck at={[0, upper + 0.13, -L * 0.28]} width={B * 0.7} length={L * 0.2} texture={texture} />
    <Cabin at={[0, large ? upper + 0.1 : DECK + 0.85, L * 0.105]} width={B * 0.70} length={L * (large ? 0.22 : 0.18)} height={large ? 1.95 : 1.85} front={0.79} windows={3} />
    <Part at={[0, DECK + 0.27, L * 0.245]} size={[B * 0.47, 0.52, L * 0.11]} />
    <Radar at={[0, upper + (large ? 2.15 : 0.6), L * 0.07]} width={B * 0.46} large={large} />
    <Tender at={[B * 0.10, upper + 0.19, -L * 0.3]} scale={large ? 1.6 : 1.25} />
    <Part at={[-B * 0.30, upper + 0.43, -L * 0.29]} size={[0.16, 0.85, 0.16]} color={CHROME} metal />
    <Part at={[-B * 0.18, upper + 0.85, -L * 0.29]} size={[B * 0.31, 0.12, 0.15]} color={CHROME} metal rotation={[0, 0, -0.18]} />
    {[-1, 1].map((side) => <group key={side}>
      <Part at={[side * B * 0.37, DECK + mainH / 2, -L * 0.425]} size={[0.12, mainH, 0.12]} />
      <Rail at={[side * B * 0.39, upper + 0.1, -L * 0.29]} length={L * 0.26} />
      {[0.17, 0.26, 0.33].map((z) => <Part key={z} at={[side * B * (0.34 - (z - 0.17) * 0.6), DECK - 0.20, L * z]} size={[0.045, 0.25, L * 0.023]} color={GLASS} />)}
    </group>)}
    <Seat at={[0, DECK + 0.04, -L * 0.43]} width={B * 0.48} />
    {large ? <>
      <Deck at={[0, upper + 2.13, L * 0.055]} width={B * 0.6} length={L * 0.16} texture={texture} />
      <Helm at={[0, upper + 2.17, L * 0.1]} /><Seat at={[0, upper + 2.17, L * 0.035]} width={1.5} />
      {[-1, 1].map((side) => <Rail key={side} at={[side * B * 0.3, upper + 2.17, L * 0.055]} length={L * 0.16} />)}
      <Rail at={[0, upper + 2.17, -L * 0.025]} length={B * 0.6} rotate={Math.PI / 2} />
    </> : <>
      <Helm at={[0, DECK + 2.83, L * 0.12]} />
      <Seat at={[0, DECK + 2.83, L * 0.055]} width={1.05} />
      {[-1, 1].map((side) => <Rail key={side} at={[side * B * 0.29, DECK + 2.80, L * 0.085]} length={L * 0.13} height={0.65} />)}
    </>}
    <Foredeck boat={boat} />
  </group>;
}

function SportBoat({ boat, texture, bowrider }: { boat: BoatProfile; texture: Texture; bowrider: boolean }) {
  const L = boat.lengthM, B = boat.beamM, trim = bowrider ? "#aaa498" : "#724834";
  return <group name={bowrider ? "E26 open bowrider and outboard" : "Corsair open cockpit and foredeck"}>
    <Deck at={[0, DECK + 0.02, -L * 0.18]} width={B * 0.64} length={L * 0.48} texture={texture} />
    {[-1, 1].map((side) => <group key={side}>
      <Part at={[side * B * 0.36, DECK + 0.2, -L * 0.10]} size={[B * 0.12, 0.40, L * 0.64]} color={boat.visual.houseColor} />
      <Part at={[side * B * 0.36, DECK + 0.43, -L * 0.1]} size={[B * 0.12, 0.05, L * 0.64]} color={trim} />
      <Part at={[side * B * 0.2, DECK + 0.78, L * 0.03]} size={[B * 0.30, 0.58, 0.04]} rotation={[-0.45, 0, side * 0.08]} color={GLASS} />
      <Part at={[side * B * 0.2, DECK + 1.08, L * 0.005]} size={[B * 0.31, 0.025, 0.028]} color={CHROME} metal />
      <Part at={[side * B * 0.34, DECK + 0.76, -L * 0.025]} size={[0.035, 0.51, L * 0.13]} rotation={[0, side * 0.3, 0]} color={GLASS} />
      <Seat at={[side * B * 0.2, DECK, -L * 0.11]} width={B * 0.25} color={CUSHION} />
      <Rail at={[side * B * 0.22, DECK + 0.15, L * 0.26]} length={L * 0.18} height={0.19} rotate={-side * 0.3} />
    </group>)}
    <Helm at={[-B * 0.19, DECK - 0.12, -L * 0.015]} width={B * 0.28} />
    <Seat at={[0, DECK, -L * 0.32]} width={B * 0.6} />
    <Sunpad at={[0, DECK + 0.48, -L * 0.4]} width={B * 0.58} length={L * 0.12} />
    {bowrider ? <>
      {[-1, 1].map((side) => <Sunpad key={side} at={[side * B * 0.20, DECK + 0.20, L * 0.23]} width={B * 0.24} length={L * 0.23} />)}
      <group position={[0, DECK, -L * 0.52]}>
        <Part at={[0, 0.15, 0]} size={[0.66, 1.0, 0.72]} color="#28343d" />
        <Part at={[0, 0.35, -0.365]} size={[0.48, 0.12, 0.015]} color="#d0d6d6" />
        <Part at={[0, -0.70, 0.05]} size={[0.18, 0.8, 0.30]} color="#253039" />
        <Part at={[0, -0.88, 0.07]} size={[0.46, 0.07, 0.40]} color="#253039" />
      </group>
    </> : <>
      <Cabin at={[0, DECK - 0.02, L * 0.22]} width={B * 0.58} length={L * 0.28} height={0.25} front={0.5} windows={3} color="#ede9df" />
      <Part at={[0, DECK + 0.37, L * 0.23]} size={[B * 0.14, 0.06, L * 0.07]} color={GLASS} />
      <Part at={[0, DECK + 0.35, L * 0.18]} size={[0.06, 0.025, L * 0.31]} color={trim} />
      {[-1, 1].map((side) => <Part key={side} at={[side * B * 0.2, DECK - 0.62, -L * 0.49]} size={[0.3, 0.6, 0.48]} color="#303c40" />)}
    </>}
  </group>;
}

function MotorYacht({ boat, texture, classic }: { boat: BoatProfile; texture: Texture; classic: boolean }) {
  const L = boat.lengthM, B = boat.beamM, h = classic ? 2.35 : 2.05, upper = DECK + h + 0.13;
  return <group name={classic ? "Crescent raised pilothouse and flybridge" : "Settantotto sculpted flybridge"}>
    <Cabin at={[0, DECK, -L * 0.1]} width={B * 0.80} length={L * 0.48} height={h} front={classic ? 0.87 : 0.73} windows={classic ? 7 : 4} />
    {classic ? <>
      <Part at={[0, upper, -L * 0.18]} size={[B * 0.86, 0.17, L * 0.62]} />
      <Deck at={[0, upper + 0.13, -L * 0.17]} width={B * 0.76} length={L * 0.51} texture={texture} />
    </> : <>
      <MoldedDeck at={[0, upper, -L * 0.15]} width={B * 0.88} length={L * 0.59} />
      <MoldedDeck at={[0, upper + 0.13, -L * 0.15]} width={B * 0.78} length={L * 0.54} thickness={0.06} texture={texture} />
      {[-1, 1].map((side) => <group key={side}>
        <Part at={[side * B * 0.35, upper + 0.36, -L * 0.12]} size={[0.15, 0.5, L * 0.31]} />
        <Part at={[side * B * 0.32, upper + 0.72, -L * 0.055]} size={[0.055, 0.24, L * 0.16]} color={GLASS} />
        <Part at={[side * B * 0.155, upper + 0.69, L * 0.045]} size={[B * 0.30, 0.51, 0.05]} color={GLASS} rotation={[-0.4, side * 0.16, 0]} />
        <Part at={[side * B * 0.31, upper + 1.0, -L * 0.11]} size={[0.11, 1.95, 0.17]} rotation={[-0.25, 0, 0]} />
      </group>)}
    </>}
    {classic ? <Cabin at={[0, upper - 0.35, L * 0.09]} width={B * 0.62} length={L * 0.16} height={1.8} front={0.76} windows={3} /> : <Part at={[0, DECK + 0.36, L * 0.20]} size={[B * 0.58, 0.70, L * 0.13]} />}
    {classic && <>
      <Deck at={[0, upper + 1.54, L * 0.055]} width={B * 0.56} length={L * 0.20} texture={texture} />
      {[-1, 1].map((side) => <Rail key={side} at={[side * B * 0.28, upper + 1.58, L * 0.055]} length={L * 0.20} />)}
      <Rail at={[0, upper + 1.58, L * 0.155]} length={B * 0.56} rotate={Math.PI / 2} />
      <Part at={[0, upper + 2.02, L * 0.065]} size={[B * 0.48, 0.57, 0.045]} color={GLASS} rotation={[-0.32, 0, 0]} />
    </>}
    {[-1, 1].map((side) => <group key={side}>
      <Rail at={[side * B * 0.40, upper + 0.12, -L * 0.20]} length={L * 0.39} />
      <Part at={[side * B * 0.34, upper + 1.0, -L * 0.22]} size={[0.15, 1.95, 0.3]} rotation={[0.17, 0, 0]} />
      {[-0.31, -0.20, -0.08, 0.06, 0.20].map((z) => <Part key={z} at={[side * B * (0.45 - Math.max(0, z) * 0.7), DECK - 0.38, L * z]} size={[0.06, classic ? 0.28 : 0.43, L * (classic ? 0.025 : 0.052)]} color={GLASS} />)}
      {Array.from({ length: 5 }, (_, i) => <Part key={i} at={[side * B * 0.35, DECK + 0.15 + i * h / 5, -L * 0.42 + i * 0.28]} size={[B * 0.12, 0.14, 0.34]} color={TEAK} />)}
    </group>)}
    {classic ? <Part at={[0, upper + 2.0, -L * 0.20]} size={[B * 0.76, 0.15, L * 0.26]} /> : <MoldedDeck at={[0, upper + 2.0, -L * 0.20]} width={B * 0.80} length={L * 0.29} thickness={0.13} />}
    <Radar at={[0, upper + 2.08, -L * 0.23]} width={B * 0.37} large={classic} />
    <Helm at={[-B * 0.16, upper + (classic ? 1.58 : 0.16), L * 0.045]} width={1.3} />
    <Seat at={[-B * 0.16, upper + (classic ? 1.58 : 0.16), L * 0.005]} width={1.1} />
    <Seat at={[B * 0.22, upper + 0.16, -L * 0.16]} width={L * 0.12} rotation={-Math.PI / 2} />
    <Part at={[0, upper + 0.72, -L * 0.19]} size={[B * 0.26, 0.08, L * 0.085]} color={TEAK} />
    <Part at={[0, upper + 0.40, -L * 0.19]} size={[0.16, 0.65, 0.16]} color={CHROME} metal />
    <Seat at={[0, DECK + 0.04, -L * 0.43]} width={B * 0.61} />
    <Sunpad at={[0, classic ? upper + 0.25 : DECK + 0.85, L * (classic ? -0.36 : 0.22)]} width={B * 0.45} length={L * 0.095} />
    <Foredeck boat={boat} />
  </group>;
}

export function FleetTopsides({ boat, texture }: { boat: BoatProfile; texture: Texture }) {
  switch (boat.visual.topsides) {
    case "nordhavn-55": return <Nordhavn boat={boat} texture={texture} large={false} />;
    case "nordhavn-86": return <Nordhavn boat={boat} texture={texture} large />;
    case "bowrider": return <SportBoat boat={boat} texture={texture} bowrider />;
    case "corsair": return <SportBoat boat={boat} texture={texture} bowrider={false} />;
    case "settantotto": return <MotorYacht boat={boat} texture={texture} classic={false} />;
    case "crescent": return <MotorYacht boat={boat} texture={texture} classic />;
    default: return null;
  }
}
