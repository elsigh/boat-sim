import type { CSSProperties } from "react";

import type { BoatProfile } from "./catalog";

// Every boat's helm is built out of the same parts — a bezel, an instrument
// face, engraved labels, a readout — but a Grand Banks and a Cranchi don't look
// remotely alike. This file describes what each boat's helm is made of, and
// hands the answer to the UI as CSS custom properties so the components stay
// free of per-boat branching.

export type HelmMaterial = "teak" | "expedition" | "carbon" | "mahogany" | "lacquer";

/** Digital boats get LCD numerals; analog boats get needles and printed dials. */
export type InstrumentStyle = "digital" | "analog";

export type HelmTheme = {
  id: string;
  material: HelmMaterial;
  instrument: InstrumentStyle;

  /** Panel corner radius in px. Classic joinery is round; race boats are sharp. */
  radius: number;
  /** Thickness of the bezel around each panel, px. */
  bezel: number;

  surface: {
    /** Outer bezel material. */
    frame: string;
    /** Instrument face behind the numbers. */
    face: string;
    /** Recessed wells inside a face (sub-readouts, sliders). */
    well: string;
    /** Hairline that reads as the machined edge of the bezel. */
    edge: string;
    /** Metal accent: brass, stainless, chrome, anodised. */
    trim: string;
    /** Glass reflection laid over instrument faces. */
    glass: string;
    /** Drop shadow under a panel. */
    shadow: string;
    /**
     * Background for idle controls and recessed chips. Dark helms tint with
     * white, the varnished-mahogany helm tints with black — without this the
     * buttons vanish on a cream instrument face.
     */
    inset: string;
    /** Hairline on those same controls. */
    insetEdge: string;
  };

  color: {
    label: string;
    labelDim: string;
    text: string;
    textDim: string;
    /** Numerals in a readout. */
    readout: string;
    /** Backlight bleed around lit numerals. */
    readoutGlow: string;
    accent: string;
    accentSoft: string;
    good: string;
    warn: string;
    danger: string;
  };

  type: {
    label: string;
    readout: string;
    body: string;
    labelTracking: string;
    labelWeight: number;
    labelTransform: "uppercase" | "none";
  };

  plotter: {
    water: string;
    waterDeep: string;
    land: string;
    landEdge: string;
    contour: string;
    contourDeep: string;
    grid: string;
    track: string;
    route: string;
    hazard: string;
    ownShip: string;
    bezel: string;
    label: string;
    /** Piers, floats and breakwaters. Grey, so they don't read as land. */
    structure: string;
    /** Background behind chips laid over the chart. */
    overlay: string;
    /** Beyond the surveyed window — deliberately not a water colour. */
    noData: string;
  };
};

// --- fonts -------------------------------------------------------------------
// Loaded in app/layout.tsx via next/font, which self-hosts them so the Electron
// build works offline.

const LABEL_CONDENSED = "var(--font-helm-label), ui-sans-serif, system-ui, sans-serif";
const READOUT_DIGITAL = "var(--font-helm-digital), ui-monospace, monospace";
const READOUT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const BODY = "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif";

// --- materials ---------------------------------------------------------------

const TEAK_GRAIN = `
  repeating-linear-gradient(96deg,
    rgba(0,0,0,0.20) 0px, rgba(0,0,0,0.20) 1px,
    rgba(255,236,205,0.05) 1px, rgba(255,236,205,0.05) 3px,
    rgba(0,0,0,0.11) 3px, rgba(0,0,0,0.11) 7px),
  linear-gradient(158deg, #7a4f27 0%, #4a2f18 46%, #63401f 78%, #35210f 100%)
`;

const MAHOGANY_GRAIN = `
  repeating-linear-gradient(91deg,
    rgba(0,0,0,0.24) 0px, rgba(0,0,0,0.24) 1px,
    rgba(255,198,164,0.05) 1px, rgba(255,198,164,0.05) 3px,
    rgba(0,0,0,0.13) 3px, rgba(0,0,0,0.13) 6px),
  linear-gradient(150deg, #6d2a1c 0%, #3b160e 52%, #571f14 100%)
`;

