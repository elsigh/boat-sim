"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  parseGoogleTimeline,
  simplifyTrack,
  trackDistanceMeters,
} from "@/lib/tracks/google-timeline";
import type { ImportedTrack, ParsedTimeline, TrackPoint } from "@/lib/tracks/types";
import type { TimelineWorkerResponse } from "@/lib/tracks/timeline.worker";

// Everything here stays on the machine: the file is read with the File API,
// parsed in a worker, and never leaves the browser.

export type TimelineImportStatus =
  | { kind: "idle" }
  | { kind: "reading"; fileName: string }
  | { kind: "parsing"; fileName: string }
  | { kind: "ready"; fileName: string }
  | { kind: "error"; message: string };

/** `datetime-local` gives "2026-08-16T09:30" in the browser's own timezone. */
function localInputToMs(value: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
}

function msToLocalInput(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function useTimelineImport() {
  const [status, setStatus] = useState<TimelineImportStatus>({ kind: "idle" });
  const [parsed, setParsed] = useState<ParsedTimeline | null>(null);
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [visible, setVisible] = useState(true);
  const workerRef = useRef<Worker | null>(null);

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setParsed(null);
    setStatus({ kind: "idle" });
    setFromInput("");
    setToInput("");
  }, []);

  const receive = useCallback((result: ParsedTimeline, fileName: string) => {
    setParsed(result);
    setStatus({ kind: "ready", fileName });

    // Default the range to the whole export, so the first render shows
    // something rather than an empty overlay.
    if (result.points.length > 0) {
      setFromInput(msToLocalInput(result.points[0].t));
      setToInput(msToLocalInput(result.points[result.points.length - 1].t));
    }
  }, []);

  const failWith = useCallback((error: unknown) => {
    setStatus({
      kind: "error",
      message: error instanceof Error ? error.message : "Could not read that file.",
    });
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      setStatus({ kind: "reading", fileName: file.name });
      setParsed(null);

      let text: string;

      try {
        text = await file.text();
      } catch {
        setStatus({ kind: "error", message: "Couldn't read that file off disk." });
        return;
      }

      setStatus({ kind: "parsing", fileName: file.name });

      const parseHere = () => {
        try {
          receive(parseGoogleTimeline(text), file.name);
        } catch (error) {
          failWith(error);
        }
      };

      // Try a worker; fall back to the main thread if the bundler or the
      // browser won't give us one.
      try {
        workerRef.current?.terminate();
        const worker = new Worker(
          new URL("../lib/tracks/timeline.worker.ts", import.meta.url),
          { type: "module" },
        );
        workerRef.current = worker;

        worker.onmessage = (event: MessageEvent<TimelineWorkerResponse>) => {
          if (event.data.ok) {
            receive(event.data.result, file.name);
          } else {
            setStatus({ kind: "error", message: event.data.error });
          }

          worker.terminate();
          workerRef.current = null;
        };

        worker.onerror = () => {
          worker.terminate();
          workerRef.current = null;
          parseHere();
        };

        worker.postMessage({ text });
      } catch {
        parseHere();
      }
    },
    [failWith, receive],
  );

  const fromMs = localInputToMs(fromInput);
  const toMs = localInputToMs(toInput);

  const track = useMemo<ImportedTrack | null>(() => {
    if (!parsed || parsed.points.length === 0) {
      return null;
    }

    const start = fromMs ?? Number.NEGATIVE_INFINITY;
    const end = toMs ?? Number.POSITIVE_INFINITY;
    const inRange: TrackPoint[] = parsed.points.filter(
      (point) => point.t >= start && point.t <= end,
    );

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

    return {
      totalPoints: parsed.points.length,
      skipped: parsed.skipped,
      shapes: parsed.shapes,
      firstMs: parsed.points[0]?.t,
      lastMs: parsed.points[parsed.points.length - 1]?.t,
      matched: track?.points.length ?? 0,
      distanceM: track?.distanceM ?? 0,
      emptyRange: parsed.points.length > 0 && track === null,
    };
  }, [parsed, track]);

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
  };
}
