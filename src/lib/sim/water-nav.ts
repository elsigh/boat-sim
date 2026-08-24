import { chartDepthMeters } from "@/lib/charts";
import { sceneBounds, sceneChart, sceneDocks } from "@/lib/marinas/scene";
import type { LandMass, MarinaLayout, Vec2 } from "@/lib/marinas/types";

// Water-only navigation for the guidance line: a coarse occupancy grid per
// marina (docks, land, pilings, moored boats — all inflated by hull
// clearance), A* across it, then line-of-sight smoothing so the path reads
// like a route a skipper would steer, not a grid staircase.

const MIN_CELL_M = 2.5;
const MAX_CELL_M = 9;
// A whole-island scene like Reid Harbor is 6 km across; keeping the grid under
// this many cells is what stops the guidance A* from stalling the frame.
const MAX_CELLS = 240_000;
// Guidance keeps the boat in water it could actually float in.
const MIN_NAV_DEPTH_M = 1.8;
// Guidance clearance off structures. Deliberately a touch under the widest
// half-beam so berth centers tucked between slip fingers stay reachable.
const STRUCTURE_CLEARANCE_M = 2.0;
const MOORED_CLEARANCE_M = 1.6;
const PILING_CLEARANCE_M = 1.8;
const GRID_MARGIN_M = 90;
const MAX_FREE_CELL_SEARCH = 10;

export type NavObstacleBoat = {
  position: Vec2;
  headingDeg: number;
  lengthM: number;
  beamM: number;
};

export type NavGrid = {
  originX: number;
  originZ: number;
  cols: number;
  rows: number;
  cellM: number;
  blocked: Uint8Array;
};

function blockRotatedRect(
  grid: NavGrid,
  center: Vec2,
  halfWidth: number,
  halfLength: number,
  rotationDeg: number,
  inflate: number,
) {
  const rotation = (rotationDeg * Math.PI) / 180;
  const sin = Math.sin(rotation);
  const cos = Math.cos(rotation);
  const reachW = halfWidth + inflate;
  const reachL = halfLength + inflate;
  const radius = Math.hypot(reachW, reachL);

  const minCol = Math.max(0, Math.floor((center[0] - radius - grid.originX) / grid.cellM));
  const maxCol = Math.min(
    grid.cols - 1,
    Math.ceil((center[0] + radius - grid.originX) / grid.cellM),
  );
  const minRow = Math.max(0, Math.floor((center[1] - radius - grid.originZ) / grid.cellM));
  const maxRow = Math.min(
    grid.rows - 1,
    Math.ceil((center[1] + radius - grid.originZ) / grid.cellM),
  );

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const x = grid.originX + (col + 0.5) * grid.cellM - center[0];
      const z = grid.originZ + (row + 0.5) * grid.cellM - center[1];
      // Local frame per the layout convention: length runs along [sin, cos].
      const along = x * sin + z * cos;
      const across = x * cos - z * sin;

      if (Math.abs(across) <= reachW && Math.abs(along) <= reachL) {
        grid.blocked[row * grid.cols + col] = 1;
      }
    }
  }
}

function blockCircle(grid: NavGrid, center: Vec2, radius: number) {
  const minCol = Math.max(0, Math.floor((center[0] - radius - grid.originX) / grid.cellM));
  const maxCol = Math.min(
    grid.cols - 1,
    Math.ceil((center[0] + radius - grid.originX) / grid.cellM),
  );
  const minRow = Math.max(0, Math.floor((center[1] - radius - grid.originZ) / grid.cellM));
  const maxRow = Math.min(
    grid.rows - 1,
    Math.ceil((center[1] + radius - grid.originZ) / grid.cellM),
  );

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const x = grid.originX + (col + 0.5) * grid.cellM - center[0];
      const z = grid.originZ + (row + 0.5) * grid.cellM - center[1];

      if (x * x + z * z <= radius * radius) {
        grid.blocked[row * grid.cols + col] = 1;
      }
    }
  }
}

function landExtent(land: LandMass) {
  return Math.hypot(land.size[0], land.size[1]) * 0.5;
}

