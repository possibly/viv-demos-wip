# viv-demos-wip

Browser demos for the [Viv](https://github.com/siftystudio/viv) emergent-narrative engine.

## Setup

Run once per session before any Viv work:

```
./scripts/setup.sh
```

This initializes `viv/` (the `possibly/viv` fork, `browser/runtime` branch — git submodule), builds `shared/viv-runtime.js` from it, and installs `vivc` (the compiler) via pip3.

## How it works

Each demo has a `sim.viv` (Viv source) compiled to `bundle.json` via `vivc`. The browser loads both `bundle.json` and `shared/viv-runtime.js`, and the host app implements a `HostApplicationAdapter` that drives a `selectAction()` tick loop. See `demos/01-hello-world/main.js` for the full pattern.

- `make compile` — recompile all demos
- `make runtime` — rebuild `shared/viv-runtime.js` from `viv/`
- `make serve` — serve on port 8080

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
| `setup` | Full Viv install walkthrough (not needed here — use `./scripts/setup.sh`) |
