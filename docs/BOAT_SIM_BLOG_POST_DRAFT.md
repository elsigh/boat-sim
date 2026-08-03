---
title: "I Built a Docking Simulator Because I Was Nervous About a 52-Foot Boat"
description: "How an upcoming San Juan Islands cruise, an Airbus throttle quadrant, real marina maps, and a small fleet of coding agents became a bespoke Grand Banks docking simulator."
date: 2026-07-14
draft: true
tags:
  - boats
  - simulation
  - ai
  - nextjs
  - threejs
  - hardware
image: /images/boat-sim/hero.jpg
---

<!--
Publication draft for Lindsey's personal Next.js site.

Before publishing:
- Adapt the frontmatter keys and image paths to the blog's conventions.
- Resolve every TODO(author) marker.
- Confirm whether “55-foot” is conversationally preferable to the boat's listed 52-foot model length.
- Confirm the purchased controller's exact retail name. Repository history points to the
  Thrustmaster TCA Quadrant Airbus Edition; the supplied research summary also mentions a TWCS.
- Add the original Gemini research excerpts and their dates.
- Confirm whether the public Vercel deployment should be linked.
-->

I’m anxious—maybe even a little paranoid—about piloting a roughly 55-foot Grand Banks around Puget Sound this August.

The boat is *Bonum Vitae*, a 52-foot Grand Banks Heritage Motoryacht that displaces about 58,000 pounds. At the end of August 2026, I’m supposed to captain it through the San Juan Islands with family and friends aboard. I trained on similar boats about five years ago, but five years is enough time for confidence to turn back into theory—especially when the theory involves easing 29 tons of boat into a narrow slip while wind and current try to negotiate a different arrangement.

So I did what any reasonably anxious programmer might do to ease his mind: I started building a simulator.

> TODO(author): Decide whether to retain “roughly 55-foot” in the opening or use the technically precise “52-foot” throughout. The charter listing and simulator catalog call *Bonum Vitae* a Grand Banks 52.

## The problem I actually wanted to solve

This was never meant to be a general boating game. It was closer to rehearsal.

Our planned cruise starts in Bellingham and runs through places we expect to visit in real life: Fossil Bay at Sucia Island, Reid Harbor, Roche Harbor, Friday Harbor, Jones Island, Eagle Harbor, and back to Bellingham. The situations that occupied my mind were not open-water navigation or running at cruising speed. They were the slow moments at either end of a leg: leaving a float, entering an unfamiliar marina, turning inside a basin, judging the remaining momentum, and making several small control inputs before one large correction became necessary.

A twin-screw motoryacht does not steer like a car at those speeds. Put the port engine ahead and the bow should turn to starboard. Reverse a handed propeller and prop walk nudges the stern sideways. A bow thruster can help, but it works at the bow rather than magically sliding the entire vessel. When the throttles return to neutral, 58,000 pounds do not return to neutral with them.

That inertia was the core of what I wanted to practice: not merely which lever to move, but how early to move it and how long to wait for the boat to answer.

<!-- Suggested visual: wide hero screenshot approaching a recognizable marina berth. -->

## First, I almost bought a real marine control head

My initial instinct was maximal fidelity. I looked at using a real Glendinning CH2001 ProGrade twin-lever control—the kind of hardware that would not feel like a game controller because it is not one.

That idea did not survive contact with the integration details.

A commercial marine control head can cost upward of $1,500 and communicates through marine and industrial systems such as CAN bus and SAE J1939, not as a friendly USB game controller. Connecting one to a browser would have meant buying a precision piece of boat equipment, bypassing or replacing its electronics, and building an interface around it. I had wandered well over my skis: the project had gone from “practice docking” to “learn embedded electronics by modifying safety-critical marine hardware.”

The point was to reduce anxiety, not manufacture a new category of it.

### The gloriously plausible DIY option

There was a more approachable version of the same idea. I could buy a $200 mechanical dual-lever marine throttle, open the housing, attach a pair of 10k linear potentiometers to the lever pivots, and connect them to a Leo Bodnar BU0836A 12-bit USB interface board. The Bodnar board would present the result as a standard USB HID controller without requiring a custom driver—and, in its simplest configuration, without soldering.

I still like this option. It is physical, legible, and satisfyingly direct. It is also its own hardware project, and I wanted to find out whether the simulator itself was useful before fabricating a helm for it.

## The airplane throttle that became a boat throttle

I eventually landed on a pragmatic proxy: a Thrustmaster aviation throttle quadrant. The hardware was designed for an Airbus rather than a Grand Banks, but it offered the thing that mattered most—two independent physical levers that a web browser could read through the Gamepad API on macOS.

