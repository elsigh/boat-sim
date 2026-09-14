# Release films and media

The public release kit uses actual footage from the simulator. The forward camera is the primary view throughout both films. The chart insert is a screenshot of the real plotter with a slow editorial zoom. The twin-screw segment includes a still detail from the actual helm with port ahead and starboard astern. Gameplay is edited at roughly 1.25–1.5× speed for pacing. All titles are burned in so the story works without sound.

The production site is https://boat-sim-lake.vercel.app, the verified domain attached to the Vercel project. Confirm the project domain in Vercel before changing links or rendering a new campaign; the shorter name without “-lake” serves a different site.

## Deliverables

| Asset | Intended use |
| --- | --- |
| `public/media/boat-sim-feature-40s.mp4` | 40-second, 1920 × 1080 landscape tour |
| `public/media/boat-sim-short-15s.mp4` | 15-second, 1080 × 1920 vertical cut for TikTok, Reels, and Shorts |
| `public/media/feature-preview.gif` | Small animated README preview of the full tour |
| `public/media/short-preview.gif` | Small animated README preview of the vertical cut |
| `public/media/feature-poster.jpg`, `short-poster.jpg` | Click-to-play poster images |
| `public/media/hero.jpg` | Forward-camera still inside Roche Harbor |
| `public/media/chart.jpg` | Cropped plotter screenshot |
| `public/media/social-card.jpg` | 1200 × 630 social sharing image |
| `public/media/feature-en.vtt`, `short-en.vtt` | English captions matching the on-screen copy |

Both MP4s use H.264, 30 fps, yuv420p, AAC stereo, and fast-start metadata. The source capture rate varies with the local WebGL frame rate. The edit normalizes output to 30 fps. Native video players on `/about` have captions, controls, posters, and download links; they load video only on request.

GitHub sanitizes arbitrary `<video>` HTML in Markdown. The README therefore uses actual animated excerpts linked to the corresponding `/about` player, plus direct MP4 file links. This works without depending on manually uploaded GitHub issue attachments. The public website links start serving the new files when this change is deployed.

## The 40-second edit

| Time | Picture | Story |
| --- | --- | --- |
| 0–4 | Grand Banks backing out at Roche, forward camera | The last 50 feet. All yours. |
| 4–9 | Opposing throttles, forward camera | Two screws. Your call. |
| 9–13 | Expanded Roche Harbor plotter | Know the water. |
| 13–16 | Nordhavn 86, forward camera | Find your boat. |
| 16–19 | Chris-Craft Corsair 36, forward camera | Find your boat. |
| 19–22 | Cranchi E26, forward camera | Find your boat. |
| 22–27 | Spieden Channel approach to Roche, forward camera | A little island time. |
| 27–30 | Dock damage, forward camera | Well. Try that again. |
| 30–36 | Grand Banks wake on the Roche approach | One more approach. |
| 36–40 | Back in the marina, with the launch URL | Your next berth starts here. |

The vertical version reuses these exact source takes and starting times: the opening, opposing throttles, Corsair, Cranchi, damage, and closing invitation. It is reframed around the boat, with larger type and room for platform controls. No simulated features or generated boat imagery are inserted.

## Soundtrack

The instrumental is an original, deterministic synthesis from `scripts/marketing/score.py`: oscillators, a D/A/B-minor/G progression, plucked notes, bass, and seeded noise percussion at 120 BPM. There are no third-party recordings, sample packs, stock loops, or borrowed songs. No voiceover or real engine recording is used. The exports are normalized toward −16 LUFS with a −1.5 dB true-peak target.

## Make the next cut

Tools: Node.js 22+ (built-in WebSocket), a ready d3k runtime, FFmpeg with libx264, Python with Pillow and NumPy, and the macOS Arial/Andale fonts. On other platforms, change the font paths in `render.py` to appropriate installed fonts.

