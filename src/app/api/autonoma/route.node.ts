/**
 * Autonoma Environment Factory endpoint.
 *
 * Autonoma's test runner POSTs `discover` / `up` / `down` here to seed and then
 * remove the working state its end-to-end tests need. Every request is
 * HMAC-signed with the shared secret this deployment was provisioned with;
 * unsigned or tampered requests get a 401 from the SDK.
 *
 * The file is named `route.node.ts` rather than `route.ts` because the Electron
 * build runs `next build` with `output: "export"`, which supports only `GET`
 * route handlers. `pageExtensions` in next.config.ts includes `node.ts` for the
 * server build and drops it for the static export, so this handler is mounted
 * at /api/autonoma when the app runs as a server and simply absent from the
 * exported bundle.
 */
import { createHandler } from "@autonoma-ai/server-web";
import { createHash } from "node:crypto";

import { factories } from "@/lib/autonoma/factories";
import { DEFAULT_BOAT_SLUG } from "@/lib/boats/catalog";

const sharedSecret = process.env.AUTONOMA_SHARED_SECRET;

/**
 * The refs token is signed with a secret Autonoma never sees, so it must differ
 * from the shared secret (the SDK rejects them being equal). When the
 * deployment does not provision one, derive it from the shared secret: stable
 * across restarts within a deployment, and not the shared secret itself.
 */
function refsSigningSecret(shared: string): string {
  return (
    process.env.AUTONOMA_SIGNING_SECRET ??
    createHash("sha256").update(`${shared}:autonoma-refs-signing`).digest("hex")
  );
}

function autonomaHandler(shared: string) {
  return createHandler({
    // The simulator has no tenant column; a test run is the only scope there
    // is, and it is what the factories file every seeded record under.
    scopeField: "testRunId",
    sharedSecret: shared,
    signingSecret: refsSigningSecret(shared),
    factories,
    /**
     * There is no sign-in: the simulator is a single-operator helm with no
     * accounts, sessions or tokens, so there is no credential to mint and a
     * bearer token would be a fiction. What the runner actually needs to reach
     * the state just seeded is the entry URL, so hand back the real one — the
     * boat query parameter `/` reads, pointed at a boat this run created.
     */
    auth: (_user, ctx) => {
      const boats = (ctx.refs.BoatProfile ?? []) as Array<{ id?: unknown }>;
      const boatSlug = typeof boats[0]?.id === "string" ? boats[0].id : DEFAULT_BOAT_SLUG;

      return {
        credentials: {
          authMode: "none",
          entryPath: `/?boat=${encodeURIComponent(boatSlug)}`,
          boatSlug,
          testRunId: ctx.scopeValue,
        },
      };
    },
  });
}

const handler = sharedSecret ? autonomaHandler(sharedSecret) : null;

export async function POST(request: Request): Promise<Response> {
  if (!handler) {
    // Nothing was provisioned, so there is no signature to verify against and
    // no safe way to serve the endpoint.
    return new Response("Not Found", { status: 404 });
  }

  return handler(request);
}
