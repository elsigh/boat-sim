# Releasing the Mac app

Open [Actions → Release macOS](https://github.com/elsigh/boat-sim/actions/workflows/release-macos.yml) and click **Run workflow**.

1. Select the branch containing the code you want to ship, normally `main`. Commit and push any local simulator changes first; GitHub cannot build uncommitted files on your Mac.
2. Enter a new version, such as `0.1.0`. The workflow creates tag `v0.1.0` and uses `0.1.0` inside the app. An optional `v` prefix is accepted. Versions like `0.2.0-beta.1` become prereleases automatically.
3. Leave **mode** set to **draft** to review the release before making it public. Choose **publish** to publish automatically after all downloads are uploaded, or **build-only** to test packaging without creating a tag or release.
4. Leave **Sign with Apple Developer ID and notarize** off until the Apple secrets below are configured.
5. Run the workflow. Both Mac builds must pass their tests, static export, packaging, signature verification and checksum checks before a release is created.
6. For a draft, open [Releases](https://github.com/elsigh/boat-sim/releases), edit the generated notes, and click **Publish release**. The action's summary also links to the draft.

Nothing releases automatically on a push. Once published, the release page is the public download page you can share. GitHub hosts the files.

## Downloads

Each release has:

| File | Use |
| --- | --- |
| `boatsim-VERSION-arm64.dmg` | Apple Silicon Macs (M-series) |
| `boatsim-VERSION-x64.dmg` | Intel Macs |
| `boatsim-VERSION-arm64.zip` / `boatsim-VERSION-x64.zip` | App bundles without the disk image |
| `SHA256SUMS.txt` | Checksums for all four downloads |

Open the appropriate DMG and drag boatsim into Applications. The app contains the static simulator and works offline. The release notes identify the exact source commit.

A build-only run stores the DMG, ZIP and checksums as **macos-arm64** and **macos-x64** artifacts on the Actions run page for 14 days. Published release assets remain available independently of that artifact retention.

## Apple signing and notarization

The default build uses an **ad hoc signature**, which needs no Apple credentials. It is not notarized or verified as coming from an identified developer, and macOS may block its first launch. For a release you trust, attempt to open the app, then use **System Settings → Privacy & Security → Open Anyway** if macOS offers it.

For distribution with Apple Developer ID, add these **repository secrets** under [Settings → Secrets and variables → Actions](https://github.com/elsigh/boat-sim/settings/secrets/actions):

| Secret | Value |
| --- | --- |
| `CSC_LINK` | Base64-encoded `.p12` export of the **Developer ID Application** certificate and its private key |
| `CSC_KEY_PASSWORD` | Password used to protect that `.p12` export |
| `APPLE_ID` | Apple Account email for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that Apple Account |
| `APPLE_TEAM_ID` | Apple Developer team ID |

Use a password-protected certificate export. Keep certificates and passwords out of commits, workflow inputs and release notes. After adding the secrets, enable **Sign with Apple Developer ID and notarize** when running the action. A requested signed build fails if credentials are missing; it never silently falls back to an ad hoc build. The action verifies the resulting signature, stapled notarization ticket and Gatekeeper assessment.

### Reusing an existing local setup

If local builds already sign and notarize successfully, keep using that Developer ID identity. Export its certificate **and private key** as a password-protected `.p12` for `CSC_LINK`; creating a new certificate or paying another developer fee is unnecessary. Your Apple team ID is the same locally and on GitHub.

The local `APPLE_KEYCHAIN_PROFILE` points to a profile on your Mac; GitHub-hosted runners cannot access it. Add the matching Apple Account email and an app-specific password as `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD`. If the existing password is available only inside Apple's protected Keychain, create a separate app-specific password for GitHub Actions at [Apple Account](https://account.apple.com). Keep the local profile intact.

Enter these values directly in [Actions secrets](https://github.com/elsigh/boat-sim/settings/secrets/actions), or use `gh secret set APPLE_ID` and `gh secret set APPLE_APP_SPECIFIC_PASSWORD` from this repository; the CLI prompts for each value. Do not paste credentials into chat or put them in command arguments. After setup, test with **mode: build-only** and signing enabled before cutting a release.

The release-specific builder configuration lives in `electron/release.config.cjs`. Local `pnpm app:build` settings are unchanged. Release versions are applied to the packaged app without modifying `package.json` or adding version-bump commits.

## Failed runs and retries

A build failure leaves the other architecture's successful artifact available on the run page, but creates no release. Fix the problem and rerun the workflow. A version already used by a tag or release is rejected before building, so an existing download is never replaced silently.

If uploading fails after creating a draft, inspect that draft before retrying. Delete the incomplete draft (and its tag, if one was created) only if it was never published, or choose a new version. To change already published app contents, use a new version.
