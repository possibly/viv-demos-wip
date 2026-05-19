#!/usr/bin/env node
// Iterate seeds, run all 3 sifting patterns, count convergence indicators.
// Run from project root: node demos/causal-actions/find-seed.mjs

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = new URL('../..', import.meta.url).pathname;
const require = createRequire(import.meta.url);
const runtime = require(resolve(root, 'viv/runtimes/js/dist/index.cjs'));
const bundle = JSON.parse(readFileSync(resolve(root, 'demos/causal-actions/bundle.json'), 'utf8'));
const { runSim } = await import(resolve(root, 'demos/causal-actions/sim.mjs'));

const TICKS = 200;
const SEED_COUNT = parseInt(process.argv[2] ?? "60", 10);

const results = [];
for (let s = 1; s <= SEED_COUNT; s++) {
  const seed = `s${s}`;
  try {
    await runSim(runtime, bundle, seed, TICKS);
    const trystero = await runtime.runSiftingPattern({ patternName: "the-trystero-arc" });
    const flight = await runtime.runSiftingPattern({ patternName: "mistaken-flight" });
    const cascade = await runtime.runSiftingPattern({ patternName: "gossip-cascade" });

    let trysteroDiagram = "";
    let convergenceCount = 0;
    if (trystero) {
      trysteroDiagram = await runtime.constructSiftingMatchDiagram({
        siftingMatch: trystero, ansi: false, elide: true,
      });
      convergenceCount = (trysteroDiagram.match(/─┼ ⋮|⋯/g) || []).length;
    }

    const all3 = trystero && flight && cascade;
    results.push({ seed, trystero: !!trystero, flight: !!flight, cascade: !!cascade, convergenceCount, all3 });
    console.error(`${seed}\t T=${!!trystero} F=${!!flight} C=${!!cascade}  conv=${convergenceCount}`);
  } catch (e) {
    console.error(`${seed}\tERROR: ${e.message}`);
  }
}

const matched = results.filter(r => r.all3);
const best = matched.sort((a, b) => b.convergenceCount - a.convergenceCount)[0];

console.error(`\n${matched.length}/${results.length} seeds matched all 3 patterns`);
if (best) {
  console.error(`Best seed: ${best.seed} with ${best.convergenceCount} convergence indicators in trystero diagram`);
  console.log(best.seed);
} else {
  console.error("No seed matched all three patterns");
  process.exit(1);
}
