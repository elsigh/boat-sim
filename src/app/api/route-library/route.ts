import { BlobNotFoundError, del, get, head, list } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { authorizeUpload } from "@/lib/tracks/route-library-server";
import { MAX_ROUTE_FILE_BYTES, nameFromRoutePath, ROUTE_PREFIX, routePath } from "@/lib/tracks/saved-routes";

export const runtime = "nodejs";
export const maxDuration = 60;
const noStore = { "Cache-Control": "no-store" };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: noStore });

// Shared library. POST permits the offline export to omit this server endpoint.
// Only the new snapshot prefix is exposed; old full uploads remain untouched.
export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return json({ backend: "device" });
  try {
    // The filtered archive uploads directly to Blob, avoiding function body limits.
    const text = await request.text();
    if (text.length > 16_384) return json({ error: "Route request is too large." }, 413);
    const body = JSON.parse(text);
    if (body.type === "blob.generate-client-token" || body.type === "blob.upload-completed") {
      const result = await handleUpload({
        request, body: body as HandleUploadBody,
        onBeforeGenerateToken: async (pathname, payload) => ({
          ...authorizeUpload(pathname, payload),
          allowedContentTypes: ["application/json"], maximumSizeInBytes: MAX_ROUTE_FILE_BYTES,
          addRandomSuffix: false, cacheControlMaxAge: 60,
          validUntil: Date.now() + 60 * 60 * 1000,
        }),
      });
      return json(result);
    }
    if (body.action === "list") {
      const routes = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: ROUTE_PREFIX, cursor, limit: 100 });
        for (const blob of page.blobs) {
          try {
            const name = nameFromRoutePath(blob.pathname);
            routes.push({ id: name, name, updatedAt: blob.uploadedAt.toISOString() });
          } catch { /* Ignore files outside the named snapshot schema. */ }
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      // Listing names never downloads the route data.
      return json({ backend: "cloud", routes });
    }
    if (body.action === "file") {
      // get() treats a pathname as a URL path without encoding it. Resolve the
      // canonical URL so names containing spaces, accents or % round-trip.
      const blob = await head(routePath(body.id));
      const result = await get(blob.url, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200) return json({ error: "Saved route not found." }, 404);
      return new Response(result.stream, { headers: { ...noStore, "Content-Type": "application/json" } });
    }
    if (body.action === "delete") {
      await del(routePath(body.id));
      return json({ deleted: true });
    }
    return json({ error: "Unknown route-library action." }, 400);
  } catch (error) {
    if (error instanceof BlobNotFoundError) return json({ error: "Saved route not found." }, 404);
    return json({ error: "Could not access saved routes. Please try again." }, 400);
  }
}
