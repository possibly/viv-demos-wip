#!/usr/bin/env node
// Usage: node scripts/run-sim.mjs <demo-name> [ticks] [seed]
// Example: node scripts/run-sim.mjs mmo 10 greenvale

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const [,, demo = '01-hello-world', ticksArg = '5', seed = 'hello'] = process.argv;

const root = new URL('..', import.meta.url).pathname;
const require = createRequire(import.meta.url);

const { runSim, summarize } = await import(resolve(root, 'demos', demo, 'sim.mjs'));
const runtime = require(resolve(root, 'viv/runtimes/js/dist/index.cjs'));
const bundle = JSON.parse(readFileSync(resolve(root, 'demos', demo, 'bundle.json'), 'utf8'));
const tickCount = Math.max(1, parseInt(ticksArg, 10) || 5);

const result = await runSim(runtime, bundle, seed, tickCount);

console.log(`demo: ${demo}  seed: ${seed}  ticks: ${tickCount}\n`);
for (const tick of result.ticks) {
  console.log(`tick ${tick.index + 1}  (T=${tick.timestamp})`);
  if (tick.events.length) tick.events.forEach(e => console.log(`  ▸ ${e.text ?? e}`));
  else console.log('  (no events)');
  console.log(' ', summarize(tick));
  console.log();
}
