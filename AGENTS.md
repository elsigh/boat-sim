<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:autonoma -->

# Autonoma test data

Autonoma runs end-to-end tests against a deployed preview of this app, and
before each run it POSTs to `/api/autonoma` (`src/app/api/autonoma/route.node.ts`)
to build the world that test expects — boats, marinas, berths, spawn points and
impact incidents — then tears it all down afterwards. The factories in
`src/lib/autonoma/factories/` do that by calling the simulator's own builders
(`buildBoatProfile`, `buildMarinaLayout`, `addMarinaBerth`, `addMarinaSpawn`,
`ImpactTracker.register`), so seeded data goes through the same mirroring and
damage-derivation the shipped catalog does.

When you change the shape of a boat profile, a marina layout, a berth, a spawn
point or an impact incident, update the matching factory alongside it — a stale
factory means Autonoma seeds a world the app can no longer read, and every test
run fails on setup rather than on the change you actually made.

<!-- END:autonoma -->
