"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import type { ChartData } from "@/lib/charts";
import { chartDepthMeters, chartToGeo, geoToChart } from "@/lib/charts";
import { type ChartMode, type ChartPalette, chartPalette } from "@/lib/charts/palette";
import { REGION_CHART, regionToScene, regionTransform } from "@/lib/charts/region";
import type { HelmTheme } from "@/lib/boats/helm-theme";
import type { Berth, MarinaLayout, Vec2 } from "@/lib/marinas/types";
import { sceneDocks } from "@/lib/marinas/scene";

import type { ImportedTrack } from "@/lib/tracks/types";

import type { TrafficTarget } from "../MarinaTraffic";

import { HelmButton } from "./Controls";
import { PanelLabel } from "./Panel";

// A chart plotter that draws the real survey: NOAA depths shaded from a raster,
// the true shoreline, contour ladder, spot soundings and place names, with the
// boat's track and the berth laid over the top. Geometry is drawn in chart
// metres inside one transformed group; anything that has to stay a fixed size
// on screen (icons, text) is projected in JS and drawn unrotated.
//
// Important: this component works in the CHART frame (x east), not the render
// world (x west). Everything that arrives in world coordinates — the boat, its
// track, the berth, docks — goes through `fromWorld` first, so north-up really
// does put east on the right.

const METRES_PER_FOOT = 0.3048;

/**
 * An imported track is not chart data, so it deliberately sits outside the
 * S-52 palette — a warm orange that can't be mistaken for a depth area, a
 * route, or an AIS target in either colour mode.
 */
const IMPORTED_TRACK = "#ff8c2b";

/**
 * Half the short axis of the view, in metres. Continuous so the wheel can
 * zoom smoothly; the +/- buttons snap to the presets below, the way a
 * plotter's range steps do.
 */
export type PlotterRange = number;

export const PLOTTER_RANGES: PlotterRange[] = [80, 150, 300, 600, 1200, 2500, 5000];

/** Past this, the harbour chart is a speck and the region's names take over. */
const REGION_LABEL_RANGE_M = 2200;

const MIN_RANGE_M = 60;
/** One wheel notch is about a sixth of a range step. */
const WHEEL_ZOOM_RATE = 0.0016;

type ChartPlotterProps = {
  chart: ChartData;
  layout: MarinaLayout;
  theme: HelmTheme;
  boat: { x: number; z: number } | null;
  headingDeg: number;
  sogKnots: number;
  track: Array<{ x: number; z: number }>;
  berth: Berth | null;
  /** Other vessels under way, drawn as AIS targets. */
  traffic?: TrafficTarget[];
  /** Below this the water shades as shoal. Boat draft plus a margin. */
  safeDepthM: number;
  /** S-52 colour table. Day is the buff-and-white chart everyone knows. */
  mode: ChartMode;
  onModeChange: (mode: ChartMode) => void;
  /** A recorded track laid over the chart — where you actually went. */
  importedTrack?: ImportedTrack | null;
  showImportedTrack?: boolean;
  /**
   * Imperatively re-centre the view. Bump `nonce` to move; used by "fit track"
   * so the caller can drive the view without owning the pan state.
   */
  focus?: { x: number; z: number; nonce: number } | null;
  /** Extra chrome rendered over the chart, e.g. the import drawer. */
  children?: ReactNode;
  /** Extra controls for the header strip, left of the colour-mode button. */
  headerExtra?: ReactNode;
  anchor?: { x: number; z: number } | null;
  chainMeters?: number;
  northUp: boolean;
  onToggleNorthUp: () => void;
  rangeM: PlotterRange;
  onRangeChange: (range: PlotterRange) => void;
  /** Square viewport size in SVG units; the aspect follows the container. */
  height: string;
  onExpand?: () => void;
  onCollapse?: () => void;
};

/**
 * The viewBox is sized to the container in CSS pixels rather than a fixed
 * square, so `rangeM` means the same thing on both axes and the projection
 * helper agrees with the SVG transform exactly.
 */
function usePlotterBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 640, h: 320 });

  useEffect(() => {
    const element = ref.current;

    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;

      if (rect && rect.width > 1 && rect.height > 1) {
        setBox({ w: Math.round(rect.width), h: Math.round(rect.height) });
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, box };
}

/**
 * Keep the viewport inside the charted world.
 *
 * A real plotter has chart everywhere and just centres on the boat; ours runs
 * out of data at the edge, and a half-empty screen reads as a bug rather than
 * as the edge of the survey. The interval is a genuine [min, max] rather than
 * a half-extent, because the regional basemap is not centred on the harbour —
 * Squalicum sits 26 km east of the middle of the San Juans, and treating that
 * as symmetric would claim 26 km of open water that isn't there.
 */
function clampAxis(centre: number, halfVisible: number, min: number, max: number) {
  if (max - min <= halfVisible * 2) {
    return (min + max) / 2;
  }

  return Math.min(max - halfVisible, Math.max(min + halfVisible, centre));
}

/** Render world (+x west) -> chart frame (+x east). */
function fromWorld(x: number, z: number): [number, number] {
  return [-x, z];
}

/**
 * The shaded depth areas, painted once into an offscreen canvas and handed to
 * the SVG as an <image>.
 *
 * Built in an effect rather than during render, and this matters: the canvas
 * API doesn't exist on the server, so computing it inline made the server
 * render nothing and the first client render an <image>. React calls that a
 * hydration mismatch, and in dev that throws and takes the whole app down with
 * it — a blank page, while the production build silently recovered. Returning
 * null until after mount means both sides agree.
 */
function useWaterRaster(chart: ChartData, palette: ChartPalette, safeDepthM: number) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const { cols, rows } = chart.depth;
    const canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    const context = canvas.getContext("2d");

    if (!context) {
      setHref(null);
      return;
    }

    const image = context.createImageData(cols, rows);
    const bands = palette.depthBands.map(hexToRgb);
    const lastBand = bands.length - 1;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = -chart.halfWidthM + (col + 0.5) * chart.depth.cellXM;
        const z = chart.halfHeightM - (row + 0.5) * chart.depth.cellZM;
        const depth = chartDepthMeters(chart, x, z);
        const index = (row * cols + col) * 4;

        if (depth <= 0) {
          image.data[index + 3] = 0;
          continue;
        }

        // Discrete bands, not a ramp, with the thresholds scaled off this
        // boat's safe depth — that's what "shallow water shading" means on a
        // plotter, and it's why a Grand Banks and a bowrider see different
        // charts of the same harbour.
        const band =
          depth < safeDepthM
            ? 0
            : depth < safeDepthM * 2.5
              ? 1
              : depth < safeDepthM * 6
                ? 2
                : 3;
        const [r, g, b] = bands[Math.min(lastBand, band)];

        image.data[index] = r;
        image.data[index + 1] = g;
        image.data[index + 2] = b;
        image.data[index + 3] = 255;
      }
    }

    context.putImageData(image, 0, 0);
    setHref(canvas.toDataURL("image/png"));
  }, [chart, palette, safeDepthM]);

  return href;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function ringPath(points: Vec2[] | ReadonlyArray<readonly [number, number]>) {
  if (points.length === 0) {
    return "";
  }

  let path = `M ${points[0][0]} ${points[0][1]}`;

  for (let index = 1; index < points.length; index += 1) {
    path += ` L ${points[index][0]} ${points[index][1]}`;
  }

  return `${path} Z`;
}

/**
 * Every contour, every land ring and all 680 of Squalicum's mapped floats used
 * to be their own SVG node, rebuilt and re-diffed on every pan frame. They're
 * static in chart coordinates — only the group transform moves — so they're
 * batched into a handful of paths and memoised. Node count drops by an order
 * of magnitude and React skips the subtree entirely while you drag.
 */
function joinPaths(parts: string[]) {
  return parts.join(" ");
}

/** A rotated rectangle as a closed subpath, in chart metres. */
function rectSubpath(
  centreX: number,
  centreZ: number,
  width: number,
  length: number,
  rotationDeg: number,
) {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const hw = width / 2;
  const hl = length / 2;
  const corners: Array<[number, number]> = [
    [-hw, -hl],
    [hw, -hl],
    [hw, hl],
    [-hw, hl],
  ];

  return (
    corners
      .map(([x, y], index) => {
        const px = centreX + x * cos - y * sin;
        const pz = centreZ + x * sin + y * cos;
        return `${index === 0 ? "M" : "L"} ${px.toFixed(1)} ${pz.toFixed(1)}`;
      })
      .join(" ") + " Z"
  );
}

function linePath(points: ReadonlyArray<readonly [number, number]>) {
  if (points.length === 0) {
    return "";
  }

  let path = `M ${points[0][0]} ${points[0][1]}`;

  for (let index = 1; index < points.length; index += 1) {
    path += ` L ${points[index][0]} ${points[index][1]}`;
  }

  return path;
}

