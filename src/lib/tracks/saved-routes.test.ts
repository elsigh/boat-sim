import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { authorizeUpload } from "./route-library-server";
import { parseRouteFile } from "./parse-route-file";
import { createRouteArchive, defaultDateRange, localInputToMs, nameFromRoutePath, pointRange, routeName, routePath, validateRouteArchive } from "./saved-routes";

const start = Date.parse("2026-08-16T09:00:00-07:00");
const points = Array.from({ length: 120 }, (_, index) => ({
  lat: 48.75 + index * 0.0001, lon: -122.5, t: start + index * 60_000, accuracyM: 8,
}));
const input = {
  name: "San Juan cruise", sourceFileName: "Timeline.json", points,
  filters: { fromMs: start + 15 * 60_000, toMs: start + 90 * 60_000, visible: false },
};

describe("named date-filtered snapshots", () => {
  test("saves all 76 original fixes, includes both bounds, excludes other data", () => {
    const source = { ...input, points: points.map((p) => ({ ...p, unrelated: "discard" })), fullExport: "discard" };
    const archive = createRouteArchive(source);
    assert.equal(archive.pointCount, 76);
    assert.deepEqual(archive.points, points.slice(15, 91));
    assert.equal(archive.id, input.name);
    assert.deepEqual(archive.filters, input.filters);
    assert.ok(!JSON.stringify(archive).includes("discard"));
    assert.equal(points.length, 120);
  });
  test("worker parser reloads timestamps, points and metadata from the archive", () => {
    const archive = createRouteArchive(input);
    const { result, savedRoute } = parseRouteFile(JSON.stringify(archive), true);
    assert.deepEqual(result.points, points.slice(15, 91));
    assert.deepEqual(savedRoute?.filters, input.filters);
    assert.equal(savedRoute?.name, input.name);
    assert.equal(result.skipped, 0);
  });
  test("cleared filters include all points; one-point ranges remain valid", () => {
    const full = createRouteArchive({ ...input, filters: { fromMs: null, toMs: null, visible: true } });
    assert.deepEqual(full.points, points);
    const single = createRouteArchive({ ...input, filters: { fromMs: start, toMs: start, visible: true } });
    assert.deepEqual(single.points, [points[0]]);
    assert.deepEqual(pointRange(points, start + 1, start + 2), { first: 1, last: 1 });
  });
  test("rejects reversed or empty date ranges", () => {
    assert.throws(() => createRouteArchive({ ...input, filters: { ...input.filters, toMs: start } }));
    assert.throws(() => createRouteArchive({ ...input, filters: { ...input.filters, fromMs: 0, toMs: 1 } }));
  });
  test("rejects malformed, unsorted and out-of-range archived points", () => {
    const archive = createRouteArchive(input);
    for (const invalid of [
      { version: 1 }, { pointCount: 120 }, { id: "some other name" },
      { points: [...archive.points].reverse() },
      { points: [{ ...archive.points[0], t: start }, ...archive.points.slice(1)] },
      { points: [{ ...archive.points[0], lat: 100 }, ...archive.points.slice(1)] },
      { filters: { ...archive.filters, fromMs: "2026-08-16" } },
    ]) assert.throws(() => validateRouteArchive({ ...archive, ...invalid }));
  });
  test("the initial date range includes the last fix's seconds", () => {
    const t = start + 45_000;
    const range = defaultDateRange([{ lat: 48.7, lon: -122.5, t }]);
    assert.ok(localInputToMs(range.from)! <= t);
    assert.ok(localInputToMs(range.to)! >= t);
  });
});

describe("name-based storage keys", () => {
  test("normalizes names and reversibly encodes punctuation and Unicode", () => {
    for (const name of ["San Juan cruise", "Café ⚓", "A & B #1", "a%2fb", ".. cruise"]) {
      assert.equal(nameFromRoutePath(routePath(name)), name);
    }
    assert.equal(routePath(" Café "), routePath("Cafe\u0301"));
    assert.equal(routeName("  San Juan cruise  "), "San Juan cruise");
    assert.notEqual(routePath("A B"), routePath("A-B"));
    assert.notEqual(routePath("Cruise"), routePath("cruise"));
  });
  test("tokens are bound to the named path; replacement must be explicit", () => {
    const path = routePath(input.name);
    assert.deepEqual(authorizeUpload(path, JSON.stringify({ name: input.name, replace: false })), { allowOverwrite: false });
    assert.deepEqual(authorizeUpload(path, JSON.stringify({ name: input.name, replace: true })), { allowOverwrite: true });
    assert.throws(() => authorizeUpload(path, JSON.stringify({ name: "different", replace: true })));
    assert.throws(() => authorizeUpload(path, JSON.stringify({ name: input.name })));
    assert.throws(() => authorizeUpload(path, null));
  });
  test("cannot access traversal paths, old uploads or other Blob files", () => {
    for (const name of ["", " ", "../file", "a/b", "a\\b", "..", ".", "a\nb", "x".repeat(81)]) {
      assert.throws(() => routePath(name));
    }
    for (const path of ["route-libraries/old/files/a.json", "saved-routes/v2/../a.json", "saved-routes/v2/%2F.json", "other/a.json"]) {
      assert.throws(() => nameFromRoutePath(path));
      assert.throws(() => authorizeUpload(path, JSON.stringify({ name: "a", replace: true })));
    }
  });
});
