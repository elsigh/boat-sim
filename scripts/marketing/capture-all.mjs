/** Refresh the film's takes, sequentially, in the existing managed browser. */
import { spawn } from "node:child_process";
const shots = [
  ["slip-fwd", "depart-roche", "52-grand-banks-bonum-vitae", 10, "sk"],
  ["roche-fwd", "arrive-roche", "52-grand-banks-bonum-vitae", 12, "wi"],
  ["turn-fwd", "arrive-roche", "52-grand-banks-bonum-vitae", 12, "wk"],
  ["nordhavn-fwd", "arrive-roche", "86-nordhavn-serendipity", 10, "wi"],
  ["corsair-fwd", "arrive-roche", "2005-chris-craft-corsair-36", 12, "wi"],
  ["cranchi-fwd", "arrive-roche", "2026-cranchi-e26-rider", 12, "wi"],
  [
    "islands-fwd",
    "arrive-roche-passage",
    "52-grand-banks-bonum-vitae",
    12,
    "wi",
  ],
  [
    "damage-fwd",
    "depart-roche",
    "52-grand-banks-bonum-vitae",
    12,
    "wi",
    "turbo",
  ],
];
function run(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [`scripts/marketing/${script}.mjs`, ...args.map(String)],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)),
    );
  });
}
for (const [name, exercise, boat, seconds, keys, effect = ""] of shots) {
  await run("prepare", [exercise, "Fwd", boat]);
  await run("capture", [name, seconds, keys, effect]);
  if (name === "turn-fwd") await run("detail", ["helm"]);
}
await run("prepare", ["arrive-roche", "Fwd", "52-grand-banks-bonum-vitae"]);
