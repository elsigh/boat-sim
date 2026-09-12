const { appendFileSync } = require("node:fs");

function parseReleaseVersion(input) {
  const version = String(input ?? "").trim().replace(/^v/, "");
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(version);
  if (!match || match[4]?.split(".").some((part) => /^0\d+$/.test(part))) {
    throw new Error("Use a version such as 0.1.0 or 0.2.0-beta.1 (an optional v prefix is allowed).");
  }
  return { version, tag: `v${version}`, prerelease: Boolean(match[4]) };
}

module.exports = { parseReleaseVersion };

if (require.main === module) {
  const release = parseReleaseVersion(process.env.RELEASE_VERSION);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(release).map(([key, value]) => `${key}=${value}\n`).join(""));
  }
  console.log(JSON.stringify(release));
}