<!-- TODO(author): Confirm exact purchased product name. Likely “Thrustmaster TCA Quadrant Airbus Edition.” -->

The mismatch between airplane and boat controls turned out to be productive. It forced the simulator to acknowledge that commodity controllers have their own geometry:

- A pair of axes may arrive in the opposite order from the labels I assign to port and starboard.
- An aviation lever’s physical idle detent may sit near one end of its axis rather than at the center.
- Some throttles expose only one long slider, which needs a different mapping from two independent levers.

The simulator now supports both kinds of input. Its default dual-axis mode maps one lever to each engine. A persistent **Swap Levers** setting handles hardware whose axes arrive reversed. **Set Lever Idle** samples each physical detent and remaps travel above it to ahead and below it to astern. The alternative split-slider mode turns a single axis into a pair of mutually exclusive commands: above the neutral midpoint drives the port engine ahead, while below it drives the starboard engine astern.

That last mapping is not a complete twin-screw helm—you cannot independently command every port/starboard and ahead/astern combination with one slider—but it was a useful experiment and remains supported in the input layer. The two-lever TCA arrangement is much closer to the muscle memory I wanted.

### The original hardware research

> TODO(author): Insert selected excerpts from the original Gemini conversations here. Useful material would include:
>
> 1. The initial request and constraints.
> 2. Why the Glendinning unit was attractive.
> 3. The discovery of its CAN/J1939 integration requirements.
> 4. The Pactrade/Rareelectrical plus Leo Bodnar design.
> 5. The comparison that led to the Thrustmaster purchase.
> 6. A photograph of the final desk setup and the exact product name.

<!-- Suggested treatment: a compact “decision log” with option, cost, fidelity, and integration effort. -->

## A simulator shaped like the actual trip

The first Git commit, on April 22, 2026, was nothing more than a stock Create Next App project. By May 10, a Codex worktree snapshot contained the first recognizable simulator: a boat catalog, a Grand Banks configuration, engine state and audio, gamepad input, a physics model, an early dock, and the itinerary for the August cruise.

The project changed character on July 4. A single large commit replaced the generic exercise with a data-driven marina system based on official marina maps and OpenStreetMap float outlines. Squalicum Harbor, Roche Harbor, Friday Harbor, Fossil Bay, Reid Harbor, Jones Island, and Eagle Harbor became individual practice environments with their own docks, pilings, berths, wind, and current.

That commit also documents a useful truth about simulation work: the physics had been wrong in four different ways.

Forces were accumulating between Rapier steps. Port and starboard had become mirrored. Prop walk pointed the wrong way. A collision configuration intended to pin the boat to the water plane had inadvertently stopped the hull from colliding with docks. Fixing those issues mattered more than adding visual detail because a beautiful simulator that teaches the wrong response is worse than no simulator at all.

The corrected model applies thrust at each engine’s lateral position across the Grand Banks’ 15-foot-5-inch beam. Port ahead yaws the bow to starboard. Reverse thrust is weaker than forward thrust. Left- and right-handed propellers produce different transverse forces. Wind acts on the boat’s exposed area; current changes its velocity through the water; nonlinear drag resists surge, sway, and yaw. The bow thruster applies a lateral force near the bow rather than to the center of mass.

Most importantly, the engine controls answer quickly while the hull does not. An early version made the throttle itself take roughly four seconds to move from idle to full, which felt like input latency. The revised version lets the diesel respond in a fraction of a second and leaves the sensation of delay where it belongs: in 26 metric tons of boat, water resistance, and propeller slip.

<!-- Suggested visual: annotated top-down diagram showing the two prop forces, engine offsets, bow-thruster force, wind, and current. -->

## Building familiarity, not certification

The visual model is generated parametrically in Three.js rather than imported as a finished 3D asset. It has the cues I care about when maneuvering: the Grand Banks hull proportions, cockpit, covered aft deck, flybridge, swim platform, and the relationship between bow, stern, and dock. The water shader, prop wash, bow-thruster wash, fenders, bull rails, pilings, and berth markers make control inputs easier to read.

The interface adds the information I would want while learning: distance to the target berth, closure rate, lateral offset, angle, wind and current indicators, and a line that continuously points from the boat to the selected berth. There is a calm mode for isolating boat handling before adding environmental forces.

The experience begins cold, with both diesels shut down. Starting the engines is part of the ritual. Their sound is synthesized in the browser as a shaped combustion pulse with rumble and exhaust noise. The port and starboard firing rates differ slightly so they drift in and out of phase, producing that characteristic twin-diesel beat.

And because this is still a personal project, a genuinely clean docking triggers fireworks, three jumping dolphins, and dock lines thrown to the bow and stern. Training aids do not have to be joyless.