export function ChartPlotter({
  chart,
  layout,
  theme,
  boat,
  headingDeg,
  sogKnots,
  track,
  berth,
  traffic,
  safeDepthM,
  mode,
  onModeChange,
  importedTrack,
  showImportedTrack = true,
  focus,
  children,
  headerExtra,
  anchor,
  chainMeters,
  northUp,
  onToggleNorthUp,
  rangeM,
  onRangeChange,
  height,
  onExpand,
  onCollapse,
}: ChartPlotterProps) {
  const palette = chartPalette(mode);
  const raster = useWaterRaster(chart, palette, safeDepthM);
  const docks = useMemo(() => sceneDocks(layout), [layout]);

  const boatChart = useMemo(
    () => (boat ? { x: -boat.x, z: boat.z } : null),
    [boat],
  );
  const berthChart = useMemo<[number, number] | null>(
    () => (berth ? fromWorld(berth.center[0], berth.center[1]) : null),
    [berth],
  );
  // The regional basemap sits under the harbour chart so that dragging
  // offshore shows the San Juans rather than a grey void. It lives in its own
  // frame about its own origin; one affine puts it in this chart's frame.
  const region = useMemo(() => regionTransform(chart), [chart]);
  const regionRaster = useWaterRaster(REGION_CHART, palette, safeDepthM);

  const { ref: boxRef, box } = usePlotterBox();
  const rotation = northUp ? 0 : -headingDeg;

  // The recorded track arrives as lat/lon and may run well beyond this
  // harbour's window — that's fine, it just draws over the no-data area.
  const importedPath = useMemo(() => {
    if (!importedTrack || !showImportedTrack || importedTrack.points.length < 2) {
      return null;
    }

    return importedTrack.points.map((point) => geoToChart(chart, point.lat, point.lon));
  }, [chart, importedTrack, showImportedTrack]);

  // Dragging detaches the view from the boat until you recentre, which is how
  // every plotter behaves when you shove the chart around to look ahead.
  const [panCentre, setPanCentre] = useState<{ x: number; z: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ pointerId: number; px: number; py: number } | null>(null);

  // Everything there is to look at: the surveyed window, the regional
  // basemap under it, and an imported track if one is loaded. Both zoom and
  // pan are held inside this, so the screen is always full of something.
  const contentBounds = useMemo(() => {
    const bounds = {
      minX: Math.min(-chart.halfWidthM, region.centreX - region.halfWidthM),
      maxX: Math.max(chart.halfWidthM, region.centreX + region.halfWidthM),
      minZ: Math.min(-chart.halfHeightM, region.centreZ - region.halfHeightM),
      maxZ: Math.max(chart.halfHeightM, region.centreZ + region.halfHeightM),
    };

    if (importedPath) {
      for (const [x, z] of importedPath) {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minZ = Math.min(bounds.minZ, z);
        bounds.maxZ = Math.max(bounds.maxZ, z);
      }
    }

    return bounds;
  }, [chart.halfWidthM, chart.halfHeightM, importedPath, region]);

  const following = panCentre === null;
  const shortSide = Math.min(box.w, box.h);
  const maxRange = Math.max(
    MIN_RANGE_M,
    Math.min(
      ((contentBounds.maxX - contentBounds.minX) / 2) * (shortSide / Math.max(1, box.w)),
      ((contentBounds.maxZ - contentBounds.minZ) / 2) * (shortSide / Math.max(1, box.h)),
    ),
  );
  const effectiveRange = Math.min(rangeM, maxRange);
  const scale = Math.min(box.w, box.h) / (effectiveRange * 2);

  const halfVisibleX = box.w / 2 / scale;
  const halfVisibleZ = box.h / 2 / scale;
  // Head-up rotates the viewport, so clamp against its circumscribed radius.
  const clampReach = northUp
    ? { x: halfVisibleX, z: halfVisibleZ }
    : (() => {
        const radius = Math.hypot(halfVisibleX, halfVisibleZ);
        return { x: radius, z: radius };
      })();

  const follow = boatChart ?? { x: berthChart?.[0] ?? 0, z: berthChart?.[1] ?? 0 };
  const clampCentre = (point: { x: number; z: number }) => ({
    x: clampAxis(point.x, clampReach.x, contentBounds.minX, contentBounds.maxX),
    z: clampAxis(point.z, clampReach.z, contentBounds.minZ, contentBounds.maxZ),
  });

  const desired = panCentre ?? follow;
  const centre = clampCentre(desired);

  // Screen pixels -> chart metres, undoing the head-up rotation.
  const screenToChartDelta = (dpx: number, dpy: number, atScale: number) => {
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      x: (dpx * cos + dpy * sin) / atScale,
      z: (dpx * sin - dpy * cos) / atScale,
    };
  };

  /**
   * A trackpad flings wheel events far faster than React re-renders. Zooming
   * from `effectiveRange` means every event in a burst computes off the same
   * stale base and the last one wins, so a long scroll barely moves — so the
   * accumulator lives in a ref that updates synchronously, and the rendered
   * value only re-syncs it when the range changes from somewhere else (the
   * +/- buttons, fit-track, a new harbour).
   */
  const rangeRef = useRef(effectiveRange);

  useEffect(() => {
    rangeRef.current = effectiveRange;
  }, [effectiveRange]);

  const handleWheel = useRef<(event: WheelEvent) => void>(() => {});
  handleWheel.current = (event: WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const from = Math.min(maxRange, Math.max(MIN_RANGE_M, rangeRef.current));
    const next = Math.min(
      maxRange,
      Math.max(MIN_RANGE_M, from * Math.exp(event.deltaY * WHEEL_ZOOM_RATE)),
    );

    if (Math.abs(next - from) < 0.01) {
      return;
    }

    rangeRef.current = next;

    // Following the boat means the boat is the centre, so zoom about it. Once
    // you've panned away there's no such anchor, so zoom about the cursor.
    if (panCentre) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const dpx = event.clientX - rect.left - box.w / 2;
      const dpy = event.clientY - rect.top - box.h / 2;
      const fromScale = Math.min(box.w, box.h) / (from * 2);
      const before = screenToChartDelta(dpx, dpy, fromScale);
      const nextScale = Math.min(box.w, box.h) / (next * 2);
      const after = screenToChartDelta(dpx, dpy, nextScale);

      setPanCentre(
        clampCentre({
          x: centre.x + before.x - after.x,
          z: centre.z + before.z - after.z,
        }),
      );
    }

    onRangeChange(next);
  };

  // A new harbour starts centred on the boat again.
  useEffect(() => {
    setPanCentre(null);
  }, [chart]);

  const focusNonce = focus?.nonce ?? 0;
  const focusX = focus?.x ?? 0;
  const focusZ = focus?.z ?? 0;

  useEffect(() => {
    if (focusNonce > 0) {
      setPanCentre({ x: focusX, z: focusZ });
    }
  }, [focusNonce, focusX, focusZ]);

  useEffect(() => {
    const element = boxRef.current;

    if (!element) {
      return;
    }

    // React registers wheel passively at the root, so preventDefault there is
    // ignored and the page scrolls behind the chart. Bind it ourselves.
    const listener = (event: WheelEvent) => handleWheel.current(event);
    element.addEventListener("wheel", listener, { passive: false });
    return () => element.removeEventListener("wheel", listener);
  }, [boxRef]);

  // Same maths as the SVG transform, for anything that must not rotate.
  const project = useMemo(() => {
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return (x: number, z: number): [number, number] => {
      const dx = (x - centre.x) * scale;
      const dy = -(z - centre.z) * scale;
      return [box.w / 2 + dx * cos - dy * sin, box.h / 2 + dx * sin + dy * cos];
    };
  }, [box.h, box.w, centre.x, centre.z, rotation, scale]);

  const transform = `translate(${box.w / 2} ${box.h / 2}) rotate(${rotation}) scale(${scale} ${-scale}) translate(${-centre.x} ${-centre.z})`;

  const visible = (x: number, z: number, pad = 60) => {
    const [px, py] = project(x, z);
    return px > -pad && px < box.w + pad && py > -pad && py < box.h + pad;
  };

  const importedPathD = useMemo(
    () => (importedPath ? linePath(importedPath) : null),
    [importedPath],
  );
  const ownTrackD = useMemo(
    () => (track.length > 1 ? linePath(track.map((p) => [-p.x, p.z] as const)) : null),
    [track],
  );

  /**
   * The chart itself. Depends only on the survey and the colour table, so it
   * is built once and React bails out of reconciling it while the transform
   * above it changes 60 times a second.
   */
  /**
   * The regional basemap, one <g> with its own affine so the region's own
   * coordinates can be used verbatim. Memoised on the transform rather than
   * on the view, so panning and zooming never rebuild it.
   */
  const regionGeometry = useMemo(() => {
    const contours: string[] = [];

    for (const contour of REGION_CHART.contours) {
      for (const line of contour.lines) {
        contours.push(linePath(line));
      }
    }

    const landRings: string[] = [];
    const holeRings: string[] = [];

    for (const ring of REGION_CHART.land) {
      (ring.hole ? holeRings : landRings).push(ringPath(ring.points));
    }

    return (
      <g
        transform={`translate(${region.offsetX} ${region.offsetZ}) scale(${region.scaleX} ${region.scaleZ})`}
      >
        {regionRaster ? (
          <image
            href={regionRaster}
            width={REGION_CHART.halfWidthM * 2}
            height={REGION_CHART.halfHeightM * 2}
            transform={`translate(${-REGION_CHART.halfWidthM} ${REGION_CHART.halfHeightM}) scale(1 -1)`}
            preserveAspectRatio="none"
          />
        ) : null}

        <path
          d={joinPaths(contours)}
          fill="none"
          stroke={palette.contourDeep}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={joinPaths(landRings)}
          fill={palette.land}
          stroke={palette.landEdge}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {holeRings.length > 0 ? (
          <path
            d={joinPaths(holeRings)}
            fill={palette.depthBands[palette.depthBands.length - 1]}
            stroke={palette.landEdge}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </g>
    );
  }, [palette, region, regionRaster]);

  const staticGeometry = useMemo(() => {
    const shallowContours: string[] = [];
    const deepContours: string[] = [];

    for (const contour of chart.contours) {
      const bucket = contour.depthM <= 5.5 ? shallowContours : deepContours;

      for (const line of contour.lines) {
        bucket.push(linePath(line));
      }
    }

    const landRings: string[] = [];
    const holeRings: string[] = [];

    for (const ring of chart.land) {
      (ring.hole ? holeRings : landRings).push(ringPath(ring.points));
    }

    const dockShapes = docks.map((dock) => {
      const [dx, dz] = fromWorld(dock.position[0], dock.position[1]);
      return rectSubpath(dx, dz, dock.size[0], dock.size[1], dock.rotationDeg ?? 0);
    });

    return (
      <>
        {/* Limit of the surveyed window. */}
        <rect
          x={-chart.halfWidthM}
          y={-chart.halfHeightM}
          width={chart.halfWidthM * 2}
          height={chart.halfHeightM * 2}
          fill={palette.depthBands[palette.depthBands.length - 1]}
          stroke={palette.label}
          strokeDasharray="10 8"
          strokeWidth="1"
          strokeOpacity="0.35"
          vectorEffect="non-scaling-stroke"
        />

        {raster ? (
          <image
            href={raster}
            width={chart.halfWidthM * 2}
            height={chart.halfHeightM * 2}
            transform={`translate(${-chart.halfWidthM} ${chart.halfHeightM}) scale(1 -1)`}
            preserveAspectRatio="none"
            style={{ imageRendering: "auto" }}
          />
        ) : null}

        {/* Depth contour ladder, two paths rather than a hundred. */}
        <path
          d={joinPaths(deepContours)}
          fill="none"
          stroke={palette.contourDeep}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={joinPaths(shallowContours)}
          fill="none"
          stroke={palette.contour}
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
        />

        {/* Land, then lagoons punched back out of it. */}
        <path
          d={joinPaths(landRings)}
          fill={palette.land}
          stroke={palette.landEdge}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          opacity={0.95}
        />
        {holeRings.length > 0 ? (
          <path
            d={joinPaths(holeRings)}
            fill={palette.depthBands[0]}
            stroke={palette.landEdge}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* Piers, floats and breakwaters. */}
        <path d={joinPaths(dockShapes)} fill={palette.structure} opacity={0.95} />
      </>
    );
  }, [chart, docks, palette, raster]);

  const geo = boatChart ? chartToGeo(chart, boatChart.x, boatChart.z) : null;
  const scaleBar = pickScaleBar(effectiveRange);

  const soundings = useMemo(
    () =>
      effectiveRange > REGION_LABEL_RANGE_M
        ? []
        : chart.soundings.filter(([x, z]) => visible(x, z, -20)).slice(0, 60),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chart.soundings, effectiveRange, box.h, box.w, centre.x, centre.z, rotation, scale],
  );
  // Zoomed in on a harbour you want its coves named; zoomed out to the
  // archipelago you want the islands and the channels between them, and the
  // harbour's own labels have become noise. Swap at roughly the point the
  // scene window stops filling the screen.
  const showRegionLabels = effectiveRange > REGION_LABEL_RANGE_M;

  const labels = useMemo(() => {
    const source = showRegionLabels
      ? REGION_CHART.labels.map((label) => {
          const [x, z] = regionToScene(region, label.x, label.z);
          return { ...label, x, z };
        })
      : chart.labels;

    return source.filter((label) => visible(label.x, label.z, -30)).slice(0, 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chart.labels,
    showRegionLabels,
    region,
    box.h,
    box.w,
    centre.x,
    centre.z,
    rotation,
    scale,
  ]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <PanelLabel>Plotter</PanelLabel>
        <div className="flex items-center gap-1.5">
          {geo ? (
            <span
              className="text-[0.55rem] leading-none"
              style={{ fontFamily: "var(--helm-font-readout)", color: "var(--helm-text-dim)" }}
            >
              {geo.lat.toFixed(4)}°N {Math.abs(geo.lon).toFixed(4)}°W
            </span>
          ) : null}
          {headerExtra}
          <HelmButton
            size="sm"
            onClick={() => onModeChange(mode === "day" ? "night" : "day")}
            title={mode === "day" ? "Switch to night colours" : "Switch to day colours"}
            ariaLabel="Chart colours"
          >
            {mode === "day" ? "☀" : "☾"}
          </HelmButton>
          {panCentre ? (
            <HelmButton
              size="sm"
              tone="accent"
              active
              onClick={() => setPanCentre(null)}
              title="Recentre on the boat"
            >
              ⌖ Boat
            </HelmButton>
          ) : null}
          <HelmButton size="sm" active={northUp} onClick={onToggleNorthUp} tone="accent">
            {northUp ? "N↑" : "H↑"}
          </HelmButton>
          {onExpand ? (
            <HelmButton size="sm" onClick={onExpand} ariaLabel="Expand plotter">
              ⤢
            </HelmButton>
          ) : null}
          {onCollapse ? (
            <HelmButton size="sm" onClick={onCollapse} ariaLabel="Close plotter">
              ✕
            </HelmButton>
          ) : null}
        </div>
      </div>

      <div
        ref={boxRef}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }

          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            px: event.clientX,
            py: event.clientY,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;

          if (!drag || drag.pointerId !== event.pointerId) {
            return;
          }

          const delta = screenToChartDelta(
            event.clientX - drag.px,
            event.clientY - drag.py,
            scale,
          );
          drag.px = event.clientX;
          drag.py = event.clientY;
          // Drag the chart, not the camera: the view moves the other way.
          setPanCentre((current) => {
            const from = current ? clampCentre(current) : centre;
            return clampCentre({ x: from.x - delta.x, z: from.z - delta.z });
          });
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) {
            dragRef.current = null;
            setDragging(false);
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragging(false);
        }}
        className={`relative mx-2 mb-2 touch-none select-none overflow-hidden rounded-md ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          height,
          width: "auto",
          // Outside the surveyed window is "no chart data", not deep water.
          background: palette.noData,
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 2px 12px rgba(0,0,0,0.55)",
        }}
      >
        <svg
          viewBox={`0 0 ${box.w} ${box.h}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          // Thousands of chart nodes would otherwise be hit-tested on every
          // pointer move. The container div is what listens.
          style={{ pointerEvents: "none" }}
        >
          <g transform={transform}>
            {regionGeometry}
            {staticGeometry}

            {/* Anchor swing circle */}
            {anchor && chainMeters ? (
              <circle
                cx={-anchor.x}
                cy={anchor.z}
                r={chainMeters}
                fill="none"
                stroke={palette.route}
                strokeDasharray="8 6"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                opacity={0.7}
              />
            ) : null}

            {/* Where you actually went: dashed, and deliberately not a chart
                colour, because it isn't chart data. */}
            {importedPathD ? (
              <path
                d={importedPathD}
                fill="none"
                stroke={IMPORTED_TRACK}
                strokeWidth="3"
                strokeDasharray="10 7"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity={0.75}
              />
            ) : null}

            {/* Own track */}
            {ownTrackD ? (
              <path
                d={ownTrackD}
                fill="none"
                stroke={palette.track}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity={0.9}
              />
            ) : null}

            {/* Bearing line to the berth */}
            {berthChart && boatChart ? (
              <line
                x1={boatChart.x}
                y1={boatChart.z}
                x2={berthChart[0]}
                y2={berthChart[1]}
                stroke={palette.route}
                strokeWidth="2"
                strokeDasharray="9 6"
                vectorEffect="non-scaling-stroke"
                opacity={0.85}
              />
            ) : null}
          </g>

          {/* --- fixed-size overlay ------------------------------------- */}

          {(layout.buoys ?? [])
            .map((buoy) => fromWorld(buoy[0], buoy[1]))
            .filter(([bx, bz]) => visible(bx, bz))
            .map((buoy, index) => {
              const [px, py] = project(buoy[0], buoy[1]);
              return (
                <circle
                  key={`buoy-${index}`}
                  cx={px}
                  cy={py}
                  r="4"
                  fill="none"
                  stroke={palette.label}
                  strokeWidth="2"
                />
              );
            })}

          {/* Crab pots and deadheads aren't charted — you find those by looking
              out of the window, not at the screen. They stay in the 3D world. */}

          {soundings.map(([x, z, depth], index) => {
            const [px, py] = project(x, z);
            return (
              <text
                key={`sound-${index}`}
                x={px}
                y={py}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{
                  fontFamily: "var(--helm-font-readout)",
                  fontSize: "14px",
                  fill: palette.sounding,
                  opacity: 0.85,
                }}
              >
                {Math.round(depth / METRES_PER_FOOT)}
              </text>
            );
          })}

          {labels.map((label) => {
            const [px, py] = project(label.x, label.z);
            return (
              <text
                key={label.name}
                x={px}
                y={py}
                textAnchor="middle"
                style={{
                  fontFamily: "var(--helm-font-label)",
                  fontSize: "17px",
                  letterSpacing: "1.4px",
                  fill: palette.label,
                  paintOrder: "stroke",
                  stroke: palette.labelHalo,
                  strokeWidth: "3px",
                  strokeLinejoin: "round",
                }}
              >
                {label.name.toUpperCase()}
              </text>
            );
          })}

          {/* AIS targets: the green triangle is the standard symbol for a
              vessel reporting over NMEA, pointing along its course. */}
          {(traffic ?? [])
            .map((target) => {
              const [tx, tz] = fromWorld(target.x, target.z);
              return { ...target, x: tx, z: tz, headingDeg: -target.headingDeg };
            })
            .filter((target) => visible(target.x, target.z))
            .map((target) => {
              const [px, py] = project(target.x, target.z);
              const iconRotation = target.headingDeg + (northUp ? 0 : headingDeg);
              const vector = Math.min(48, 10 + target.sogKnots * 7);

              return (
                <g key={`ais-${target.id}`} transform={`translate(${px} ${py})`}>
                  <g transform={`rotate(${iconRotation})`}>
                    {target.sogKnots > 0.2 ? (
                      <line
                        x1="0"
                        y1="0"
                        x2="0"
                        y2={-vector}
                        stroke={palette.ais}
                        strokeWidth="1.6"
                        opacity="0.7"
                      />
                    ) : null}
                    <path
                      d="M 0 -8 L 5.6 7 L -5.6 7 Z"
                      fill="none"
                      stroke={palette.ais}
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </g>
                  <text
                    x="9"
                    y="-6"
                    style={{
                      fontFamily: "var(--helm-font-label)",
                      fontSize: "14px",
                      letterSpacing: "0.8px",
                      fill: palette.ais,
                      opacity: 0.85,
                      paintOrder: "stroke",
                      stroke: palette.labelHalo,
                      strokeWidth: "3px",
                      strokeLinejoin: "round",
                    }}
                  >
                    {target.name.toUpperCase()}
                  </text>
                </g>
              );
            })}

          {berthChart
            ? (() => {
                const [px, py] = project(berthChart[0], berthChart[1]);
                return (
                  <g key="berth">
                    <circle
                      cx={px}
                      cy={py}
                      r="9"
                      fill="none"
                      stroke={palette.route}
                      strokeWidth="2.4"
                    />
                    <circle cx={px} cy={py} r="2.4" fill={palette.route} />
                  </g>
                );
              })()
            : null}

          {importedPath
            ? [importedPath[0], importedPath[importedPath.length - 1]].map(
                ([tx, tz], index) => {
                  const [px, py] = project(tx, tz);
                  return (
                    <circle
                      key={`imported-end-${index}`}
                      cx={px}
                      cy={py}
                      r="4"
                      fill={index === 0 ? IMPORTED_TRACK : "none"}
                      stroke={IMPORTED_TRACK}
                      strokeWidth="2"
                    />
                  );
                },
              )
            : null}

          {boatChart
            ? (() => {
                const [px, py] = project(boatChart.x, boatChart.z);
                const iconRotation = northUp ? headingDeg : 0;
                const vectorLength = Math.min(90, 14 + sogKnots * 9);
                return (
                  <g key="own-ship" transform={`translate(${px} ${py})`}>
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2={-vectorLength}
                      stroke={palette.ownShip}
                      strokeWidth="2"
                      opacity="0.75"
                      transform={`rotate(${iconRotation})`}
                    />
                    <g transform={`rotate(${iconRotation})`}>
                      <path
                        d="M 0 -13 L 8 11 L 0 6 L -8 11 Z"
                        fill={palette.ownShip}
                        stroke={palette.depthBands[palette.depthBands.length - 1]}
                        strokeWidth="1.4"
                      />
                    </g>
                  </g>
                );
              })()
            : null}
        </svg>

        {children}

        <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-2">
          <span
            className="inline-block"
            style={{
              width: `${(scaleBar / (effectiveRange * 2)) * 100}%`,
              minWidth: "18px",
              height: "2px",
              background: palette.label,
            }}
          />
          <span
            className="text-[0.5rem] leading-none"
            style={{ fontFamily: "var(--helm-font-readout)", color: palette.label }}
          >
            {scaleBar >= 1852 ? `${(scaleBar / 1852).toFixed(1)} nm` : `${scaleBar} m`}
          </span>
        </div>

        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <HelmButton
            size="sm"
            onClick={() => onRangeChange(stepRange(effectiveRange, 1, maxRange))}
            disabled={effectiveRange >= maxRange - 0.5}
            ariaLabel="Zoom out"
          >
            −
          </HelmButton>
          <span
            className="min-w-[2.6rem] rounded px-1 py-0.5 text-center text-[0.52rem] leading-none"
            style={{
              fontFamily: "var(--helm-font-readout)",
              color: palette.label,
              background: palette.overlay,
            }}
          >
            {formatRange(effectiveRange)}
          </span>
          <HelmButton
            size="sm"
            onClick={() => onRangeChange(stepRange(effectiveRange, -1))}
            disabled={effectiveRange <= MIN_RANGE_M + 0.5}
            ariaLabel="Zoom in"
          >
            +
          </HelmButton>
        </div>
      </div>
    </div>
  );
}

