# viv-demos-wip

Browser demos for the [Viv](https://github.com/siftystudio/viv) emergent-narrative engine. Each demo runs a Viv simulation in the browser and lets you step through ticks.

## Demos

- **01-hello-world** — three characters in a tavern who greet each other
- **mmo** — the game, the players and their online communities
- **promweek** - promweek remake focused on viv integration
- **causal-actions** — Pynchonian gnarl with three sifting patterns over the chronicle
- **rootwork** — garden game; plants run multi-phase life plans, you and nature both satisfy the conditions
- **ide** — a web IDE for Viv: write source, compile, generate snapshots, scrub the chronicle, trace causal trees, and run sifting patterns

Open `index.html` to browse them, or view them on GitHub Pages.

The **ide** demo additionally needs a local compile server (the browser can't run the Python compiler):

```
node scripts/ide-server.mjs            # serves the repo + a /compile endpoint on :8080
```

Then open <http://localhost:8080/demos/ide/>. Without it the IDE still loads (snapshots, scrubbing, causal trees, and sifting all work against the checked-in bundle); only live recompilation is disabled.

## Dev setup

```
./scripts/setup.sh
```

Initializes the `viv/` submodule (the runtime source), builds `shared/viv-runtime.js`, and installs `vivc` (the Viv compiler). Run once per environment.

```
make compile   # recompile all sim.viv → bundle.json
make runtime   # rebuild shared/viv-runtime.js from viv/
```

To run a demo headlessly in Node (no browser needed):

```
node scripts/run-sim.mjs mmo 10 greenvale
```

## Demo structure

Each demo folder contains:

| File | Purpose |
|---|---|
| `sim.viv` | Viv source — actions, roles, effects |
| `bundle.json` | Compiled output (checked in; regenerate with `make compile`) |
| `sim.mjs` | Shared sim logic — exports `runSim(runtime, bundle, seed, ticks)` and `summarize(tick)` |
| `main.js` | Browser entry point — fetches bundle, passes runtime, renders DOM |
| `index.html` / `style.css` | Browser UI |

`sim.mjs` is the only file that matters for logic. Both the browser (`main.js`) and the Node runner (`scripts/run-sim.mjs`) import from it and inject their respective runtime — browser bundle or Node CJS build — as a parameter. Same code, two environments, no duplication.