This is not a certified marine-training product, nor is it a hydrodynamic prediction of what *Bonum Vitae* will do in every condition. The force values and drag curves are tuned approximations. What it can provide is repetition: the habit of thinking in independent engines, anticipating momentum, watching the stern as well as the bow, and making deliberate corrections before panic takes over.

## The control system I did not emulate—yet

The real Glendinning installation offers helm behaviors such as Warm Mode, Sync Mode, and Slow Mode. Those remain useful reference points for future fidelity:

- **Warm Mode** permits engine revving while the transmissions remain in neutral.
- **Sync Mode** coordinates engine RPM.
- **Slow Mode** softens or limits the control curve for fine maneuvering.

The current simulator models engine masters, ignition and startup, independent ahead/astern commands, a brief gearbox transition through neutral, nonlinear throttle response, and bow-thruster input. It does **not** yet claim to reproduce the Glendinning modes above. Slow Mode in particular would make a sensible future addition for comparing unrestricted lever response with a marina-oriented control curve.

## The stack: a web app that became a Mac app

The simulator began as a Next.js App Router project that could run and deploy as a normal web application. React Three Fiber and Three.js render the scene, `@react-three/rapier` supplies rigid-body collision and integration, and the browser’s Gamepad API reads the throttle quadrant without a custom driver.

By July 7, it had also become an offline macOS application. The Next.js app statically exports to files bundled inside Electron, whose Chromium renderer provides reliable Gamepad API access for the TCA quadrant. Electron Builder produces a DMG or ZIP, and the project includes Developer ID signing and notarization support so a build can be shared with friends without asking them to run a development server.

That progression—from Vercel-friendly web application to signed offline desktop simulator—was not a rewrite. The browser was still the runtime; Electron simply made the browser, assets, and controller support into one self-contained application.

> TODO(author): Add the public Vercel URL if the deployment is still live and intended to be shared.

## The agents in the machine

This was an AI-assisted build involving Codex and Claude, but Git history usually flattens that kind of collaboration into a human author name and a commit message. I had installed `git-ai`, which records more granular authorship metadata in Git notes under `refs/notes/ai`.

The notes do not contain transcripts of my conversations. They do preserve agent session IDs, model names, prompt IDs, line ranges, and counts of generated lines that remained accepted at commit time. That makes them useful evidence, as long as “authorship” is not confused with product intent. The agents generated and revised code; I supplied the reason for the project, chose the hardware and scenarios, evaluated behavior, noticed when reality and simulation disagreed, and decided what to keep asking for.

The July 4 marina-and-physics commit is the clearest example of the collaboration. Its `git-ai` record attributes 7,280 accepted added lines:

| Tool | Recorded model | Accepted added lines |
| --- | --- | ---: |
| Claude | `claude-fable-5` | 6,904 |
| Codex | `gpt-5.5` | 371 |
| Codex | `gpt-5.4` | 5 |

The May 10 simulator snapshot is labeled as Codex-co-authored in its commit message, although it does not have a corresponding `git-ai` note. From the July 4 milestone onward, the recorded product commits primarily identify Claude Fable 5; the pivotal July 4 commit also retains Codex GPT-5.4 and GPT-5.5 contributions. The notes therefore let me describe the model history with more confidence than memory alone, but they cannot reconstruct the original prompts or the many human decisions between generated patches.

This is one reason I want to preserve the Gemini hardware conversations separately: source control can show how the software changed, but not necessarily why I decided an Airbus throttle quadrant was a saner boat control than a $1,500 marine CAN-bus unit.

<!-- Suggested visual: a short horizontal timeline rather than an “AI percentage” pie chart. -->

## A six-day burst of iteration

Once the real marina system landed, the commit history reads almost like a build diary:

- **July 4:** Correct the physics; add real marina layouts and docking exercises.
- **July 4:** Add a HUD toggle and improve the camera and water presentation.
- **July 4:** Add controller-axis swapping and TCA idle-detent calibration.
- **July 4:** Repair world chirality end to end—physics, telemetry, marina coordinates, wind, current, and the mini-map.
- **July 4:** Rebuild the boat as a coherent Grand Banks profile.
- **July 4:** Add the cold-start ritual, followed later that day by fireworks, dolphins, and thrown dock lines.
- **July 5:** Separate fast engine response from slow hull response, then synthesize a twin-diesel sound.
- **July 6:** Add wind and current dials plus a live bearing line to the target berth.
- **July 7:** Package the simulator as an offline Electron app and create its bow-on Grand Banks icon.
- **July 8:** Add Developer ID signing and notarization, then upgrade the Next.js and TypeScript toolchain.
- **July 9:** Default each marina to an arrival exercise—the scenario I most wanted to rehearse.

