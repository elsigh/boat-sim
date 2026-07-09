import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";

// TypeScript 7's native compiler has no JS API, so the lint stack
// (typescript-eslint and friends, loaded via eslint-config-next) can't use
// the root typescript package. This plants a TypeScript 6 runtime (the
// aliased typescript-lint-runtime devDependency) inside each lint-chain
// package's module resolution path so `npm run lint` keeps working while
// the project itself type-checks with TS 7.

const runtime = path.resolve("node_modules/typescript-lint-runtime");

// Packages whose require("typescript") must resolve to the TS 6 runtime.
const hosts = [
  "node_modules/eslint-config-next",
  "node_modules/ts-api-utils",
  "node_modules/@typescript-eslint/scope-manager",
  "node_modules/@typescript-eslint/types",
  "node_modules/@typescript-eslint/visitor-keys",
];

if (!existsSync(runtime)) {
  process.exit(0);
}

let linked = 0;

for (const host of hosts) {
  if (!existsSync(path.resolve(host))) {
    continue;
  }

  const hostDir = path.resolve(host, "node_modules");
  const link = path.join(hostDir, "typescript");

  mkdirSync(hostDir, { recursive: true });
  rmSync(link, { recursive: true, force: true });
  symlinkSync(runtime, link, "dir");
  linked += 1;
}

console.log(`Linked TypeScript 6 lint runtime into ${linked} package(s)`);