const BRUSHED_STEEL = `
  repeating-linear-gradient(93deg,
    rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 1px,
    rgba(0,0,0,0.075) 1px, rgba(0,0,0,0.075) 3px),
  linear-gradient(168deg, #2f373e 0%, #1b2126 60%, #262d33 100%)
`;

const CARBON_WEAVE = `
  repeating-conic-gradient(from 45deg at 50% 50%,
    rgba(255,255,255,0.045) 0% 25%, rgba(0,0,0,0.10) 0% 50%) 0 0 / 7px 7px,
  linear-gradient(160deg, #1a1f24 0%, #0e1216 55%, #171d22 100%)
`;

const PEARL_LACQUER = `
  linear-gradient(158deg, #e9edf0 0%, #c3ccd3 40%, #dee5ea 66%, #aeb9c1 100%)
`;

const BRASS = "linear-gradient(180deg, #e6c882 0%, #b98f36 42%, #7c5c1c 100%)";
const CHROME = "linear-gradient(180deg, #f2f6f9 0%, #b9c5cd 45%, #7f8c95 100%)";
const STAINLESS = "linear-gradient(180deg, #d3dde4 0%, #94a3ad 48%, #626f78 100%)";
const ANODISED = "linear-gradient(180deg, #9fc4d8 0%, #5b7f95 48%, #33505f 100%)";

// --- base themes per material -------------------------------------------------

function teakTheme(): HelmTheme {
  return {
    id: "teak",
    material: "teak",
    instrument: "digital",
    radius: 14,
    bezel: 7,
    surface: {
      frame: TEAK_GRAIN,
      face: "radial-gradient(130% 100% at 50% -10%, rgba(255,204,138,0.10), rgba(255,204,138,0) 62%), linear-gradient(180deg, #101a1e 0%, #070d10 100%)",
      well: "linear-gradient(180deg, rgba(0,0,0,0.42), rgba(0,0,0,0.24))",
      edge: "rgba(232,201,145,0.30)",
      trim: BRASS,
      glass:
        "linear-gradient(197deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 26%, rgba(255,255,255,0) 52%)",
      shadow: "0 18px 38px -18px rgba(0,0,0,0.85), 0 2px 0 rgba(255,232,190,0.06) inset",
      inset: "rgba(255,255,255,0.05)",
      insetEdge: "rgba(255,255,255,0.10)",
    },
    color: {
      label: "#f0dcb6",
      labelDim: "rgba(240,220,182,0.55)",
      text: "#f4ede0",
      textDim: "rgba(244,237,224,0.58)",
      readout: "#ffc861",
      readoutGlow: "rgba(255,178,58,0.42)",
      accent: "#ffb43c",
      accentSoft: "rgba(255,180,60,0.16)",
      good: "#79e0a4",
      warn: "#ffca55",
      danger: "#ff7d6b",
    },
    type: {
      label: LABEL_CONDENSED,
      readout: READOUT_DIGITAL,
      body: BODY,
      labelTracking: "0.22em",
      labelWeight: 600,
      labelTransform: "uppercase",
    },
    plotter: {
      water: "#1c5f7d",
      waterDeep: "#04131c",
      land: "#c8b98f",
      landEdge: "#efe2bc",
      contour: "rgba(150,205,230,0.34)",
      contourDeep: "rgba(120,170,200,0.20)",
      grid: "rgba(255,214,150,0.07)",
      track: "#7fd8ff",
      route: "#ffb43c",
      hazard: "#ff9a5c",
      ownShip: "#ffe6b8",
      bezel: BRASS,
      label: "rgba(240,228,200,0.8)",
      structure: "#7d8b93",
      overlay: "rgba(4,10,14,0.55)",
      noData: "#14161a",
    },
  };
}