export function buildNavGrid(
  layout: MarinaLayout,
  mooredBoats: NavObstacleBoat[],
): NavGrid {
  const bounds = sceneBounds(layout, GRID_MARGIN_M);
  const docks = sceneDocks(layout);
  const chart = sceneChart(layout);

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxZ - bounds.minZ;
  const cellM = Math.min(
    MAX_CELL_M,
    Math.max(MIN_CELL_M, Math.sqrt((width * height) / MAX_CELLS)),
  );

  const cols = Math.max(8, Math.ceil(width / cellM));
  const rows = Math.max(8, Math.ceil(height / cellM));
  const grid: NavGrid = {
    originX: bounds.minX,
    originZ: bounds.minZ,
    cols,
    rows,
    cellM,
    blocked: new Uint8Array(cols * rows),
  };

  // Shoal water is an obstacle, not a suggestion.
  if (chart) {
    for (let row = 0; row < rows; row += 1) {
      const z = bounds.minZ + (row + 0.5) * cellM;

      for (let col = 0; col < cols; col += 1) {
        const x = bounds.minX + (col + 0.5) * cellM;

        if (chartDepthMeters(chart, x, z) < MIN_NAV_DEPTH_M) {
          grid.blocked[row * cols + col] = 1;
        }
      }
    }
  }

  docks.forEach((dock) => {
    blockRotatedRect(
      grid,
      dock.position,
      dock.size[0] * 0.5,
      dock.size[1] * 0.5,
      dock.rotationDeg ?? 0,
      STRUCTURE_CLEARANCE_M,
    );
  });

  (layout.land ?? []).forEach((land) => {
    blockRotatedRect(
      grid,
      land.position,
      land.size[0] * 0.5,
      land.size[1] * 0.5,
      land.rotationDeg ?? 0,
      STRUCTURE_CLEARANCE_M + 1,
    );
  });

  layout.pilings.forEach((run) => {
    const count = Math.max(1, run.count);

    for (let index = 0; index < count; index += 1) {
      const t = count <= 1 ? 0 : index / (count - 1);
      const point: Vec2 = [
        run.from[0] + (run.to[0] - run.from[0]) * t,
        run.from[1] + (run.to[1] - run.from[1]) * t,
      ];
      blockCircle(grid, point, (run.radiusM ?? 0.2) + PILING_CLEARANCE_M);
    }
  });

  mooredBoats.forEach((boat) => {
    blockRotatedRect(
      grid,
      boat.position,
      boat.beamM * 0.5,
      boat.lengthM * 0.5,
      boat.headingDeg,
      MOORED_CLEARANCE_M,
    );
  });

  return grid;
}

function cellIndex(grid: NavGrid, col: number, row: number) {
  return row * grid.cols + col;
}

function isBlocked(grid: NavGrid, col: number, row: number) {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) {
    return true;
  }

  return grid.blocked[cellIndex(grid, col, row)] === 1;
}

function toCell(grid: NavGrid, point: Vec2): [number, number] {
  return [
    Math.min(grid.cols - 1, Math.max(0, Math.floor((point[0] - grid.originX) / grid.cellM))),
    Math.min(grid.rows - 1, Math.max(0, Math.floor((point[1] - grid.originZ) / grid.cellM))),
  ];
}

function toWorld(grid: NavGrid, col: number, row: number): Vec2 {
  return [
    grid.originX + (col + 0.5) * grid.cellM,
    grid.originZ + (row + 0.5) * grid.cellM,
  ];
}

/** Nearest unblocked cell via expanding ring search (goal may sit in a slip). */
function nearestFreeCell(
  grid: NavGrid,
  start: [number, number],
): [number, number] | null {
  if (!isBlocked(grid, start[0], start[1])) {
    return start;
  }

  for (let radius = 1; radius <= MAX_FREE_CELL_SEARCH; radius += 1) {
    for (let dCol = -radius; dCol <= radius; dCol += 1) {
      for (let dRow = -radius; dRow <= radius; dRow += 1) {
        if (Math.max(Math.abs(dCol), Math.abs(dRow)) !== radius) {
          continue;
        }

        const col = start[0] + dCol;
        const row = start[1] + dRow;

        if (!isBlocked(grid, col, row)) {
          return [col, row];
        }
      }
    }
  }

  return null;
}

/** Conservative grid line-of-sight: samples the segment at sub-cell steps. */
export function gridLineOfSight(grid: NavGrid, from: Vec2, to: Vec2) {
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(1, Math.ceil((distance / grid.cellM) * 2));

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = from[0] + (to[0] - from[0]) * t;
    const z = from[1] + (to[1] - from[1]) * t;
    const col = Math.floor((x - grid.originX) / grid.cellM);
    const row = Math.floor((z - grid.originZ) / grid.cellM);

    if (isBlocked(grid, col, row)) {
      return false;
    }
  }

  return true;
}

// Binary min-heap keyed on fScore, storing cell indices.
class MinHeap {
  private items: number[] = [];
  private scores: number[] = [];

  get size() {
    return this.items.length;
  }

  push(item: number, score: number) {
    this.items.push(item);
    this.scores.push(score);
    let index = this.items.length - 1;

    while (index > 0) {
      const parent = (index - 1) >> 1;

      if (this.scores[parent] <= this.scores[index]) {
        break;
      }

      this.swap(index, parent);
      index = parent;
    }
  }

  pop(): number | undefined {
    if (this.items.length === 0) {
      return undefined;
    }

    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastScore = this.scores.pop()!;

    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.scores[0] = lastScore;
      let index = 0;

      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;

        if (left < this.items.length && this.scores[left] < this.scores[smallest]) {
          smallest = left;
        }

        if (right < this.items.length && this.scores[right] < this.scores[smallest]) {
          smallest = right;
        }

        if (smallest === index) {
          break;
        }

        this.swap(index, smallest);
        index = smallest;
      }
    }

    return top;
  }

  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.scores[a], this.scores[b]] = [this.scores[b], this.scores[a]];
  }
}

