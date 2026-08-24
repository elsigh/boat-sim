"use client";

import { useRef, useState } from "react";

import type { useTimelineImport } from "@/hooks/useTimelineImport";

import { HelmButton } from "./Controls";
import { PanelLabel, Well } from "./Panel";

// The import drawer, which lives inside the expanded plotter — the one place
// you'd actually be looking at a recorded track.

type Props = {
  timeline: ReturnType<typeof useTimelineImport>;
  onFit: () => void;
  canFit: boolean;
  onClose: () => void;
};

const METRES_PER_NM = 1852;

function formatSpan(fromMs: number | undefined, toMs: number | undefined) {
  if (fromMs === undefined || toMs === undefined) {
    return "—";
  }

  const from = new Date(fromMs);
  const to = new Date(toMs);
  const sameDay = from.toDateString() === to.toDateString();
  const date = from.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = (value: Date) =>
    value.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return sameDay
    ? `${date} ${time(from)} – ${time(to)}`
    : `${date} ${time(from)} – ${to.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time(to)}`;
}

export function TimelineImportPanel({ timeline, onFit, canFit, onClose }: Props) {
  const {
    status,
    summary,
    track,
    visible,
    setVisible,
    fromInput,
    setFromInput,
    toInput,
    setToInput,
    loadFile,
    reset,
  } = timeline;

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const busy = status.kind === "reading" || status.kind === "parsing";

  return (
    <div
      className="absolute left-3 top-3 z-20 w-[19rem] max-w-[calc(100%-1.5rem)] rounded-md p-3"
      style={{
        background: "var(--helm-face)",
        boxShadow:
          "inset 0 0 0 1px var(--helm-edge), 0 18px 38px -18px rgba(0,0,0,0.85)",
        // The native datetime picker follows the colour scheme of an ancestor,
        // not of the input itself.
        colorScheme: "dark",
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <PanelLabel>Timeline import</PanelLabel>
        <HelmButton size="sm" onClick={onClose} ariaLabel="Close timeline import">
          ✕
        </HelmButton>
      </div>

      <p className="mt-1.5 text-[0.62rem] leading-snug" style={{ color: "var(--helm-text-dim)" }}>
        Your Google Maps Timeline export, drawn as the path actually taken.
        Everything stays on this machine.
      </p>

      {/* --- file --------------------------------------------------------- */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files?.[0];

          if (file) {
            void loadFile(file);
          }
        }}
        className="mt-2.5 w-full rounded-md px-3 py-3 text-center transition"
        style={{
          background: dragOver ? "var(--helm-accent-soft)" : "var(--helm-well)",
          boxShadow: `inset 0 0 0 1px ${dragOver ? "var(--helm-accent)" : "var(--helm-inset-edge)"}`,
        }}
      >
        <span
          className="block text-[0.62rem] leading-none"
          style={{
            fontFamily: "var(--helm-font-label)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--helm-label)",
          }}
        >
          {status.kind === "idle" || status.kind === "error"
            ? "Choose Timeline.json"
            : status.kind === "ready"
              ? status.fileName
              : `${status.kind}…`}
        </span>
        <span
          className="mt-1 block text-[0.55rem]"
          style={{ color: "var(--helm-text-dim)" }}
        >
          or drop it here
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (file) {
            void loadFile(file);
          }

          // Let the same file be picked twice after a reset.
          event.target.value = "";
        }}
      />

      {/* --- status ------------------------------------------------------- */}
      {busy ? (
        <p
          className="mt-2 animate-pulse text-[0.62rem]"
          style={{ color: "var(--helm-accent)" }}
        >
          Reading {"fileName" in status ? status.fileName : "file"}…
        </p>
      ) : null}

      {status.kind === "error" ? (
        <p className="mt-2 text-[0.62rem] leading-snug" style={{ color: "var(--helm-danger)" }}>
          {status.message}
        </p>
      ) : null}

      {summary && status.kind === "ready" ? (
        <>
          {summary.totalPoints === 0 ? (
            <p
              className="mt-2 text-[0.62rem] leading-snug"
              style={{ color: "var(--helm-warn)" }}
            >
              No location points in that file. If it came from Takeout, try the
              on-device export instead (Google Maps ▸ Settings ▸ Location ▸ Timeline).
            </p>
          ) : (
            <Well className="mt-2 px-2.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <PanelLabel dim className="!text-[0.5rem]">
                  In file
                </PanelLabel>
                <span
                  className="text-[0.66rem]"
                  style={{ fontFamily: "var(--helm-font-readout)", color: "var(--helm-text)" }}
                >
                  {summary.totalPoints.toLocaleString()} pts
                </span>
              </div>
              <p className="mt-1 text-[0.58rem]" style={{ color: "var(--helm-text-dim)" }}>
                {formatSpan(summary.firstMs, summary.lastMs)}
              </p>
              {summary.skipped > 0 ? (
                <p className="mt-1 text-[0.55rem]" style={{ color: "var(--helm-text-dim)" }}>
                  {summary.skipped.toLocaleString()} skipped (no fix, no time, or too vague)
                </p>
              ) : null}
            </Well>
          )}
        </>
      ) : null}

      {/* --- range -------------------------------------------------------- */}
      {summary && summary.totalPoints > 0 ? (
        <>
          <div className="mt-2.5 grid grid-cols-1 gap-2">
            {(
              [
                ["From", fromInput, setFromInput],
                ["To", toInput, setToInput],
              ] as const
            ).map(([label, value, setValue]) => (
              <label key={label} className="block">
                <span
                  className="block text-[0.55rem] leading-none"
                  style={{
                    fontFamily: "var(--helm-font-label)",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: "var(--helm-label-dim)",
                  }}
                >
                  {label}
                </span>
                <input
                  type="datetime-local"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className="mt-1 w-full rounded-md px-2 py-1.5 text-[0.7rem] outline-none"
                  style={{
                    fontFamily: "var(--helm-font-body)",
                    color: "var(--helm-text)",
                    background: "var(--helm-well)",
                    boxShadow:
                      "inset 0 0 0 1px var(--helm-inset-edge), inset 0 1px 3px rgba(0,0,0,0.28)",
                    colorScheme: "dark",
                  }}
                />
              </label>
            ))}
          </div>

          <p className="mt-1 text-[0.55rem]" style={{ color: "var(--helm-text-dim)" }}>
            Times are your computer&apos;s local timezone.
          </p>

          {summary.emptyRange ? (
            <p
              className="mt-2 text-[0.62rem] leading-snug"
              style={{ color: "var(--helm-warn)" }}
            >
              No location points found in that range.
            </p>
          ) : null}

          {track ? (
            <Well className="mt-2 px-2.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <PanelLabel dim className="!text-[0.5rem]">
                  Selected
                </PanelLabel>
                <span
                  className="text-[0.66rem]"
                  style={{ fontFamily: "var(--helm-font-readout)", color: "var(--helm-readout)" }}
                >
                  {track.points.length.toLocaleString()} pts ·{" "}
                  {(track.distanceM / METRES_PER_NM).toFixed(1)} nm
                </span>
              </div>
              <p className="mt-1 text-[0.58rem]" style={{ color: "var(--helm-text-dim)" }}>
                {formatSpan(track.startMs, track.endMs)}
              </p>
            </Well>
          ) : null}

          {/* --- controls -------------------------------------------------- */}
          <label className="mt-2.5 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={visible}
              onChange={(event) => setVisible(event.target.checked)}
              className="h-3.5 w-3.5 accent-current"
              style={{ color: "var(--helm-accent)" }}
            />
            <span
              className="text-[0.6rem] leading-none"
              style={{
                fontFamily: "var(--helm-font-label)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--helm-text)",
              }}
            >
              Show actual track
            </span>
          </label>

          <div className="mt-2.5 flex items-center gap-2">
            <HelmButton size="sm" tone="accent" onClick={onFit} disabled={!canFit}>
              Fit track
            </HelmButton>
            <HelmButton size="sm" tone="danger" onClick={reset}>
              Clear
            </HelmButton>
          </div>
        </>
      ) : null}
    </div>
  );
}
