"use client";

import { memo, useEffect, useRef, useState } from "react";

import { routeName } from "@/lib/tracks/saved-routes";
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
const RANGE_COMMIT_DELAY_MS = 220;

const TimelineDateTimeField = memo(function TimelineDateTimeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const commit = (nextValue: string) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    onCommit(nextValue);
  };

  return (
    <label className="block">
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
      <input
        type="datetime-local"
        value={draft}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraft(nextValue);

          if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
          }

          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            onCommit(nextValue);
          }, RANGE_COMMIT_DELAY_MS);
        }}
        onBlur={() => commit(draft)}
        className="mt-1 w-full rounded-md px-2 py-1.5 text-[0.82rem] outline-none"
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
  );
});

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
    name, savedRoute, library, saveCurrent, loadSaved, deleteSaved,
  } = timeline;

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedSave, setSelectedSave] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLDivElement>(null);
  const importing = status.kind === "reading" || status.kind === "parsing";
  const busy = importing || library.busy;
  const selectedRoute = library.routes.find((route) => route.id === selectedSave);

  let normalizedName = "";
  let nameError = "";
  try { normalizedName = routeName(draftName); }
  catch (error) { if (draftName) nameError = (error as Error).message; }
  const replacing = library.routes.some((route) => route.id === normalizedName);
  const canSave = !busy && Boolean(library.backend && normalizedName && summary?.matched);
  const submitSave = async () => {
    if (canSave && await saveCurrent(normalizedName, replacing)) {
      setNaming(false);
      saveButtonRef.current?.querySelector("button")?.focus();
    }
  };

  useEffect(() => {
    if (naming) {
      nameRef.current?.focus();
      nameRef.current?.select();
      nameRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [naming]);

  useEffect(() => {
    if (status.kind !== "ready") setNaming(false);
  }, [status.kind]);

  useEffect(() => {
    if (savedRoute) setSelectedSave(savedRoute.id);
  }, [savedRoute]);

  return (
    <div
      data-plotter-overlay
      className="absolute left-3 top-3 z-20 max-h-[calc(100%-1.5rem)] w-[19rem] max-w-[calc(100%-1.5rem)] overflow-y-auto overscroll-contain rounded-md p-3"
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
        <PanelLabel>Route library</PanelLabel>
        <HelmButton size="sm" onClick={onClose} ariaLabel="Close timeline import">
          ✕
        </HelmButton>
      </div>

      <p className="mt-1.5 text-[0.74rem] leading-snug" style={{ color: "var(--helm-text-dim)" }}>
        Import a Timeline file or load a saved route.
      </p>

      <Well className="mt-2.5 px-2.5 py-2">
        <label className="block text-[0.72rem]" style={{ color: "var(--helm-text)" }}>
          Saved routes
          <select
            value={selectedSave}
            disabled={busy}
            onChange={(event) => { setSelectedSave(event.target.value); setConfirmDelete(false); }}
            className="mt-1 w-full rounded-md px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-current"
            style={{ background: "var(--helm-inset)", color: "var(--helm-text)" }}
          >
            <option value="">{library.routes.length ? "Choose a saved route" : "No saved routes yet"}</option>
            {library.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}
          </select>
        </label>
        <div className="mt-2 flex gap-2">
          <HelmButton size="sm" disabled={!selectedRoute || busy} onClick={() => selectedRoute && void loadSaved(selectedRoute)}>Load</HelmButton>
          <HelmButton size="sm" disabled={busy} onClick={() => void library.refresh()}>Refresh</HelmButton>
          <HelmButton size="sm" tone="danger" disabled={!selectedRoute || busy} onClick={() => setConfirmDelete(true)}>Delete</HelmButton>
        </div>
        {confirmDelete && selectedRoute ? (
          <div className="mt-2 text-[0.72rem]" style={{ color: "var(--helm-text)" }}>
            Delete “{selectedRoute.name}” from saved routes?
            <div className="mt-2 flex gap-2">
              <HelmButton size="sm" tone="danger" disabled={busy} onClick={async () => {
                if (await deleteSaved(selectedRoute)) { setConfirmDelete(false); setSelectedSave(""); }
              }}>Delete saved route</HelmButton>
              <HelmButton size="sm" onClick={() => setConfirmDelete(false)}>Cancel</HelmButton>
            </div>
          </div>
        ) : null}
        <p className="mt-1.5 text-[0.67rem] leading-snug" style={{ color: "var(--helm-text-dim)" }}>
          {library.backend === "cloud"
            ? "Shared cloud library · any browser."
            : library.backend === "device" ? "Stored in this browser. Clearing site data removes these saves." : "Connecting to saved routes…"}
        </p>
      </Well>

      {library.error ? <p role="alert" className="mt-2 text-[0.74rem]" style={{ color: "var(--helm-danger)" }}>{library.error}</p> : null}
      <p role="status" className="mt-1 text-[0.7rem]" style={{ color: "var(--helm-text-dim)" }}>
        {library.message}
      </p>

      {/* --- file --------------------------------------------------------- */}
      <button
        type="button"
        disabled={busy}
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

          if (file && !busy) {
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
          className="block text-[0.74rem] leading-none"
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
          className="mt-1 block text-[0.67rem]"
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
      {importing ? (
        <p
          className="mt-2 animate-pulse text-[0.74rem]"
          style={{ color: "var(--helm-accent)" }}
        >
          Reading {"fileName" in status ? status.fileName : "file"}…
        </p>
      ) : null}

      {status.kind === "error" ? (
        <p className="mt-2 text-[0.74rem] leading-snug" style={{ color: "var(--helm-danger)" }}>
          {status.message}
        </p>
      ) : null}

      {summary && status.kind === "ready" ? (
        <>
          {summary.totalPoints === 0 ? (
            <p
              className="mt-2 text-[0.74rem] leading-snug"
              style={{ color: "var(--helm-warn)" }}
            >
              No location points in that file. If it came from Takeout, try the
              on-device export instead (Google Maps ▸ Settings ▸ Location ▸ Timeline).
            </p>
          ) : (
            <Well className="mt-2 px-2.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <PanelLabel dim className="!text-[0.62rem]">
                  In file
                </PanelLabel>
                <span
                  className="text-[0.78rem]"
                  style={{ fontFamily: "var(--helm-font-readout)", color: "var(--helm-text)" }}
                >
                  {summary.totalPoints.toLocaleString()} pts
                </span>
              </div>
              <p className="mt-1 text-[0.7rem]" style={{ color: "var(--helm-text-dim)" }}>
                {formatSpan(summary.firstMs, summary.lastMs)}
              </p>
              {summary.skipped > 0 ? (
                <p className="mt-1 text-[0.67rem]" style={{ color: "var(--helm-text-dim)" }}>
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
            <TimelineDateTimeField label="From" value={fromInput} onCommit={setFromInput} />
            <TimelineDateTimeField label="To" value={toInput} onCommit={setToInput} />
          </div>

          <p className="mt-1 text-[0.67rem]" style={{ color: "var(--helm-text-dim)" }}>
            Times are your computer&apos;s local timezone.
          </p>

          {summary.emptyRange ? (
            <p
              className="mt-2 text-[0.74rem] leading-snug"
              style={{ color: "var(--helm-warn)" }}
            >
              No location points found in that range.
            </p>
          ) : null}

          {track ? (
            <Well className="mt-2 px-2.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <PanelLabel dim className="!text-[0.62rem]">
                  Selected
                </PanelLabel>
                <span
                  className="text-[0.78rem]"
                  style={{ fontFamily: "var(--helm-font-readout)", color: "var(--helm-readout)" }}
                >
                  {summary.matched.toLocaleString()} pts ·{" "}
                  {(track.distanceM / METRES_PER_NM).toFixed(1)} nm
                </span>
              </div>
              <p className="mt-1 text-[0.7rem]" style={{ color: "var(--helm-text-dim)" }}>
                {formatSpan(track.startMs, track.endMs)}
              </p>
            </Well>
          ) : null}

          <div ref={saveButtonRef} className="mt-2.5">
            {!naming ? (
              <HelmButton size="sm" tone="accent" disabled={busy || !library.backend || !summary.matched}
                onClick={() => { setDraftName(name.slice(0, 80)); setNaming(true); }}>
                Save route
              </HelmButton>
            ) : (
              <form className="rounded-md p-2.5" style={{ background: "var(--helm-well)" }}
                onSubmit={(event) => { event.preventDefault(); void submitSave(); }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Escape" && !busy) {
                    setNaming(false);
                    saveButtonRef.current?.querySelector("button")?.focus();
                  }
                }}>
                <label className="block text-[0.72rem]" style={{ color: "var(--helm-text)" }}>
                  Name
                  <input ref={nameRef} type="text" value={draftName} maxLength={80} disabled={busy}
                    onChange={(event) => setDraftName(event.target.value)}
                    className="mt-1 w-full rounded-md px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-current"
                    style={{ background: "var(--helm-inset)", color: "var(--helm-text)" }}
                    placeholder="San Juan cruise" />
                </label>
                <p className="mt-2 text-[0.7rem] leading-snug" style={{ color: "var(--helm-text-dim)" }}>
                  Saves {summary.matched.toLocaleString()} points within the selected dates, with the date filters.
                </p>
                {nameError ? <p role="alert" className="mt-2 text-[0.7rem]" style={{ color: "var(--helm-danger)" }}>{nameError}</p> : null}
                {replacing ? <p className="mt-2 text-[0.7rem]" style={{ color: "var(--helm-warn)" }}>
                  “{normalizedName}” already exists. Saving will replace that route.
                </p> : null}
                <div className="mt-2 flex gap-2">
                  <HelmButton size="sm" tone="accent" disabled={!canSave} onClick={() => void submitSave()}>
                    {replacing ? "Replace saved route" : "Save"}
                  </HelmButton>
                  <HelmButton size="sm" disabled={busy} onClick={() => setNaming(false)}>Cancel</HelmButton>
                </div>
              </form>
            )}
            <p className="mt-1.5 text-[0.67rem] leading-snug" style={{ color: "var(--helm-text-dim)" }}>
              {savedRoute ? "Save again to keep filter changes. Only the selected dates are stored." : "Only points within the selected dates are saved."}
            </p>
          </div>

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
              className="text-[0.72rem] leading-none"
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
            <HelmButton size="sm" disabled={library.busy} onClick={reset}>
              Unload
            </HelmButton>
          </div>
        </>
      ) : null}
    </div>
  );
}
