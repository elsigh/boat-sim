const assert = require("node:assert/strict");
const { test } = require("node:test");
const { execFileSync } = require("node:child_process");
const { parseReleaseVersion } = require("./release-version.cjs");

test("release versions produce matching app versions, tags and prerelease flags", () => {
  assert.deepEqual(parseReleaseVersion("v1.2.3"), { version: "1.2.3", tag: "v1.2.3", prerelease: false });
  assert.deepEqual(parseReleaseVersion("0.2.0-beta.1"), { version: "0.2.0-beta.1", tag: "v0.2.0-beta.1", prerelease: true });
  for (const bad of ["", "latest", "1.2", "01.2.3", "1.2.3-01", "1.2.3+build", "1.2.3\ntag=wrong", "$(touch /tmp/oops)", "1.2.3/../../x"]) {
    assert.throws(() => parseReleaseVersion(bad), undefined, bad);
  }
});

test("release configuration isolates output, versions the app, and never silently skips requested signing", () => {
  const run = (signed) => execFileSync(process.execPath, ["-e", 'console.log(JSON.stringify(require("./electron/release.config.cjs")))'], {
    cwd: require("node:path").resolve(__dirname, ".."), encoding: "utf8",
    env: { PATH: process.env.PATH, RELEASE_VERSION: "v0.2.0-beta.1", RELEASE_SIGNED: String(signed) }, stdio: ["ignore", "pipe", "pipe"],
  });
  const config = JSON.parse(run(false));
  assert.equal(config.extraMetadata.version, "0.2.0-beta.1");
  assert.equal(config.mac.identity, "-");
  assert.equal(config.mac.notarize, false);
  assert.equal(config.mac.hardenedRuntime, false);
  assert.equal(config.directories.output, "dist-app/release");
  assert.equal(config.publish, null);
  assert.throws(() => run(true), /Missing release signing secrets/);
});
