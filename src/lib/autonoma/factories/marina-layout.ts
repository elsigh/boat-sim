import { defineFactory } from "@autonoma-ai/sdk";
import { z } from "zod";

import { pruneTestRunScope, testRunScope } from "@/lib/autonoma/store";
import { buildMarinaLayout } from "@/lib/marinas";

export const MarinaLayoutFactory = defineFactory({
  inputSchema: z.object({
    id: z.string(),
    name: z.string(),
    vhfChannel: z.string().optional(),
    briefing: z.array(z.string()).optional(),
    /** Layout whose land, docks, pilings and conditions are reused. */
    templateId: z.string().optional(),
  }),
  // `id` is the layout id itself, so a `_ref` from a Berth or SpawnPoint
  // arrives as the id the app looks layouts up by.
  refSchema: z.object({
    id: z.string(),
    testRunId: z.string(),
    name: z.string(),
    templateId: z.string().optional(),
  }),
  create: (data, ctx) => {
    const scope = testRunScope(ctx.testRunId);
    const layout = buildMarinaLayout(data);
    scope.marinas.set(layout.id, layout);
    scope.templates.set(layout.id, data.templateId);
    return {
      id: layout.id,
      testRunId: ctx.testRunId,
      name: layout.name,
      templateId: data.templateId,
    };
  },
  teardown: (record) => {
    const scope = testRunScope(record.testRunId);
    scope.marinas.delete(record.id);
    scope.templates.delete(record.id);
    pruneTestRunScope(record.testRunId);
  },
});
