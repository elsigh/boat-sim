"use client";

import type { CSSProperties, ReactNode } from "react";

// The building blocks every HUD panel is made of. They read their appearance
// from the --helm-* custom properties set by HelmSurface, so a Grand Banks
// panel and a Cranchi panel are the same component with different materials.

type PanelProps = {
  children: ReactNode;
  className?: string;
  /** Adds the machined bezel around the instrument face. */
  framed?: boolean;
  style?: CSSProperties;
  /** Dims the whole panel — used for controls that aren't available yet. */
  muted?: boolean;
  /**
   * The glass reflection reads well over dark instruments and washes out a
   * day-mode chart, so the plotter turns it off.
   */
  glass?: boolean;
};

export function Panel({
  children,
  className = "",
  framed = true,
  glass = true,
  muted,
  style,
}: PanelProps) {
  return (
    <div
      className={`relative isolate ${className}`}
      style={{
        borderRadius: "var(--helm-radius)",
        padding: framed ? "var(--helm-bezel)" : 0,
        background: framed ? "var(--helm-frame)" : "transparent",
        boxShadow: framed ? "var(--helm-shadow)" : undefined,
        opacity: muted ? 0.55 : 1,
        ...style,
      }}
    >
      {framed ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: "var(--helm-radius)",
            boxShadow:
              "inset 0 0 0 1px var(--helm-edge), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.4)",
          }}
        />
      ) : null}
      <div
        className="relative overflow-hidden"
        style={{
          borderRadius: framed
            ? "calc(var(--helm-radius) - var(--helm-bezel) + 2px)"
            : "var(--helm-radius)",
          background: "var(--helm-face)",
          boxShadow: framed
            ? "inset 0 0 0 1px rgba(0,0,0,0.55), inset 0 2px 10px rgba(0,0,0,0.5)"
            : undefined,
        }}
      >
        {glass ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10"
            style={{ background: "var(--helm-glass)" }}
          />
        ) : null}
        <div className="relative z-0">{children}</div>
      </div>
    </div>
  );
}

/** The engraved plate above a panel: small caps, wide tracking, brass-toned. */
export function PanelLabel({
  children,
  className = "",
  dim,
}: {
  children: ReactNode;
  className?: string;
  dim?: boolean;
}) {
  return (
    <span
      className={`block whitespace-nowrap text-[0.74rem] leading-none ${className}`}
      style={{
        fontFamily: "var(--helm-font-label)",
        fontWeight: "var(--helm-label-weight)" as unknown as number,
        letterSpacing: "var(--helm-label-tracking)",
        textTransform: "var(--helm-label-transform)" as CSSProperties["textTransform"],
        color: dim ? "var(--helm-label-dim)" : "var(--helm-label)",
      }}
    >
      {children}
    </span>
  );
}

export function PanelHeader({
  title,
  right,
  className = "",
}: {
  title: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 px-3 pt-2.5 pb-1.5 ${className}`}>
      <PanelLabel>{title}</PanelLabel>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}

/** A recessed well inside a face — sub-readouts, sliders, list rows. */
export function Well({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`relative ${className}`}
      style={{
        borderRadius: "calc(var(--helm-radius) * 0.55)",
        background: "var(--helm-well)",
        boxShadow: "inset 0 0 0 1px var(--helm-inset-edge), inset 0 1px 3px rgba(0,0,0,0.28)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Lit numerals. The glow is the instrument backlight bleeding through. */
export function Readout({
  value,
  unit,
  size = "md",
  tone = "readout",
  className = "",
}: {
  value: ReactNode;
  unit?: string;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "readout" | "good" | "warn" | "danger" | "text";
  className?: string;
}) {
  const sizes = {
    sm: "text-[0.84rem]",
    md: "text-[1.07rem]",
    lg: "text-[1.57rem]",
    xl: "text-[2.22rem]",
  } as const;
  const color =
    tone === "readout"
      ? "var(--helm-readout)"
      : tone === "text"
        ? "var(--helm-text)"
        : `var(--helm-${tone})`;

  return (
    <span className={`inline-flex items-baseline gap-1 ${className}`}>
      <span
        className={`${sizes[size]} leading-none tabular-nums`}
        style={{
          fontFamily: "var(--helm-font-readout)",
          color,
          textShadow:
            tone === "readout" ? "0 0 12px var(--helm-readout-glow)" : undefined,
        }}
      >
        {value}
      </span>
      {unit ? (
        <span
          className="text-[0.67rem] leading-none"
          style={{
            fontFamily: "var(--helm-font-label)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--helm-text-dim)",
          }}
        >
          {unit}
        </span>
      ) : null}
    </span>
  );
}

/** Small labelled value used in dense rows. */
export function Metric({
  label,
  value,
  unit,
  tone,
  className = "",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "readout" | "good" | "warn" | "danger" | "text";
  className?: string;
}) {
  return (
    <Well className={`px-2 py-1.5 ${className}`}>
      <PanelLabel dim className="!text-[0.62rem]">
        {label}
      </PanelLabel>
      <div className="mt-1">
        <Readout value={value} unit={unit} size="sm" tone={tone} />
      </div>
    </Well>
  );
}

/** A status pill: engine armed, fuel dock open, docked, and so on. */
export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "good" | "warn" | "danger";
  className?: string;
}) {
  const color =
    tone === "neutral" ? "var(--helm-text-dim)" : `var(--helm-${tone})`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-[0.15rem] text-[0.67rem] leading-none ${className}`}
      style={{
        fontFamily: "var(--helm-font-label)",
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color,
        border: `1px solid color-mix(in srgb, ${color} 42%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

/** A lit indicator lamp. */
export function Lamp({
  on,
  tone = "good",
  pulse,
  title,
}: {
  on: boolean;
  tone?: "good" | "warn" | "danger" | "accent";
  pulse?: boolean;
  title?: string;
}) {
  const color = `var(--helm-${tone})`;

  return (
    <span
      title={title}
      className={`inline-block h-[0.4rem] w-[0.4rem] shrink-0 rounded-full ${pulse ? "animate-pulse" : ""}`}
      style={{
        background: on ? color : "var(--helm-inset)",
        boxShadow: on ? `0 0 8px ${color}` : "inset 0 0 0 1px var(--helm-inset-edge)",
      }}
    />
  );
}