function expeditionTheme(): HelmTheme {
  return {
    id: "expedition",
    material: "expedition",
    instrument: "digital",
    radius: 8,
    bezel: 6,
    surface: {
      frame: BRUSHED_STEEL,
      face: "radial-gradient(120% 100% at 50% -10%, rgba(150,200,235,0.08), rgba(150,200,235,0) 60%), linear-gradient(180deg, #0d1418 0%, #05090c 100%)",
      well: "linear-gradient(180deg, rgba(0,0,0,0.40), rgba(0,0,0,0.22))",
      edge: "rgba(190,214,230,0.24)",
      trim: STAINLESS,
      glass:
        "linear-gradient(197deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.015) 30%, rgba(255,255,255,0) 55%)",
      shadow: "0 16px 34px -18px rgba(0,0,0,0.85), 0 1px 0 rgba(200,225,240,0.07) inset",
      inset: "rgba(255,255,255,0.05)",
      insetEdge: "rgba(255,255,255,0.10)",
    },
    color: {
      label: "#cfe0ea",
      labelDim: "rgba(207,224,234,0.5)",
      text: "#e8f1f6",
      textDim: "rgba(232,241,246,0.55)",
      readout: "#c9f0ff",
      readoutGlow: "rgba(120,200,240,0.35)",
      accent: "#68c8f0",
      accentSoft: "rgba(104,200,240,0.15)",
      good: "#7ce0b0",
      warn: "#ffcf6a",
      danger: "#ff8574",
    },
    type: {
      label: LABEL_CONDENSED,
      readout: READOUT_MONO,
      body: BODY,
      labelTracking: "0.26em",
      labelWeight: 500,
      labelTransform: "uppercase",
    },
    plotter: {
      water: "#17586e",
      waterDeep: "#03101a",
      land: "#8e9a86",
      landEdge: "#cfd8c6",
      contour: "rgba(150,205,230,0.30)",
      contourDeep: "rgba(120,170,200,0.18)",
      grid: "rgba(160,200,225,0.06)",
      track: "#7fd8ff",
      route: "#f0c26a",
      hazard: "#ffab6a",
      ownShip: "#dff2ff",
      bezel: STAINLESS,
      label: "rgba(214,231,241,0.78)",
      structure: "#78868f",
      overlay: "rgba(4,10,14,0.55)",
      noData: "#14161a",
    },
  };
}

function carbonTheme(): HelmTheme {
  return {
    id: "carbon",
    material: "carbon",
    instrument: "digital",
    radius: 4,
    bezel: 5,
    surface: {
      frame: CARBON_WEAVE,
      face: "radial-gradient(120% 100% at 50% -10%, rgba(110,220,255,0.09), rgba(110,220,255,0) 58%), linear-gradient(180deg, #0a1116 0%, #04080b 100%)",
      well: "linear-gradient(180deg, rgba(0,0,0,0.48), rgba(0,0,0,0.26))",
      edge: "rgba(140,200,225,0.22)",
      trim: ANODISED,
      glass:
        "linear-gradient(200deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 24%, rgba(255,255,255,0) 48%)",
      shadow: "0 14px 30px -16px rgba(0,0,0,0.9)",
      inset: "rgba(255,255,255,0.05)",
      insetEdge: "rgba(255,255,255,0.10)",
    },
    color: {
      label: "#a9c8d8",
      labelDim: "rgba(169,200,216,0.5)",
      text: "#e6f4fa",
      textDim: "rgba(230,244,250,0.55)",
      readout: "#8ff0ff",
      readoutGlow: "rgba(80,220,255,0.40)",
      accent: "#4fd8f5",
      accentSoft: "rgba(79,216,245,0.14)",
      good: "#6ff0b8",
      warn: "#ffd15c",
      danger: "#ff6f6f",
    },
    type: {
      label: LABEL_CONDENSED,
      readout: READOUT_DIGITAL,
      body: BODY,
      labelTracking: "0.3em",
      labelWeight: 600,
      labelTransform: "uppercase",
    },
    plotter: {
      water: "#0f5f80",
      waterDeep: "#020c14",
      land: "#7f8d94",
      landEdge: "#c6d6dd",
      contour: "rgba(120,220,255,0.28)",
      contourDeep: "rgba(90,170,210,0.16)",
      grid: "rgba(120,220,255,0.06)",
      track: "#7ff0ff",
      route: "#4fd8f5",
      hazard: "#ff9f5a",
      ownShip: "#d9fbff",
      bezel: ANODISED,
      label: "rgba(206,234,244,0.78)",
      structure: "#6f8189",
      overlay: "rgba(3,8,12,0.6)",
      noData: "#101216",
    },
  };
}