1. Run `d3k portless status --json` and `d3k status --json`. Reuse the existing runtime if ready; otherwise start `d3k -t` following the project d3k skill. Do not start a second dev server or browser.
2. Open the simulator in the managed page. Close the expanded plotter before setting up a shot.
3. Use `prepare.mjs` to choose the boat, exercise, conditions, and forward view. Its optional arguments are exercise, camera button label, boat slug, and stop ID. It temporarily ignores hardware-gamepad input in that page so a connected quadrant cannot interrupt a keyboard-driven take. A page reload restores the native API.
4. Record the real canvas with `capture.mjs`. It attaches to the **existing page URL returned by `d3k status`** and uses `canvas.captureStream`; it never creates a new browser/profile or a Save As dialog. The optional third argument holds keyboard keys for the take, then neutralizes them. The optional fourth argument `turbo` taps T after 4.5 seconds. Disconnect or neutralize physical levers before ending the capture session.

```bash
# The main boating shots
node scripts/marketing/prepare.mjs depart-roche Fwd 52-grand-banks-bonum-vitae
node scripts/marketing/capture.mjs slip-fwd 10 sk
node scripts/marketing/prepare.mjs arrive-roche Fwd
node scripts/marketing/capture.mjs roche-fwd 12 wi
node scripts/marketing/prepare.mjs arrive-roche Fwd
node scripts/marketing/capture.mjs turn-fwd 12 wk

# Fleet swaps
node scripts/marketing/prepare.mjs arrive-roche Fwd 86-nordhavn-serendipity
node scripts/marketing/capture.mjs nordhavn-fwd 10 wi
node scripts/marketing/prepare.mjs arrive-roche Fwd 2005-chris-craft-corsair-36
node scripts/marketing/capture.mjs corsair-fwd 12 wi
node scripts/marketing/prepare.mjs arrive-roche Fwd 2026-cranchi-e26-rider
node scripts/marketing/capture.mjs cranchi-fwd 12 wi

# Islands and the restart moment
node scripts/marketing/prepare.mjs arrive-roche-passage Fwd 52-grand-banks-bonum-vitae
node scripts/marketing/capture.mjs islands-fwd 12 wi
node scripts/marketing/prepare.mjs depart-roche Fwd
node scripts/marketing/capture.mjs damage-fwd 12 wi turbo
```

Use `node scripts/marketing/detail.mjs chart` to capture `.release-media/raw/chart.png` from the expanded Roche plotter at a 1920 × 1080 viewport, using the 600 m range. Use `node scripts/marketing/detail.mjs helm` after setting up a Grand Banks arrival to save the actual instrument-panel detail with opposing throttles. The crop in the editor expects the plotter bounds from that viewport. Use a current screenshot; never include imported personal route data in a release capture.

For a complete refresh of the motion takes, `node scripts/marketing/capture-all.mjs` runs the capture sequence above in order, including the helm detail. Capture the plotter separately with `detail.mjs chart`.

Then render:

```bash
python3 scripts/marketing/score.py
python3 scripts/marketing/render.py
python3 scripts/marketing/finalize.py
```

`render.py` makes the long film first and writes a source timeline to `.release-media/edit/timeline.json`. `finalize.py` calls the short-film renderer using that timeline, then generates all web assets and captions. Original takes and intermediate files stay in ignored `.release-media/`; only the compact final release assets belong in `public/media/`.

Watch both exports all the way through, with sound, before sharing a new edit. Check the portrait title margins, every cut, the final URL, and any handling claim against the recorded scene.

## Ready-to-use post copy

**Short:** The last 50 feet are the best part. I built a boat simulator for practicing twin-screw approaches in the San Juans. Seven boat profiles, independent levers, and unlimited “let me try that again.” Take the helm: https://boat-sim-lake.vercel.app

**Long:** This started with a Grand Banks charter and a wish for more practice before bringing family and friends into an unfamiliar slip. Boat-sim now has independent throttles, prop walk, wind and current, a chart plotter, and seven boat profiles. If you know a harbor, handle a boat, or like tinkering with a USB helm, come try it and tell me what needs work. Play at https://boat-sim-lake.vercel.app — code and contributions at https://github.com/elsigh/boat-sim
