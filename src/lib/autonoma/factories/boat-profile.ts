import { defineFactory } from "@autonoma-ai/sdk";
import { z } from "zod";

import { pruneTestRunScope, testRunScope } from "@/lib/autonoma/store";
import { buildBoatProfile } from "@/lib/boats/catalog";

export const BoatProfileFactory = defineFactory({
  inputSchema: z.object({
    profileSlug: z.string(),
    displayName: z.string(),
    manufacturer: z.string(),
    model: z.string(),
    simStatus: z.enum(["ready", "experimental"]),
    loa: z.string(),
    beam: z.string(),
    summary: z.string().optional(),
    homePort: z.string().optional(),
    lengthM: z.number().optional(),
    beamM: z.number().optional(),
    /** Catalog entry whose handling model and visuals this profile borrows. */
    templateSlug: z.string().optional(),
  }),
  // `id` is the profile slug itself — the key the app's catalog lookups use.
  refSchema: z.object({
    id: z.string(),
    testRunId: z.string(),
    displayName: z.string(),
  }),
  create: (data, ctx) => {
    const scope = testRunScope(ctx.testRunId);
    const profile = buildBoatProfile(data);
    scope.boats.set(profile.profileSlug, profile);
    return {
      id: profile.profileSlug,
      testRunId: ctx.testRunId,
      displayName: profile.displayName,
    };
  },
  teardown: (record) => {
    const scope = testRunScope(record.testRunId);
    scope.boats.delete(record.id);
    pruneTestRunScope(record.testRunId);
  },
});
