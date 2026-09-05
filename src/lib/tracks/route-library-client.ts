"use client";

import { upload } from "@vercel/blob/client";
import { MAX_ROUTE_FILE_BYTES, routeMetadata, routePath, type RouteArchive, type RouteEntry } from "./saved-routes";

const ENDPOINT = "/api/route-library";
export type LibraryBackend = "cloud" | "device";

async function request(action: string, extra: Record<string, unknown> = {}) {
  const response = await fetch(ENDPOINT, {
    method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? "The route library is unavailable. Please try again.");
  }
  return response;
}

// A separate database preserves any original uploads from the earlier library.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("boat-sim-route-snapshots", 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("entries", { keyPath: "id" });
      open.result.createObjectStore("files");
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error("Could not open saved routes."));
    open.onblocked = () => reject(new Error("Close other boatsim windows and try again."));
  });
}

async function localOperation<T>(mode: IDBTransactionMode, run: (tx: IDBTransaction) => IDBRequest<T>) {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(["entries", "files"], mode);
      const operation = run(tx);
      tx.oncomplete = () => resolve(operation.result);
      tx.onabort = tx.onerror = () => reject(tx.error?.name === "ConstraintError"
        ? new Error("That name is already saved. Refresh the library to replace it.")
        : tx.error ?? new Error("Could not save routes on this device."));
    });
  } finally { db.close(); }
}

export async function openRouteLibrary(): Promise<{ backend: LibraryBackend; routes: RouteEntry[] }> {
  const device = async () => ({ backend: "device" as const,
    routes: await localOperation<RouteEntry[]>("readonly", (tx) => tx.objectStore("entries").getAll()) });
  if (process.env.NEXT_PUBLIC_STATIC_EXPORT === "1") return device();
  // Network failures remain errors: never silently switch to an empty library.
  const result = await (await request("list")).json();
  return result.backend === "device" ? device() : { backend: "cloud", routes: result.routes };
}

export async function saveRoute(backend: LibraryBackend, archive: RouteArchive, replace: boolean, onProgress?: (percentage: number) => void) {
  const file = new Blob([JSON.stringify(archive)], { type: "application/json" });
  if (file.size > MAX_ROUTE_FILE_BYTES) throw new Error("This route is too large. Select a shorter date range.");
  const metadata = routeMetadata(archive);
  if (backend === "device") {
    await localOperation("readwrite", (tx) => {
      const method = replace ? "put" : "add";
      tx.objectStore("files")[method](file, archive.id);
      return tx.objectStore("entries")[method](metadata);
    });
    return metadata;
  }
  try {
    await upload(routePath(archive.name), file, {
      access: "private", contentType: "application/json", handleUploadUrl: ENDPOINT,
      clientPayload: JSON.stringify({ name: archive.name, replace }), multipart: true,
      onUploadProgress: ({ percentage }) => onProgress?.(percentage),
    });
  } catch (error) {
    if (error instanceof Error && /already exists/i.test(error.message)) {
      throw new Error("That name is already saved. Refresh the library to replace it.");
    }
    throw error;
  }
  return metadata;
}

export async function loadRouteFile(backend: LibraryBackend, route: RouteEntry): Promise<File> {
  const blob: Blob | undefined = backend === "device"
    ? await localOperation("readonly", (tx) => tx.objectStore("files").get(route.id))
    : await (await request("file", { id: route.id })).blob();
  if (!blob) throw new Error("The saved route file could not be found.");
  return new File([blob], `${route.name}.json`, { type: "application/json" });
}

export async function removeRoute(backend: LibraryBackend, id: string) {
  if (backend === "cloud") { await request("delete", { id }); return; }
  await localOperation("readwrite", (tx) => {
    tx.objectStore("files").delete(id);
    return tx.objectStore("entries").delete(id);
  });
}
