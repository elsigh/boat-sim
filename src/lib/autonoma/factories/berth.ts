import { defineFactory } from "@autonoma-ai/sdk";
import { z } from "zod";

import { pruneTestRunScope, testRunScope } from "@/lib/autonoma/store";
import { addMarinaBerth, chartFrameLayout, removeMarinaBerth } from "@/lib/marinas";
import type { Berth } from "@/lib/marinas/types";

/**
 * Berth geometry — where the berth sits and how big it is — is authored chart
 * geometry, not something a scenario describes. When a recipe leaves it out,
 * borrow a real berth of the same kind from the layout's template so the
 * seeded berth is somewhere a boat can actually be driven into.
 */
function templateBerth(templateId: string | undefined, kind: Berth["kind"], index: number): Berth {
  const source = chartFrameLayout(templateId);
  const sameKind = source.berths.filter((berth) => berth.kind === kind);
  const pool = sameKind.length > 0 ? sameKind : source.berths;

  return pool[index % pool.length];
}

export const BerthFactory = defineFactory({
  inputSchema: z.object({
    id: z.string(),
    label: z.string(),
    kind: z.enum(["alongside", "slip"]),
    /** Resolved MarinaLayout id — the layout this berth belongs to. */
    marinaLayoutId: z.string(),
    dockSide: z.enum(["port", "starboard"]),
    notes: z.string().optional(),
    /** Chart-frame boat-centre position when docked. Borrowed when omitted. */
    center: z.tuple([z.number(), z.number()]).optional(),
    headingDeg: z.number().optional(),
    lengthM: z.number().optional(),
    widthM: z.number().optional(),
    headingToleranceDeg: z.number().optional(),
    /** Which template berth of this kind to borrow geometry from. */
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
    const layout = scope.marinas.get(data.marinaLayoutId);

    if (!layout) {
      throw new Error(
        `Berth "${data.id}" references marina layout "${data.marinaLayoutId}", which this test run has not created.`,
      );
    }

    const borrowed = templateBerth(
      scope.templates.get(data.marinaLayoutId),
      data.kind,
      data.geometryIndex ?? layout.berths.length,
    );

    addMarinaBerth(layout, {
      id: data.id,
      label: data.label,
      kind: data.kind,
      dockSide: data.dockSide,
      notes: data.notes,
      center: data.center ?? borrowed.center,
      headingDeg: data.headingDeg ?? borrowed.headingDeg,
      lengthM: data.lengthM ?? borrowed.lengthM,
      widthM: data.widthM ?? borrowed.widthM,
      headingToleranceDeg: data.headingToleranceDeg ?? borrowed.headingToleranceDeg,
    });

    return {
      id: data.id,
      testRunId: ctx.testRunId,
      marinaLayoutId: data.marinaLayoutId,
      label: data.label,
    };
  },
  teardown: (record) => {
    const scope = testRunScope(record.testRunId);
    const layout = scope.marinas.get(record.marinaLayoutId);

    if (layout) removeMarinaBerth(layout, record.id);

    pruneTestRunScope(record.testRunId);
  },
});