const NEIGHBORS: Array<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * Shortest water path from `from` to `to`. Returns a smoothed polyline whose
 * first point is `from` and last point is `to`, or null when no route exists
 * (the caller should fall back to a straight line).
 */
// A* over a quarter-million cells allocates ~2 MB of typed arrays per call.
// Replanned as the boat drifts, that was the single biggest source of main
// thread stalls and GC churn in the whole app — enough to starve pointer
// events. The scratch buffers are allocated once and reused.
const scratch = {
  size: 0,
  gScore: new Float32Array(0),
  cameFrom: new Int32Array(0),
  closed: new Uint8Array(0),
};

function scratchFor(size: number) {
  if (scratch.size < size) {
    scratch.size = size;
    scratch.gScore = new Float32Array(size);
    scratch.cameFrom = new Int32Array(size);
    scratch.closed = new Uint8Array(size);
  }

  scratch.gScore.fill(Number.POSITIVE_INFINITY, 0, size);
  scratch.cameFrom.fill(-1, 0, size);
  scratch.closed.fill(0, 0, size);
  return scratch;
}

export function findWaterPath(grid: NavGrid, from: Vec2, to: Vec2): Vec2[] | null {
  const startCell = nearestFreeCell(grid, toCell(grid, from));
  const goalCell = nearestFreeCell(grid, toCell(grid, to));

  if (!startCell || !goalCell) {
    return null;
  }

  // Out in open water the answer is a straight line, which is both the common
  // case and the one where a whole-scene A* is most expensive. Check first.
  if (gridLineOfSight(grid, from, to)) {
    return [from, to];
  }

  const startIndex = cellIndex(grid, startCell[0], startCell[1]);
  const goalIndex = cellIndex(grid, goalCell[0], goalCell[1]);

  const { gScore, cameFrom, closed } = scratchFor(grid.cols * grid.rows);
  const heap = new MinHeap();

  const heuristic = (index: number) => {
    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);
    const dCol = Math.abs(col - goalCell[0]);
    const dRow = Math.abs(row - goalCell[1]);
    // Octile distance.
    return Math.max(dCol, dRow) + (Math.SQRT2 - 1) * Math.min(dCol, dRow);
  };

  gScore[startIndex] = 0;
  heap.push(startIndex, heuristic(startIndex));

  let found = false;

  while (heap.size > 0) {
    const current = heap.pop()!;

    if (current === goalIndex) {
      found = true;
      break;
    }

    if (closed[current]) {
      continue;
    }

    closed[current] = 1;

    const col = current % grid.cols;
    const row = Math.floor(current / grid.cols);

    for (const [dCol, dRow, cost] of NEIGHBORS) {
      const nCol = col + dCol;
      const nRow = row + dRow;

      if (isBlocked(grid, nCol, nRow)) {
        continue;
      }

      // No cutting corners diagonally past a blocked cell.
      if (
        dCol !== 0 &&
        dRow !== 0 &&
        (isBlocked(grid, col + dCol, row) || isBlocked(grid, col, row + dRow))
      ) {
        continue;
      }

      const neighbor = cellIndex(grid, nCol, nRow);

      if (closed[neighbor]) {
        continue;
      }

      const tentative = gScore[current] + cost;

      if (tentative < gScore[neighbor]) {
        gScore[neighbor] = tentative;
        cameFrom[neighbor] = current;
        heap.push(neighbor, tentative + heuristic(neighbor));
      }
    }
  }

  if (!found) {
    return null;
  }

  // Reconstruct cell path (world coords), then string-pull with LOS checks.
  const cells: Vec2[] = [];
  let cursor = goalIndex;

  while (cursor !== -1) {
    cells.push(toWorld(grid, cursor % grid.cols, Math.floor(cursor / grid.cols)));
    cursor = cameFrom[cursor];
  }

  cells.reverse();

  const waypoints: Vec2[] = [from];
  let anchor: Vec2 = from;
  let index = 0;

  while (index < cells.length) {
    // Furthest cell visible from the current anchor.
    let furthest = index;

    for (let probe = cells.length - 1; probe > index; probe -= 1) {
      if (gridLineOfSight(grid, anchor, cells[probe])) {
        furthest = probe;
        break;
      }
    }

    anchor = cells[furthest];
    waypoints.push(anchor);

    if (furthest === cells.length - 1) {
      break;
    }

    index = furthest + (furthest === index ? 1 : 0);
  }

  // Close onto the true target (it may sit inside the inflated zone — that
  // final straight segment is the intentional "enter the berth" move).
  const last = waypoints[waypoints.length - 1];

  if (Math.hypot(last[0] - to[0], last[1] - to[1]) > 0.5) {
    waypoints.push(to);
  }

  return waypoints;
}
