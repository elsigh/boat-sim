"""Find a navigable track between two chart points.

A* over the charted depth grid, refusing anything shallower than the requested
under-keel limit and paying a penalty for hugging the shoal line. Used to lay
out approach tracks that are actually water the whole way.

Usage:
  python3 scripts/charts/route.py <scene-id> x0,z0 x1,z1 [minDepthM] [--all]
"""

from __future__ import annotations

import base64
import heapq
import math
import sys

import numpy as np

from probe import load_chart


def depth_array(chart):
    grid = chart["depth"]
    return (
        np.frombuffer(base64.b64decode(grid["data"]), dtype="<i2").reshape(
            grid["rows"], grid["cols"]
        )
        / 10.0
    )


def to_cell(chart, x, z):
    grid = chart["depth"]
    col = int(round((x + chart["halfWidthM"]) / grid["cellXM"] - 0.5))
    row = int(round((chart["halfHeightM"] - z) / grid["cellZM"] - 0.5))
    return (
        min(grid["rows"] - 1, max(0, row)),
        min(grid["cols"] - 1, max(0, col)),
    )


def to_world(chart, row, col):
    grid = chart["depth"]
    return (
        (col + 0.5) * grid["cellXM"] - chart["halfWidthM"],
        chart["halfHeightM"] - (row + 0.5) * grid["cellZM"],
    )


def clearance_map(depths, min_depth):
    """How many cells away the nearest too-shallow cell is, capped at 6."""
    blocked = depths < min_depth
    distance = np.full(depths.shape, 6.0)
    distance[blocked] = 0.0

    for _ in range(6):
        shifted = np.full(depths.shape, 6.0)
        shifted[1:, :] = np.minimum(shifted[1:, :], distance[:-1, :] + 1)
        shifted[:-1, :] = np.minimum(shifted[:-1, :], distance[1:, :] + 1)
        shifted[:, 1:] = np.minimum(shifted[:, 1:], distance[:, :-1] + 1)
        shifted[:, :-1] = np.minimum(shifted[:, :-1], distance[:, 1:] + 1)
        distance = np.minimum(distance, shifted)

    return distance


def find_route(chart, start, goal, min_depth=6.0):
    depths = depth_array(chart)
    clearance = clearance_map(depths, min_depth)
    passable = depths >= min_depth

    start_cell = to_cell(chart, *start)
    goal_cell = to_cell(chart, *goal)

    # Endpoints often sit in a berth shallower than the transit limit; let them
    # through and let the penalty term keep the middle of the route honest.
    forced = {start_cell, goal_cell}

    rows, cols = depths.shape
    cell_x = chart["depth"]["cellXM"]
    cell_z = chart["depth"]["cellZM"]

    def heuristic(cell):
        dx = (cell[1] - goal_cell[1]) * cell_x
        dz = (cell[0] - goal_cell[0]) * cell_z
        return math.hypot(dx, dz)

    open_set = [(heuristic(start_cell), 0.0, start_cell)]
    came_from = {}
    best = {start_cell: 0.0}

    neighbours = [
        (-1, 0), (1, 0), (0, -1), (0, 1),
        (-1, -1), (-1, 1), (1, -1), (1, 1),
    ]

    while open_set:
        _, cost, cell = heapq.heappop(open_set)

        if cell == goal_cell:
            break

        if cost > best.get(cell, math.inf):
            continue

        for dr, dc in neighbours:
            nr, nc = cell[0] + dr, cell[1] + dc

            if not (0 <= nr < rows and 0 <= nc < cols):
                continue

            neighbour = (nr, nc)

            if not passable[nr, nc] and neighbour not in forced:
                continue

            step = math.hypot(dc * cell_x, dr * cell_z)
            # Prefer a comfortable offing over cutting the corner.
            penalty = (6.0 - clearance[nr, nc]) * 0.9 * max(cell_x, cell_z) * 0.25
            next_cost = cost + step + penalty

            if next_cost < best.get(neighbour, math.inf):
                best[neighbour] = next_cost
                came_from[neighbour] = cell
                heapq.heappush(open_set, (next_cost + heuristic(neighbour), next_cost, neighbour))
    else:
        return None

    path = [goal_cell]
    while path[-1] != start_cell:
        previous = came_from.get(path[-1])
        if previous is None:
            return None
        path.append(previous)
    path.reverse()

    points = [to_world(chart, r, c) for r, c in path]
    points[0] = start
    points[-1] = goal
    return simplify(points, tolerance=max(cell_x, cell_z) * 0.9)


def simplify(points, tolerance):
    if len(points) < 3:
        return points

    start, end = points[0], points[-1]
    worst_index, worst = 0, 0.0

    for index in range(1, len(points) - 1):
        distance = point_line_distance(points[index], start, end)
        if distance > worst:
            worst_index, worst = index, distance

    if worst <= tolerance:
        return [start, end]

    return simplify(points[: worst_index + 1], tolerance)[:-1] + simplify(
        points[worst_index:], tolerance
    )


def point_line_distance(point, start, end):
    if start == end:
        return math.dist(point, start)
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy)
    return abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / length


def main():
    chart = load_chart(sys.argv[1])
    start = tuple(float(v) for v in sys.argv[2].split(","))
    goal = tuple(float(v) for v in sys.argv[3].split(","))
    min_depth = float(sys.argv[4]) if len(sys.argv) > 4 and not sys.argv[4].startswith("--") else 6.0

    route = find_route(chart, start, goal, min_depth)

    if route is None:
        print("  no route found at that depth limit")
        return

    total = sum(math.dist(route[i], route[i + 1]) for i in range(len(route) - 1))
    print(f"  {len(route)} waypoints, {total:.0f} m ({total / 1852:.2f} nm)")
    print("  [")
    for x, z in route:
        print(f"    [{x:.0f}, {z:.0f}],")
    print("  ]")


if __name__ == "__main__":
    main()