function mahoganyTheme(): HelmTheme {
  return {
    id: "mahogany",
    material: "mahogany",
    instrument: "analog",
    radius: 16,
    bezel: 8,
    surface: {
      frame: MAHOGANY_GRAIN,
      face: "radial-gradient(120% 100% at 50% 0%, #f4ecd8 0%, #ddd0b3 62%, #c3b492 100%)",
      well: "linear-gradient(180deg, rgba(60,40,26,0.14), rgba(60,40,26,0.06))",
      edge: "rgba(64,38,22,0.35)",
      trim: CHROME,
      glass:
        "linear-gradient(198deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.10) 22%, rgba(255,255,255,0) 46%)",
      shadow: "0 18px 36px -18px rgba(0,0,0,0.8)",
      inset: "rgba(44,28,17,0.07)",
      insetEdge: "rgba(44,28,17,0.22)",
    },
    color: {
      label: "#3a2416",
      labelDim: "rgba(58,36,22,0.62)",
      text: "#2c1c11",
      textDim: "rgba(44,28,17,0.65)",
      readout: "#25160d",
      readoutGlow: "rgba(0,0,0,0)",
      accent: "#b8342a",
      accentSoft: "rgba(184,52,42,0.14)",
      good: "#2f7d4f",
      warn: "#a4701a",
      danger: "#b8342a",
    },
    type: {
      label: LABEL_CONDENSED,
      readout: READOUT_MONO,
      body: BODY,
      labelTracking: "0.2em",
      labelWeight: 600,
      labelTransform: "uppercase",
    },
    plotter: {
      water: "#9ecae4",
      waterDeep: "#f4f8fb",
      land: "#e3d5ad",
      landEdge: "#8b7748",
      contour: "rgba(60,110,140,0.35)",
      contourDeep: "rgba(60,110,140,0.18)",
      grid: "rgba(60,80,95,0.08)",
      track: "#1f5f8a",
      route: "#b8342a",
      hazard: "#c25a1c",
      ownShip: "#1b2a33",
      bezel: CHROME,
      label: "rgba(40,32,22,0.78)",
      structure: "#5d6b74",
      overlay: "rgba(247,242,228,0.82)",
      noData: "#b9b6ac",
    },
  };
}

function lacquerTheme(): HelmTheme {
  return {
    id: "lacquer",
    material: "lacquer",
    instrument: "digital",
    radius: 10,
    bezel: 6,
    surface: {
      frame: PEARL_LACQUER,
      face: "radial-gradient(120% 100% at 50% -10%, rgba(180,215,240,0.10), rgba(180,215,240,0) 58%), linear-gradient(180deg, #10161b 0%, #070b0e 100%)",
      well: "linear-gradient(180deg, rgba(0,0,0,0.38), rgba(0,0,0,0.20))",
      edge: "rgba(226,238,246,0.34)",
      trim: CHROME,
      glass:
        "linear-gradient(196deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.03) 28%, rgba(255,255,255,0) 54%)",
      shadow: "0 20px 40px -20px rgba(0,0,0,0.8)",
      inset: "rgba(255,255,255,0.06)",
      insetEdge: "rgba(255,255,255,0.12)",
    },
    color: {
      label: "#dbe7ef",
      labelDim: "rgba(219,231,239,0.52)",
      text: "#f2f8fc",
      textDim: "rgba(242,248,252,0.58)",
      readout: "#eaf6ff",
      readoutGlow: "rgba(190,225,255,0.30)",
      accent: "#9fd0f0",
      accentSoft: "rgba(159,208,240,0.15)",
      good: "#8ae3b4",
      warn: "#ffd57a",
      danger: "#ff8c80",
    },
    type: {
      label: LABEL_CONDENSED,
      readout: READOUT_MONO,
      body: BODY,
      labelTracking: "0.3em",
      labelWeight: 400,
      labelTransform: "uppercase",
    },
    plotter: {
      water: "#1a5a76",
      waterDeep: "#04121b",
      land: "#a8ac9e",
      landEdge: "#e0e5d9",
      contour: "rgba(170,215,240,0.30)",
      contourDeep: "rgba(130,180,210,0.17)",
      grid: "rgba(200,225,240,0.06)",
      track: "#a6e4ff",
      route: "#9fd0f0",
      hazard: "#ffb27a",
      ownShip: "#f2fbff",
      bezel: CHROME,
      label: "rgba(226,238,246,0.8)",
      structure: "#7f8b93",
      overlay: "rgba(5,12,17,0.55)",
      noData: "#151920",
    },
  };
}