The pace was fast, but the interesting work was iterative rather than magical. An agent could produce a plausible force model or marina layout quickly. Using the simulator exposed wrong signs, mirrored coordinate systems, misleading control lag, awkward calibration, and visual cues that did not match the real boat. Each pass made the next problem easier to feel.

## What I hope to get from it

I am not expecting an hour at my desk to substitute for time on the water. The simulator cannot reproduce the view from the flybridge, a gust curling around a marina building, the pressure of people watching from the dock, or the consequences that make a real approach feel real.

What I want is smaller and, I hope, achievable. When I step aboard in August, I want independent engine control to feel familiar again. I want to remember that neutral does not mean stopped, that the stern is part of every turn, and that a short correction followed by patience is often better than piling on another correction immediately.

The project began as a way to ease my mind. It became a map of the trip, a physics experiment, a controller-integration project, an offline Mac app, and a fairly detailed record of what it looks like to build software with several coding agents in the loop.

I am still nervous about captaining the boat.

But now I can practice being nervous before I leave the dock.

---

## Editorial source notes

<!-- This section can be removed from the published post or retained as a technical appendix. -->

### Repository evidence

- Repository: [elsigh/boat-sim](https://github.com/elsigh/boat-sim)
- Initial Create Next App commit: [`3fb46c5`](https://github.com/elsigh/boat-sim/commit/3fb46c504c227c481d87ab75a0256289c0511d8d)
- Codex worktree snapshot: [`07e04a4`](https://github.com/elsigh/boat-sim/commit/07e04a4d38a89562a14b1abb9669c0f259c4b6c5)
- Major marina and physics milestone: [`a6fbcb5`](https://github.com/elsigh/boat-sim/commit/a6fbcb5db111b1970913b4c73777e51424cc88b8)
- Reversed-axis support: [`af5b1d2`](https://github.com/elsigh/boat-sim/commit/af5b1d2745a5fee927787d356efaa4554a114364)
- TCA idle-detent calibration: [`c9483d1`](https://github.com/elsigh/boat-sim/commit/c9483d1d1097065195cdacf3844fedd153c2673e)
- Coordinate-system and chirality correction: [`1890cca`](https://github.com/elsigh/boat-sim/commit/1890ccafe8741a9f34e804aded0ad9b330b2ce5a)
- Grand Banks visual rebuild: [`35e27ef`](https://github.com/elsigh/boat-sim/commit/35e27eff2e5680bd186dc7e2040db12c87afdc27)
- Docking celebration: [`d1f7327`](https://github.com/elsigh/boat-sim/commit/d1f73274e8e6a2d96f79a766a485aaf7378a91ac)
- Engine-response correction: [`8358871`](https://github.com/elsigh/boat-sim/commit/83588710429d3ae4246ecca023e2228867890af4)
- Twin-diesel audio: [`cc3c7a2`](https://github.com/elsigh/boat-sim/commit/cc3c7a2e79db7fb0554c8ae584645cf748b7db85)
- Offline Electron packaging: [`575961a`](https://github.com/elsigh/boat-sim/commit/575961aac95c8eddb31f66b6db2ea2087bb3a827)
- Signing and notarization: [`6bc3f03`](https://github.com/elsigh/boat-sim/commit/6bc3f03d92469da6ddb5ba0ee9a4604f107d66fa)

### Claims to verify from personal research

- Exact Glendinning control-head model, current price, and protocol details.
- Exact mechanical-quadrant brands and prices considered.
- Exact Leo Bodnar interface model and whether the proposed configuration was truly solderless.
- Exact purchased Thrustmaster product name and whether a TWCS was purchased, merely considered, or used alongside the TCA quadrant.
- The phrase “training on similar boats about five years ago”: course, location, boat types, and any photograph worth including.
- Precise cruise dates. The checked-in scenario currently runs August 15–21, 2026, while the supplied narrative says “the end of August.”
- Whether “Puget Sound” or “Salish Sea / San Juan Islands” is the preferred geographic framing.

### Suggested media checklist

1. Hero image: *Bonum Vitae* approaching a simulated berth.
2. Real photograph or charter-listing image of *Bonum Vitae*, with permission and credit.
3. Photograph of the Thrustmaster quadrant on the desk.
4. Screenshot of the raw-axis calibration UI.
5. Before/after image of the generic dock and a recognizable Roche or Friday Harbor layout.
6. Top-down physics-force diagram.
7. Short GIF or video of differential thrust and hull momentum.
8. The dolphins, fireworks, and thrown dock lines after a successful arrival.
9. App icon and signed macOS DMG screenshot.
10. Compact agent/model timeline derived from the Git notes.
