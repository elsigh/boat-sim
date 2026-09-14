# Come aboard

Boat-sim gets better when people who handle real boats tell us what’s missing. You don’t need to be a programmer to contribute.

## Bring an observation

[Open an issue](https://github.com/elsigh/boat-sim/issues/new) with a specific boat, place, or maneuver. Useful reports include:

- **Handling:** boat profile, location, exercise, calm or typical conditions, throttle inputs, what happened, and what you expected. A clip helps. Tell us whether the comparison comes from a real boat, a manual, or an estimate.
- **Local knowledge:** the berth or fairway, what needs correcting, and a public source or a drawing you can share. Please don’t copy proprietary charts or marina photographs without permission.
- **Hardware:** controller model, browser, operating system, calibration, and which lever or button behaved unexpectedly.
- **First impressions:** where you got stuck, a label that confused you, or a feature you couldn’t find.

Keep private tracks and personal information out of public issues. A short, anonymized reproduction is usually enough.

## Bring a small improvement

Good starting points: a clearer control label, a better vessel profile, an arrival exercise, a documented hardware mapping, a hull detail, or a chart correction backed by a public source. Browse [existing issues](https://github.com/elsigh/boat-sim/issues) first. For a new region or a major physics change, describe the idea in an issue so we can agree on a useful scope.

1. Fork and clone the repository. Create a branch for your change.
2. Run `pnpm install` and `pnpm dev`.
3. Read [AGENTS.md](AGENTS.md). This project uses a Next.js preview version; check the installed guides in `node_modules/next/dist/docs/` before writing application code.
4. Make the change and replay the affected maneuver or UI flow.
5. Run `pnpm typecheck` and `pnpm build`. Add focused tests when a behavior change needs them.
6. Open a pull request describing what changes for the person at the helm, how to reproduce it, and what you checked. Include before/after screenshots or a short clip for visual changes.

For handling changes, also run:

```bash
bun test src/lib/sim/boat-physics.test.ts
```

For chart pipeline changes, run the geography checks described in the [chart notes](docs/SIMULATOR_GUIDE.md#charts). Changes must keep the rendered scene, plotter, berth, and bathymetry in agreement. Chart coordinates are east-positive; the render world is west-positive, mirrored once in `src/lib/marinas/index.ts`.

## Find your way around

| What you’re improving | Start here |
| --- | --- |
| Boat specs, handling parameters, helm materials | `src/lib/boats/` |
| Force model, collision damage, berth guidance | `src/lib/sim/` |
| Harbors, berths, approaches, local conditions | `src/lib/marinas/` |
| Survey data and charts | `scripts/charts/`, `src/lib/charts/` |
| Instruments, controls, plotter | `src/components/sim/helm/` |
| 3D boats, water, scenery | `src/components/sim/` |
| Public release films and images | [Media workflow](docs/MARKETING.md) |

The [simulator guide](docs/SIMULATOR_GUIDE.md) preserves the deeper engineering notes and the original build story. Keep simplified drivetrain and damage behavior clearly labeled; we want better practice, not unsupported claims of real-world accuracy.

Small contributions are welcome. So are patient explanations of what the bow should actually do.
