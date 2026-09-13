import { BufferGeometry, Float32BufferAttribute, Matrix3, Matrix4, Vector3 } from "three";

type Vertex = { p: Vector3; n: Vector3; u: number; v: number };
export type FragmentBuffers = { positions: number[]; normals: number[]; uvs: number[] };
export const emptyFragment = (): FragmentBuffers => ({ positions: [], normals: [], uvs: [] });

function clip(polygon: Vertex[], axis: "x" | "z", edge: number, above: boolean): Vertex[] {
  const output: Vertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = (a.p[axis] - edge) * (above ? 1 : -1), db = (b.p[axis] - edge) * (above ? 1 : -1);
    if (da >= 0) output.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      output.push({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(), u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });
    }
  }
  return output;
}

/** Cut real model triangles at each fracture plane. Centroid-only assignment
 * leaves large deck polygons bridging the opening when the hull separates. */
export function appendClippedGeometry(geometry: BufferGeometry, transform: Matrix4, start: number, count: number,
  bounds: { left: number; right: number; aft: number; fore: number }, output: FragmentBuffers) {
  const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal"), uv = geometry.getAttribute("uv");
  if (!positions) return;
  const index = geometry.getIndex(), total = index?.count ?? positions.count;
  const normalMatrix = new Matrix3().getNormalMatrix(transform);
  const vertex = (i: number): Vertex => {
    const id = index ? index.getX(i) : i;
    return { p: new Vector3().fromBufferAttribute(positions, id).applyMatrix4(transform),
      n: normals ? new Vector3().fromBufferAttribute(normals, id).applyMatrix3(normalMatrix).normalize() : new Vector3(0, 1, 0),
      u: uv?.getX(id) ?? 0, v: uv?.getY(id) ?? 0 };
  };
  for (let i = start; i + 2 < Math.min(total, start + count); i += 3) {
    let polygon = [vertex(i), vertex(i + 1), vertex(i + 2)];
    if (polygon.every((p) => p.p.x < bounds.left) || polygon.every((p) => p.p.x > bounds.right)
      || polygon.every((p) => p.p.z < bounds.aft) || polygon.every((p) => p.p.z > bounds.fore)) continue;
    polygon = clip(clip(clip(clip(polygon, "x", bounds.left, true), "x", bounds.right, false), "z", bounds.aft, true), "z", bounds.fore, false);
    for (let j = 1; j < polygon.length - 1; j++) {
      for (const v of [polygon[0], polygon[j], polygon[j + 1]]) {
        output.positions.push(v.p.x, v.p.y, v.p.z); output.normals.push(v.n.x, v.n.y, v.n.z); output.uvs.push(v.u, v.v);
      }
    }
  }
}

export function fragmentGeometry(buffers: FragmentBuffers) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(buffers.uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
}
