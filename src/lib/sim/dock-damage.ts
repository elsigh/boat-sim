import type { DockFloat } from "../marinas/types";
import type { Fracture } from "./collision-damage";

export type DockSection = { x: number; z: number; width: number; length: number };
export type DockCell = DockSection & { key: string; fracture?: Fracture };

/** Stable timber bays: removing one never disables an entire pier. */
export function dockStructuralCells(dock: DockFloat): DockCell[] {
  const [width, length] = dock.size;
  if (dock.kind === "breakwater") return [{ key: `dock:${dock.id}`, x: 0, z: 0, width, length }];
  const columns = Math.ceil(width / 3), rows = Math.ceil(length / 3);
  const w = width / columns, l = length / rows;
  return Array.from({ length: columns * rows }, (_, i) => {
    const column = i % columns, row = Math.floor(i / columns);
    const key = `dock:${dock.id}/bay:${row}:${column}`;
    return { key, x: -width / 2 + (column + 0.5) * w, z: -length / 2 + (row + 0.5) * l, width: w, length: l,
      fracture: { key, objectName: `dock:${dock.id}`, width: w, length: l,
        workJ: 12_000 + w * l * (dock.kind === "pier" ? 24_000 : 14_000) } };
  });
}

/** Coalesce surviving bays for rendering; collider keys remain independent and
 * stable. The destruction set lasts the whole exercise, even after effects expire. */
export function dockDamageSections(dock: DockFloat, destroyed: ReadonlySet<string>): DockSection[] {
  const cells = dockStructuralCells(dock);
  if (!cells.some((cell) => destroyed.has(cell.key))) return [{ x: 0, z: 0, width: dock.size[0], length: dock.size[1] }];
  const rows: DockSection[] = [];
  for (const cell of cells) {
    if (destroyed.has(cell.key)) continue;
    const previous = rows.at(-1);
    if (previous && Math.abs(previous.z - cell.z) < 1e-6 && Math.abs(previous.x + previous.width / 2 - (cell.x - cell.width / 2)) < 1e-6) {
      previous.x += cell.width / 2; previous.width += cell.width;
    } else rows.push({ x: cell.x, z: cell.z, width: cell.width, length: cell.length });
  }
  const parts: DockSection[] = [];
  for (const row of rows) {
    const previous = parts.find((p) => Math.abs(p.x - row.x) < 1e-6 && Math.abs(p.width - row.width) < 1e-6 && Math.abs(p.z + p.length / 2 - (row.z - row.length / 2)) < 1e-6);
    if (previous) { previous.z += row.length / 2; previous.length += row.length; }
    else parts.push({ ...row });
  }
  return parts;
}
