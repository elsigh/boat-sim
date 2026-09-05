/// <reference lib="webworker" />

import { parseRouteFile } from "./parse-route-file";
import type { SavedRoute } from "./saved-routes";
import type { ParsedTimeline } from "./types";

// Parsing a year of Timeline is a hundred megabytes of JSON and several
// seconds of tree walking. Off the main thread so the helm keeps rendering.

export type TimelineWorkerRequest = { text: string; snapshot?: boolean };

export type TimelineWorkerResponse =
  | { ok: true; result: ParsedTimeline; savedRoute?: SavedRoute }
  | { ok: false; error: string };

self.onmessage = (event: MessageEvent<TimelineWorkerRequest>) => {
  try {
    const parsed = parseRouteFile(event.data.text, event.data.snapshot ?? false);
    const response: TimelineWorkerResponse = { ok: true, ...parsed };
    self.postMessage(response);
  } catch (error) {
    const response: TimelineWorkerResponse = {
      ok: false,
      error: error instanceof Error ? error.message : "Could not read that file.",
    };
    self.postMessage(response);
  }
};
