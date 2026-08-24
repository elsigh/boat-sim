# Autonoma SDK integration — implementation checklist

Tracking file for the Autonoma Environment Factory integration on the
`autonoma-integration` branch. Items are checked only once actually run and
verified, not once written.

SDK endpoint path: /api/autonoma

## Entities from the entity audit (`.autonoma/boat-sim/entity-audit.md`)

- [x] **BoatProfile** — root. Created through `buildBoatProfile` in
      `src/lib/boats/catalog.ts` (the module that owns `BOAT_CATALOG`), so a
      seeded profile gets the same derived stats and defaults a shipped one does.
- [x] **MarinaLayout** — root. Created through `buildMarinaLayout` in
      `src/lib/marinas/index.ts`, which runs the layout through the same
      `mirrorLayout` side effect `MARINA_LAYOUTS` uses.
- [x] **Berth** — dependent, owned by MarinaLayout via `mirrorLayout`. Created
      through `addMarinaBerth` (mirrors the berth and maps it into the layout).
- [x] **SpawnPoint** — dependent, owned by MarinaLayout via `mirrorLayout`.
      Created through `addMarinaSpawn` (mirrors the spawn and maps it into the
      layout).
- [x] **ImpactIncident** — root. Created through `ImpactTracker.register` in
      `src/lib/sim/collision-damage.ts`, the app's real incident path
      (severity, hull damage, hull location and description are all derived by
      the app, not supplied by the recipe).

## Integration surface

- [x] One endpoint, `POST /api/autonoma`, via `@autonoma-ai/server-web`'s
      `createHandler`.
- [x] HMAC `x-signature` verified against the provisioned
      `AUTONOMA_SHARED_SECRET` environment value (never hardcoded).
- [x] Teardown for every factory, scoped to the test run. Each factory removes
      only its own record and then prunes the run's scope when it empties;
      nothing outside a test run's scope is ever touched.
- [x] Auth callback returning real, usable credentials (no placeholder token) —
      an entry path pointed at a boat this run created.
- [x] Maintenance note appended to `AGENTS.md`.

## Validation

- [x] Per-entity `sdk up` → inspect → `sdk down` → confirm gone, in dependency
      order (BoatProfile → MarinaLayout → Berth → SpawnPoint → ImpactIncident).
- [x] Full-recipe `sdk up` / `sdk down` pass — 3 boats, 2 marinas, 6 berths,
      6 spawns, 10 incidents up; all read paths empty after down.
- [x] Wrong signature rejected (401 `INVALID_SIGNATURE`); missing signature the
      same; forged refs token 403 `INVALID_REFS_TOKEN`; a replayed `down` is a
      no-op rather than an error.
- [x] `up` response auth payload carries real credentials.
- [x] `sdk check --recipe .autonoma/boat-sim/recipe.json` prints `"ok": true`.
- [x] `sdk up --repeat 3` concurrency proof passes — three runs live at once,
      distinct short ids, 27 records each, all three torn down clean.

## Ship

- [x] Branch `autonoma-integration` committed and pushed.
- [x] Pull request opened against `main`.

## Notes

### Inspecting seeded data

The simulator has no database — boats and marinas are static TypeScript modules
and incidents live in an in-memory `ImpactTracker`. Seeded records therefore go
into a `globalThis`-backed store (`src/lib/autonoma/store.ts`), and
`GET /api/autonoma/seeded` reads it through the same accessors the pages use.
That route is the equivalent of a `SELECT` for verifying `up` and `down`, and it
404s unless `AUTONOMA_SHARED_SECRET` is set.

### Static export

The Electron shell builds with `NEXT_OUTPUT=export`, and a static export only
supports `GET` route handlers. Both Autonoma routes are named `route.node.ts`,
and `next.config.ts` only lists `node.ts` in `pageExtensions` off the export
path — so they mount for the server build and are absent from the offline
bundle. The public path is still `/api/autonoma`.

### Uniqueness rules (enumerated before writing the recipe)

- `BoatProfile.profileSlug` — unique across the catalog; it keys
  `getBoatProfile`/`findBoatProfile`, the `/boats/[slug]` route and
  `generateStaticParams`. **Tokenized** with `{{testRunShortId}}`.
- `MarinaLayout.id` — unique key in `layoutById`/`getMarinaLayout`.
  **Tokenized**.
- `Berth.id` — unique only within its own layout, which is already tokenized;
  left concrete and readable.
- `SpawnPoint.id` — same as Berth.
- `ImpactIncident.id` — assigned by the tracker. The recipe passes
  `objectIndex` so each incident hits a distinct object and the tracker's
  per-object cooldown does not fold two contacts into one.

### Time

No incident field is compared against wall-clock time — the running sim
timestamps from `performance.now()`. The recipe therefore carries
`atOffsetMs` and the factory derives `atMs` from the run's seed time, so
relative ordering holds however long after seeding a test runs.

### Accepted UI limitations

- The `/boats` index is prerendered in a server build, so seeded boats show up
  there in dev but not in a built preview. They are reachable at
  `/boats/<slug>` (which renders unknown slugs on demand) and through
  `/api/autonoma/seeded`.
- Seeded marinas get no entry in the sim's location switcher, which is driven by
  `SAN_JUAN_AUG_2026_SCENARIO.stops`. They resolve through `getMarinaLayout` and
  the seeded endpoint.