const MATERIAL_THEMES: Record<HelmMaterial, () => HelmTheme> = {
  teak: teakTheme,
  expedition: expeditionTheme,
  carbon: carbonTheme,
  mahogany: mahoganyTheme,
  lacquer: lacquerTheme,
};

// Which helm each boat in the catalogue actually has.
const BOAT_MATERIAL: Record<string, HelmMaterial> = {
  "52-grand-banks-bonum-vitae": "teak",
  "86-nordhavn-serendipity": "expedition",
  "55-nordhavn-penalty-box-iii": "expedition",
  "2026-cranchi-e26-rider": "carbon",
  "2026-cranchi-settantotto-78": "carbon",
  "2005-chris-craft-corsair-36": "mahogany",
  "1997-crescent-custom-114": "lacquer",
};

const themeCache = new Map<string, HelmTheme>();

export function helmThemeFor(boat: Pick<BoatProfile, "profileSlug">): HelmTheme {
  const cached = themeCache.get(boat.profileSlug);

  if (cached) {
    return cached;
  }

  const material = BOAT_MATERIAL[boat.profileSlug] ?? "expedition";
  const theme = { ...MATERIAL_THEMES[material](), id: boat.profileSlug };
  themeCache.set(boat.profileSlug, theme);
  return theme;
}

/**
 * The theme as CSS custom properties. Spread onto a wrapper element and every
 * descendant can style itself with `var(--helm-*)` — no prop drilling, and the
 * whole HUD re-skins the moment you switch boats.
 */
export function helmCssVars(theme: HelmTheme): CSSProperties {
  return {
    "--helm-frame": theme.surface.frame,
    "--helm-face": theme.surface.face,
    "--helm-well": theme.surface.well,
    "--helm-edge": theme.surface.edge,
    "--helm-trim": theme.surface.trim,
    "--helm-glass": theme.surface.glass,
    "--helm-shadow": theme.surface.shadow,
    "--helm-inset": theme.surface.inset,
    "--helm-inset-edge": theme.surface.insetEdge,

    "--helm-label": theme.color.label,
    "--helm-label-dim": theme.color.labelDim,
    "--helm-text": theme.color.text,
    "--helm-text-dim": theme.color.textDim,
    "--helm-readout": theme.color.readout,
    "--helm-readout-glow": theme.color.readoutGlow,
    "--helm-accent": theme.color.accent,
    "--helm-accent-soft": theme.color.accentSoft,
    "--helm-good": theme.color.good,
    "--helm-warn": theme.color.warn,
    "--helm-danger": theme.color.danger,

    "--helm-font-label": theme.type.label,
    "--helm-font-readout": theme.type.readout,
    "--helm-font-body": theme.type.body,
    "--helm-label-tracking": theme.type.labelTracking,
    "--helm-label-weight": String(theme.type.labelWeight),
    "--helm-label-transform": theme.type.labelTransform,

    "--helm-radius": `${theme.radius}px`,
    "--helm-bezel": `${theme.bezel}px`,

    "--helm-plot-water": theme.plotter.water,
    "--helm-plot-water-deep": theme.plotter.waterDeep,
    "--helm-plot-land": theme.plotter.land,
    "--helm-plot-land-edge": theme.plotter.landEdge,
    "--helm-plot-contour": theme.plotter.contour,
    "--helm-plot-contour-deep": theme.plotter.contourDeep,
    "--helm-plot-grid": theme.plotter.grid,
    "--helm-plot-track": theme.plotter.track,
    "--helm-plot-route": theme.plotter.route,
    "--helm-plot-hazard": theme.plotter.hazard,
    "--helm-plot-own": theme.plotter.ownShip,
    "--helm-plot-bezel": theme.plotter.bezel,
    "--helm-plot-label": theme.plotter.label,
    "--helm-plot-structure": theme.plotter.structure,
    "--helm-plot-overlay": theme.plotter.overlay,
    "--helm-plot-nodata": theme.plotter.noData,
  } as CSSProperties;
}
