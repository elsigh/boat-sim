"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import {
  simplifyTrack,
  trackDistanceMeters,
} from "@/lib/tracks/google-timeline";
import type { ImportedTrack, ParsedTimeline } from "@/lib/tracks/types";
import type { TimelineWorkerResponse } from "@/lib/tracks/timeline.worker";

import { parseRouteFile } from "@/lib/tracks/parse-route-file";
import { useRouteLibrary } from "./useRouteLibrary";
import { defaultDateRange, localInputToMs, MAX_ROUTE_FILE_BYTES, msToLocalInput, pointRange, type RouteEntry, type SavedRoute } from "@/lib/tracks/saved-routes";

// Parsing stays in a worker. Explicit saves capture unsimplified points within
// the current date range; subsequent filter edits do not change saved snapshots.

export type TimelineImportStatus =
  | { kind: "idle" }
  | { kind: "reading"; fileName: string }
  | { kind: "parsing"; fileName: string }
  | { kind: "ready"; fileName: string }
  | { kind: "error"; message: string };

export function useTimelineImport() {
  const [status, setStatus] = useState<TimelineImportStatus>({ kind: "idle" });
  const [parsed, setParsed] = useState<ParsedTimeline | null>(null);
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [visible, setVisible] = useState(true);
  const workerRef = useRef<Worker | null>(null);
  const sourceFileRef = useRef<File | null>(null);
  const generationRef = useRef(0);
  const [name, setName] = useState("");
  const [savedRoute, setSavedRoute] = useState<SavedRoute | null>(null);
  const library = useRouteLibrary();

  useEffect(() => () => {
    generationRef.current += 1;
    workerRef.current?.terminate();
  }, []);

  const reset = useCallback(() => {
    generationRef.current += 1;
    workerRef.current?.terminate();
    workerRef.current = null;
    sourceFileRef.current = null;
    setSavedRoute(null);
    setName("");
    setParsed(null);
    setStatus({ kind: "idle" });
    setFromInput("");
    setToInput("");
  }, []);

  const receive = useCallback((result: ParsedTimeline, file: File, restored?: SavedRoute) => {
    sourceFileRef.current = file;
    setParsed(result);
    setStatus({ kind: "ready", fileName: file.name });
    setSavedRoute(restored ?? null);
    setName(restored?.name ?? file.name.replace(/\.json$/i, ""));
    const range = defaultDateRange(result.points);
    setFromInput(restored ? (restored.filters.fromMs === null ? "" : msToLocalInput(restored.filters.fromMs)) : range.from);
    setToInput(restored ? (restored.filters.toMs === null ? "" : msToLocalInput(restored.filters.toMs)) : range.to);
    setVisible(restored?.filters.visible ?? true);
  }, []);

  const failWith = useCallback((error: unknown) => {
    setStatus({
      kind: "error",
      message: error instanceof Error ? error.message : "Could not read that file.",
    });
  }, []);

  const loadFile = useCallback(
    async (file: File, snapshot = false) => {
      const generation = ++generationRef.current;
      workerRef.current?.terminate();
      workerRef.current = null;
      setSavedRoute(null);
      sourceFileRef.current = null;
      if (file.size > MAX_ROUTE_FILE_BYTES) {
        setStatus({ kind: "error", message: "Choose a JSON file smaller than 200 MB." });
        setParsed(null);
        return;
      }
      setStatus({ kind: "reading", fileName: file.name });
      setParsed(null);

      let text: string;

      try {
        text = await file.text();
      } catch {
        if (generation !== generationRef.current) return;
        setStatus({ kind: "error", message: "Couldn't read that file off disk." });
        return;
      }

      if (generation !== generationRef.current) return;
      setStatus({ kind: "parsing", fileName: file.name });

      const parseHere = () => {
        try {
          const parsed = parseRouteFile(text, snapshot);
          receive(parsed.result, file, parsed.savedRoute);
        } catch (error) {
          failWith(error);
        }
      };

      // Try a worker; fall back to the main thread if the bundler or the
      // browser won't give us one.
      try {
        const worker = new Worker(
          new URL("../lib/tracks/timeline.worker.ts", import.meta.url),
          { type: "module" },
        );
        workerRef.current = worker;

        worker.onmessage = (event: MessageEvent<TimelineWorkerResponse>) => {
          if (generation !== generationRef.current) return;
          if (event.data.ok) {
            receive(event.data.result, file, event.data.savedRoute);
          } else {
            setStatus({ kind: "error", message: event.data.error });
          }

          worker.terminate();
          workerRef.current = null;
        };

        worker.onerror = () => {
          if (generation !== generationRef.current) return;
          worker.terminate();
          workerRef.current = null;
          parseHere();
        };

        worker.postMessage({ text, snapshot });
      } catch {
        parseHere();
      }
    },
    [failWith, receive],
  );

  const saveCurrent = useCallback(async (saveName: string, replace = false) => {
    const file = sourceFileRef.current;
    if (!file || !parsed || status.kind !== "ready") return false;
    const generation = generationRef.current;
    const saved = await library.save({
      sourceFileName: savedRoute?.sourceFileName ?? file.name,
      name: saveName, points: parsed.points, replace,
      filters: { fromMs: localInputToMs(fromInput) ?? null, toMs: localInputToMs(toInput) ?? null, visible },
    });
    if (saved && generation === generationRef.current) {
      setSavedRoute(saved);
      setName(saved.name);
    }
    return Boolean(saved);
  }, [library.save, parsed, status.kind, savedRoute, fromInput, toInput, visible]);

  const loadSaved = useCallback(async (route: RouteEntry) => {
    const generation = ++generationRef.current;
    workerRef.current?.terminate();
    workerRef.current = null;
    const file = await library.load(route);
    if (file && generation === generationRef.current) await loadFile(file, true);
  }, [library.load, loadFile]);

  const deleteSaved = useCallback(async (route: RouteEntry) => {
    if (await library.remove(route)) {
      setSavedRoute((current) => current?.id === route.id ? null : current);
      return true;
    }
    return false;
  }, [library.remove]);

  // Range changes redraw and simplify thousands of fixes. Keep those updates
  // lower priority than the controlled datetime inputs themselves.
  const deferredFromInput = useDeferredValue(fromInput);
  const deferredToInput = useDeferredValue(toInput);
  const fromMs = localInputToMs(deferredFromInput);
  const toMs = localInputToMs(deferredToInput);

  const track = useMemo<ImportedTrack | null>(() => {
    if (!parsed || parsed.points.length === 0) {
      return null;
    }

    const start = fromMs ?? Number.NEGATIVE_INFINITY;
    const end = toMs ?? Number.POSITIVE_INFINITY;
    const { first, last } = pointRange(parsed.points, start, end);
    const inRange = parsed.points.slice(first, last);

    if (inRange.length < 2) {
      return null;
    }

    const points = simplifyTrack(inRange);

    return {
      id: `timeline-${inRange[0].t}-${inRange[inRange.length - 1].t}`,
      name: "Timeline",
      source: "google-timeline",
      points,
      startMs: inRange[0].t,
      endMs: inRange[inRange.length - 1].t,
      distanceM: trackDistanceMeters(points),
    };
  }, [fromMs, parsed, toMs]);

  /** Everything the panel needs to say, without recomputing it there. */
  const summary = useMemo(() => {
    if (!parsed) {
      return null;
    }

    const range = pointRange(parsed.points, localInputToMs(fromInput), localInputToMs(toInput));
    const matched = range.last - range.first;
    return {
      totalPoints: parsed.points.length,
      skipped: parsed.skipped,
      shapes: parsed.shapes,
      firstMs: parsed.points[0]?.t,
      lastMs: parsed.points[parsed.points.length - 1]?.t,
      matched,
      distanceM: track?.distanceM ?? 0,
      emptyRange: parsed.points.length > 0 && matched === 0,
    };
  }, [parsed, track, fromInput, toInput]);

  return {
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
  };
}
