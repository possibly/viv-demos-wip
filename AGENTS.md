# viv-demos-wip

Browser demos for the [Viv](https://github.com/siftystudio/viv) emergent-narrative engine.

## Setup

Run once per session before any Viv work:

```
./scripts/setup.sh
```

This initializes `viv/` (the `possibly/viv` fork, `browser/runtime` branch — git submodule), builds `shared/viv-runtime.js` from it, and installs `vivc` (the compiler) via pip3.

## How it works

Each demo has a `sim.viv` (Viv source) compiled to `bundle.json` via `vivc`. At runtime, the browser and Node runner each load the bundle and inject a runtime object — the browser uses the browser bundle at `shared/viv-runtime.js`; Node uses the CJS build at `viv/runtimes/js/dist/index.cjs`.

- `make compile` — recompile all demos
- `make runtime` — rebuild `shared/viv-runtime.js` from `viv/`
- `node scripts/run-sim.mjs <demo> [ticks] [seed]` — run a demo headlessly in Node, print tick-by-tick output. Use this to test `.viv` changes without a browser.
- `node scripts/test-web.mjs [actions...]` — Playwright test that serves the demo over HTTP and drives it in headless Chromium, simulating button clicks and asserting Jordan responds each turn. Use this to catch browser-runtime bugs that the Node runner won't surface.
- `node scripts/ide-server.mjs` (or `make ide`) — dev server for the `ide` demo: serves the repo statically and exposes `POST /compile`, which shells out to `vivc` so the browser can compile user-authored `.viv`. The `ide` demo needs this for live compilation; the rest of the demos are pure static.
- `node scripts/test-ide.mjs` — Playwright test for the `ide` demo: spawns the compile server, then drives compile → run → scrub → causal tree → sifting in headless Chromium.

## Demo convention

Every demo has a `sim.mjs` that exports:

- `runSim(runtime, bundle, seedStr, tickCount)` — full simulation loop; `runtime` is `{ initializeVivRuntime, selectAction, [attemptAction], EntityType }`
- `summarize(tick)` — one-line string summary of a tick for Node output

And a `main.js` that is a thin browser wrapper: fetch `bundle.json`, assemble the runtime object from the browser import, call `runSim`, render DOM. All sim logic lives in `sim.mjs` — `main.js` contains no logic.

When adding a new demo, follow this split. The Node runner (`scripts/run-sim.mjs`) works automatically with any demo that has a conforming `sim.mjs`.

## Viv reference

After setup, `viv/` contains the full Viv source tree (language spec, compiler, runtime, examples). Use it for lookups before guessing.

## Skills

Skills in `.agents/skills/` are available as `/viv:<name>`:

| Skill | Use for |
|---|---|
| `ask` | Questions about the Viv language |
| `write` | Authoring `.viv` files |
| `build` | Adapter and integration code (target the browser pattern here) |
| `fix` | Compiler and runtime errors |
| `design` | Storyworld and action-set design |
| `critique` | Reviewing `.viv` files |
| `study` | Deep investigation of Viv source or behavior |
