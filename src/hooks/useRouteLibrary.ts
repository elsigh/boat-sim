"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadRouteFile, openRouteLibrary, removeRoute, saveRoute, type LibraryBackend } from "@/lib/tracks/route-library-client";
import type { TrackPoint } from "@/lib/tracks/types";
import { createRouteArchive, type RouteFilters, type RouteEntry, type SavedRoute } from "@/lib/tracks/saved-routes";

export function useRouteLibrary() {
  const [backend, setBackend] = useState<LibraryBackend | null>(null);
  const [routes, setRoutes] = useState<RouteEntry[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const operationRef = useRef(false);

  const refresh = useCallback(async () => {
    if (operationRef.current) return;
    operationRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await openRouteLibrary();
      setBackend(result.backend);
      setRoutes(result.routes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not open saved routes.");
    } finally { operationRef.current = false; setBusy(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const remember = useCallback((saved: SavedRoute) => {
    setRoutes((current) => [saved, ...current.filter((route) => route.id !== saved.id)]);
  }, []);

  const save = useCallback(async (input: {
    sourceFileName: string; name: string; points: TrackPoint[]; filters: RouteFilters; replace: boolean;
  }): Promise<SavedRoute | null> => {
    if (!backend || operationRef.current) return null;
    operationRef.current = true;
    setBusy(true); setError(""); setMessage("Saving…");
    try {
      const archive = createRouteArchive(input);
      const saved = await saveRoute(backend, archive, input.replace, (percent) => {
        setMessage(`Uploading… ${Math.round(percent)}%`);
      });
      remember(saved);
      setMessage(backend === "cloud" ? "Saved to cloud" : "Saved on this device");
      return saved;
    } catch (error) {
      setMessage("");
      setError(error instanceof Error ? error.message : "Could not save this route.");
      return null;
    } finally { operationRef.current = false; setBusy(false); }
  }, [backend, remember]);

  const load = useCallback(async (route: RouteEntry) => {
    if (!backend || operationRef.current) return null;
    operationRef.current = true; setBusy(true); setError(""); setMessage("Loading saved route…");
    try {
      const file = await loadRouteFile(backend, route);
      setMessage("");
      return file;
    } catch (error) {
      setMessage(""); setError(error instanceof Error ? error.message : "Could not load this route.");
      return null;
    } finally { operationRef.current = false; setBusy(false); }
  }, [backend]);

  const remove = useCallback(async (route: RouteEntry) => {
    if (!backend || operationRef.current) return false;
    operationRef.current = true; setBusy(true); setError("");
    try {
      await removeRoute(backend, route.id);
      setRoutes((current) => current.filter((entry) => entry.id !== route.id));
      setMessage("Saved route deleted");
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not delete this route.");
      return false;
    } finally { operationRef.current = false; setBusy(false); }
  }, [backend]);

  return { backend, routes, busy, message, error, refresh, save, load, remove };
}
