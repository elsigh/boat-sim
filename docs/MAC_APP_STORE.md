# Packaging for macOS and the Mac App Store

The simulator is fully client-side, so the desktop app is a static Next.js
export served offline inside an Electron shell (Chromium — chosen over a
WKWebView wrapper because the Gamepad API, which the TCA throttle quadrant
depends on, is reliable there).

## Local builds (no Apple account needed)

```bash
npm run app:dev      # static export + launch the app unpackaged
npm run app:build    # build .dmg and .zip into dist-app/
```

`app:build` produces an unsigned app: fine for your own Mac (right-click →
Open the first time). Distribution to anyone else requires signing.

## Sharing a DMG with friends (Developer ID — no App Store)

This is the easy distribution path: one certificate, no review, no
sandbox. Friends double-click the DMG and it just opens.

1. **Enroll** in the Apple Developer Program ($99/yr) at
   developer.apple.com — personal account is fine; approval usually takes
   a day or so.
2. **Create the certificate**: install Xcode, then Xcode → Settings →
   Accounts → your Apple ID → *Manage Certificates…* → **+** →
   **Developer ID Application**. It lands in your keychain; electron-builder
   finds it automatically.
3. **Notarization credentials** (Apple scans the app, ~2 minutes,
   automatic): create an *app-specific password* at account.apple.com →
   Sign-In and Security, then export three env vars before building:

   ```bash
   export APPLE_ID="you@example.com"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="YOURTEAMID"   # shown at developer.apple.com/account
   ```

4. **Build**: `npm run app:build`. electron-builder signs with the
   Developer ID cert, submits to Apple for notarization, staples the
   ticket, and drops a shareable `boatsim-….dmg` in `dist-app/`.

Send that DMG any way you like — download, AirDrop, USB stick. It opens
with no warnings on any Mac.

**Without the $99** you can still share the unsigned DMG, but each friend
must bypass Gatekeeper manually: open the app once (it gets blocked), then
System Settings → Privacy & Security → **Open Anyway**. Workable for one
or two technical friends, annoying for everyone else — and the exact hoops
get tighter with each macOS release.

(If credentials/cert are missing, the build still succeeds unsigned for
your own use — signing and notarization are skipped with a warning.)

## One-time Apple setup for the App Store

1. Join the [Apple Developer Program](https://developer.apple.com/programs/) ($99/yr).
2. In Xcode (Settings → Accounts) or the developer portal, create:
   - **Apple Distribution** certificate (a.k.a. "3rd Party Mac Developer Application")
   - **Mac Installer Distribution** certificate
3. In App Store Connect, create the app record. Bundle ID must match
   `com.elsigh.boatsim` (set in `package.json` → `build.appId`; change it
   there if you register something else).
4. Create a **Mac App Store provisioning profile** for that bundle ID and
   save it as `electron/resources/embedded.provisionprofile`.

## Building and submitting

```bash
npm run app:mas      # builds the sandboxed .pkg into dist-app/
```

electron-builder signs with the certificates in your keychain (set
`CSC_NAME="Your Name (TEAMID)"` if it picks the wrong one). Then upload the
generated `.pkg` with the **Transporter** app (Mac App Store) and submit for
review in App Store Connect.

Entitlements live in `electron/entitlements/` — sandbox is enabled, with JIT
(required by Chromium) and USB (HID gamepads/quadrants). If review flags the
USB entitlement, note in the review comments that the app supports
game-controller/throttle-quadrant input.

## Remaining TODOs before submission

- ~~App icon~~ Done: `electron/resources/icon.icns`, generated from
  `icon.svg` by `node scripts/build-icon.mjs` (edit the SVG, re-run to
  regenerate).
- **Screenshots + metadata** in App Store Connect (1280×800 or 2560×1600).
- Consider a **privacy policy URL** (the app collects nothing; a one-liner
  page is fine) — App Store Connect requires the field.
- Version bumps: `npm version minor` keeps CFBundleVersion in sync.

## Notes

- The web app is untouched: `npm run dev` / `npm run build` behave as
  before. `NEXT_OUTPUT=export` is what switches Next into static-export
  mode for the desktop bundle (see `next.config.ts`).
- Everything runs offline — fonts are self-hosted at build time and there
  are no runtime network calls. External links (charter pages, sources)
  open in the default browser.
- Alternative to the App Store: sign with a **Developer ID** certificate,
  notarize (`electron-builder --mac dmg` + `notarize` config), and ship the
  dmg from your own site — fewer review hoops, same offline app.
