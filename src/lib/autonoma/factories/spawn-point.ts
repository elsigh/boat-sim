import { defineFactory } from "@autonoma-ai/sdk";
import { z } from "zod";

import { pruneTestRunScope, testRunScope, type TestRunScope } from "@/lib/autonoma/store";
import { addMarinaSpawn, chartFrameLayout, removeMarinaSpawn } from "@/lib/marinas";
import type { MarinaLayout, SpawnPoint } from "@/lib/marinas/types";

/** The seeded layout holding a berth — a spawn belongs to whichever that is. */
function layoutHoldingBerth(scope: TestRunScope, berthId: string): MarinaLayout | undefined {
  for (const layout of scope.marinas.values()) {
    if (layout.berths.some((berth) => berth.id === berthId)) {
      return layout;
    }
  }

  return undefined;
}

/**
 * Where an exercise starts is authored chart geometry. When a recipe leaves it
 * out, borrow a real spawn of the same kind from the layout's template so the
 * boat appears on water in the right harbour rather than at the origin.
 */
function templateSpawn(templateId: string | undefined, kind: SpawnPoint["kind"], index: number): SpawnPoint {
  const source = chartFrameLayout(templateId);
  const sameKind = source.spawns.filter((spawn) => spawn.kind === kind);
  const pool = sameKind.length > 0 ? sameKind : source.spawns;

  return pool[index % pool.length];
}

export const SpawnPointFactory = defineFactory({
  inputSchema: z.object({
    id: z.string(),
    label: z.string(),
    kind: z.enum(["arrival", "departure"]),
    /** Resolved Berth id — the berth this spawn practises against. */
    berthId: z.string(),
    range: z.enum(["close", "approach", "passage"]).optional(),
    brief: z.string().optional(),
    /** Chart-frame start position and heading. Borrowed when omitted. */
    position: z.tuple([z.number(), z.number()]).optional(),
    yawDeg: z.number().optional(),
    /** Which template spawn of this kind to borrow geometry from. */
    geometryIndex: z.number().optional(),
  }),
  refSchema: z.object({
    id: z.string(),
    testRunId: z.string(),
    marinaLayoutId: z.string(),
    label: z.string(),
  }),
  create: (data, ctx) => {
    const scope = testRunScope(ctx.testRunId);
    const layout = layoutHoldingBerth(scope, data.berthId);

    if (!layout) {
      throw new Error(
        `Spawn point "${data.id}" references berth "${data.berthId}", which no marina layout in this test run holds.`,
      );
    }

    const borrowed = templateSpawn(
      scope.templates.get(layout.id),
      data.kind,
      data.geometryIndex ?? layout.spawns.length,
    );

    addMarinaSpawn(layout, {
      id: data.id,
      label: data.label,
      kind: data.kind,
      berthId: data.berthId,
      range: data.range ?? borrowed.range,
      brief: data.brief ?? borrowed.brief,
      position: data.position ?? borrowed.position,
      yawDeg: data.yawDeg ?? borrowed.yawDeg,
    });

    return {
      id: data.id,
      testRunId: ctx.testRunId,
      marinaLayoutId: layout.id,
      label: data.label,
    };
  },
  teardown: (record) => {
    const scope = testRunScope(record.testRunId);
    const layout = scope.marinas.get(record.marinaLayoutId);

    if (layout) removeMarinaSpawn(layout, record.id);

    pruneTestRunScope(record.testRunId);
  },
});
