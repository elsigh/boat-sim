/// <reference lib="webworker" />

import { parseGoogleTimeline } from "./google-timeline";
import type { ParsedTimeline } from "./types";

// Parsing a year of Timeline is a hundred megabytes of JSON and several
// seconds of tree walking. Off the main thread so the helm keeps rendering.

export type TimelineWorkerRequest = { text: string };

export type TimelineWorkerResponse =
  | { ok: true; result: ParsedTimeline }
  | { ok: false; error: string };

self.onmessage = (event: MessageEvent<TimelineWorkerRequest>) => {
  try {
    const result = parseGoogleTimeline(event.data.text);
    const response: TimelineWorkerResponse = { ok: true, result };
    self.postMessage(response);
  } catch (error) {
    const response: TimelineWorkerResponse = {
      ok: false,
      error: error instanceof Error ? error.message : "Could not read that file.",
    };
    self.postMessage(response);
  }
};
