/**
 * In-memory home for records the Autonoma Environment Factory seeds.
 *
 * The simulator has no database: boats, marinas and impact incidents live in
 * static modules and component state. So seeded records need somewhere to sit
 * that the app's own read paths can see, and that a `down` request can empty
 * again. Everything is filed under the test run that created it, which makes
 * the run the teardown scoping root: dropping a scope removes exactly what
 * that run seeded and nothing else.
 *
 * The registry hangs off globalThis because Next's dev server compiles route
 * handlers and pages into separate module graphs — a module-scoped Map would
 * be instantiated twice and the pages would never see the seeded rows.
 */
import type { BoatProfile } from "@/lib/boats/catalog";
import type { MarinaLayout } from "@/lib/marinas/types";
import { ImpactTracker, type ImpactIncident } from "@/lib/sim/collision-damage";

export type TestRunScope = {
  testRunId: string;
  /** Wall clock at first write, the base for incident timestamps. */
  seededAtMs: number;
  boats: Map<string, BoatProfile>;
  marinas: Map<string, MarinaLayout>;
  /** layout id → the template layout its authored geometry was borrowed from. */
  templates: Map<string, string | undefined>;
  incidents: Map<string, ImpactIncident>;
  /** The app's real incident filter, one per run so cooldowns don't cross runs. */
  impactTracker: ImpactTracker;
};

type Registry = Map<string, TestRunScope>;

const REGISTRY_KEY = "__autonomaTestDataRegistry";

function registry(): Registry {
  const host = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Registry };

  host[REGISTRY_KEY] ??= new Map<string, TestRunScope>();

  return host[REGISTRY_KEY];
}

export function testRunScope(testRunId: string): TestRunScope {
  const scopes = registry();
  const existing = scopes.get(testRunId);

  if (existing) {
    return existing;
  }

  const scope: TestRunScope = {
    testRunId,
    seededAtMs: Date.now(),
    boats: new Map(),
    marinas: new Map(),
    templates: new Map(),
    incidents: new Map(),
    impactTracker: new ImpactTracker(),
  };

  scopes.set(testRunId, scope);

  return scope;
}

/** Forget a scope once its last record is torn down. */
export function pruneTestRunScope(testRunId: string) {
  const scopes = registry();
  const scope = scopes.get(testRunId);

  if (!scope) {
    return;
  }

  if (scope.boats.size === 0 && scope.marinas.size === 0 && scope.incidents.size === 0) {
    scopes.delete(testRunId);
  }
}

function scopes(): TestRunScope[] {
  return [...registry().values()];
}

export function seededBoatProfiles(): BoatProfile[] {
  return scopes().flatMap((scope) => [...scope.boats.values()]);
}

export function seededMarinaLayouts(): MarinaLayout[] {
  return scopes().flatMap((scope) => [...scope.marinas.values()]);
}

export function seededImpactIncidents(): ImpactIncident[] {
  return scopes()
    .flatMap((scope) => [...scope.incidents.values()])
    .sort((a, b) => a.atMs - b.atMs);
}

export function findSeededBoatProfile(profileSlug: string): BoatProfile | undefined {
  for (const scope of scopes()) {
    const boat = scope.boats.get(profileSlug);

    if (boat) {
      return boat;
    }
  }

  return undefined;
}

export function findSeededMarinaLayout(id: string): MarinaLayout | undefined {
  for (const scope of scopes()) {
    const layout = scope.marinas.get(id);

    if (layout) {
      return layout;
    }
  }

  return undefined;
}
