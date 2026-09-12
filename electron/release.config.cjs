const { build } = require("../package.json");
const { parseReleaseVersion } = require("../scripts/release-version.cjs");

const { version } = parseReleaseVersion(process.env.RELEASE_VERSION);
const signed = process.env.RELEASE_SIGNED === "true";
if (signed) {
  const required = ["CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing release signing secrets: ${missing.join(", ")}`);
}

// Keep local app:build settings intact. CI sets the app version without a
// version-bump commit, and publishes only after both architectures finish.
module.exports = {
  ...build,
  extends: null,
  directories: { ...build.directories, output: "dist-app/release" },
  files: [...build.files, "!electron/release.config.cjs"],
  extraMetadata: { version },
  artifactName: "boatsim-${version}-${arch}.${ext}",
  forceCodeSigning: signed,
  mac: { ...build.mac, identity: signed ? undefined : "-", notarize: signed, hardenedRuntime: signed },
  publish: null,
};
