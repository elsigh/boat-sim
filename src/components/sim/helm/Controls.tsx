"use client";

import type { CSSProperties, ReactNode } from "react";

// Buttons, toggles and selects that look like helm hardware rather than web
// chrome. All colour comes from --helm-* so they re-skin with the boat.

function stopPointer(event: React.PointerEvent<HTMLElement>) {
  event.stopPropagation();
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  tone?: "neutral" | "accent" | "good" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  title?: string;
  ariaLabel?: string;
};

const SIZES = {
  sm: "px-2 py-1 text-[0.67rem]",
  md: "px-3 py-1.5 text-[0.74rem]",
  lg: "px-4 py-2.5 text-[0.87rem]",
} as const;

export function HelmButton({
  children,
  onClick,
  active,
  disabled,
  tone = "neutral",
  size = "md",
  className = "",
  title,
  ariaLabel,
}: ButtonProps) {
  const color = tone === "neutral" ? "var(--helm-text)" : `var(--helm-${tone})`;

  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      disabled={disabled}
      onPointerDown={stopPointer}
      onClick={onClick}
      className={`relative rounded-md leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--helm-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-45 ${SIZES[size]} ${className}`}
      style={{
        fontFamily: "var(--helm-font-label)",
        fontWeight: "var(--helm-label-weight)" as unknown as number,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: active ? color : "var(--helm-text-dim)",
        background: active
          ? `color-mix(in srgb, ${color} 16%, transparent)`
          : "var(--helm-inset)",
        boxShadow: active
          ? `inset 0 0 0 1px color-mix(in srgb, ${color} 55%, transparent), 0 0 14px -6px ${color}`
          : "inset 0 0 0 1px var(--helm-inset-edge)",
      }}
    >
      {children}
    </button>
  );
}

/** The big one: start engines, drop the hook. Reads as a physical switch. */
export function HelmActionButton({
  children,
  onClick,
  disabled,
  tone = "good",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "good" | "accent" | "danger";
  className?: string;
}) {
  const color = `var(--helm-${tone})`;

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={stopPointer}
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-lg px-4 py-3 text-[0.92rem] leading-none transition disabled:cursor-wait disabled:opacity-60 ${className}`}
      style={{
        fontFamily: "var(--helm-font-label)",
        fontWeight: 700,
        letterSpacing: "0.26em",
        textTransform: "uppercase",
        color,
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 26%, transparent), color-mix(in srgb, ${color} 10%, transparent))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.2), 0 0 26px -10px ${color}`,
      }}
    >
      {children}
    </button>
  );
}

export function HelmSelect({
  label,
  value,
  onChange,
  options,
  hint,
  className = "",
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {label ? (
        <span
          className="block text-[0.67rem] leading-none"
          style={{
            fontFamily: "var(--helm-font-label)",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--helm-label-dim)",
          }}
        >
          {label}
        </span>
      ) : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPointerDown={stopPointer}
        className="mt-1 w-full rounded-md px-2.5 py-2 text-[0.84rem] outline-none"
        style={{
          fontFamily: "var(--helm-font-body)",
          color: "var(--helm-text)",
          background: "var(--helm-well)",
          boxShadow:
            "inset 0 0 0 1px var(--helm-inset-edge), inset 0 1px 3px rgba(0,0,0,0.28)",
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} style={{ color: "#0b1116" }}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <span
          className="mt-1 block text-[0.72rem] leading-snug"
          style={{ color: "var(--helm-text-dim)", fontFamily: "var(--helm-font-body)" }}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/** Two-or-three-position rocker: TOP | FORWARD | AFT, TYPICAL | CALM. */
export function HelmSegmented<T extends string | number>({
  value,
  onChange,
  options,
  size = "sm",
  className = "",
  style,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  size?: "sm" | "md";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-md p-0.5 ${className}`}
      style={{
        background: "var(--helm-well)",
        boxShadow: "inset 0 0 0 1px var(--helm-inset-edge)",
        ...style,
      }}
    >
      {options.map((option) => (
        <HelmButton
          key={option.value}
          size={size}
          active={value === option.value}
          tone="accent"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </HelmButton>
      ))}
    </div>
  );
}
