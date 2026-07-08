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
