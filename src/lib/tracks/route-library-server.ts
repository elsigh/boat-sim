import { routeName, routePath } from "./saved-routes";

export function authorizeUpload(pathname: string, payload: string | null) {
  const input = JSON.parse(payload ?? "null");
  const name = routeName(input?.name);
  if (pathname !== routePath(name) || typeof input.replace !== "boolean") {
    throw new Error("Invalid route upload.");
  }
  return { allowOverwrite: input.replace };
}