export function formatRange(rangeM: number) {
  if (rangeM >= 1852) {
    return `${(rangeM / 1852).toFixed(rangeM >= 3704 ? 1 : 2)} nm`;
  }

  return `${Math.round(rangeM / 10) * 10} m`;
}

/**
 * Snap to the next preset in `direction`. The current range may be anything
 * after a wheel zoom, so find where it sits first.
 */
function stepRange(current: PlotterRange, direction: 1 | -1, max?: PlotterRange): PlotterRange {
  const ceiling = max ?? PLOTTER_RANGES[PLOTTER_RANGES.length - 1];

  if (direction === 1) {
    const next = PLOTTER_RANGES.find((range) => range > current * 1.02);
    return Math.min(ceiling, next ?? ceiling);
  }

  const below = PLOTTER_RANGES.filter((range) => range < current * 0.98);
  return below.length > 0 ? below[below.length - 1] : MIN_RANGE_M;
}

/** Widest range that still has chart under it, so the screen is never half empty. */
export function maxRangeForChart(chart: { halfWidthM: number; halfHeightM: number }): PlotterRange {
  return Math.max(MIN_RANGE_M, Math.min(chart.halfWidthM, chart.halfHeightM));
}

/** Smallest range that still shows both the boat and the berth. */
export function rangeForDistance(
  distanceM: number,
  chart?: { halfWidthM: number; halfHeightM: number },
): PlotterRange {
  const wanted =
    PLOTTER_RANGES.find((range) => range >= distanceM * 0.62) ??
    PLOTTER_RANGES[PLOTTER_RANGES.length - 1];

  if (!chart) {
    return wanted;
  }

  return Math.min(wanted, maxRangeForChart(chart));
}

function pickScaleBar(rangeM: number) {
  const target = rangeM * 0.5;
  const options = [50, 100, 200, 500, 1000, 1852, 3704];
  return options.reduce((best, option) =>
    Math.abs(option - target) < Math.abs(best - target) ? option : best,
  );
}
