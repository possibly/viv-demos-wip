#!/usr/bin/env node
// Usage: node scripts/run-sim.mjs <demo-name> [ticks] [seed]
// Example: node scripts/run-sim.mjs 01-hello-world 5 hello

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const require = createRequire(import.meta.url);
const root = new URL('..', import.meta.url).pathname;
const { initializeVivRuntime, selectAction, EntityType } =
  require(resolve(root, 'viv/runtimes/js/dist/index.cjs'));

const [,, demo = '01-hello-world', ticksArg = '5', seed = 'hello'] = process.argv;
const bundlePath = resolve(root, 'demos', demo, 'bundle.json');
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));

// Seeded PRNG (mulberry32)
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h) || 1;
}
function makeUUID(rng) {
  const b = Array.from({ length: 16 }, () => Math.floor(rng() * 256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return b.map((v, i) => ([4, 6, 8, 10].includes(i) ? '-' : '') + v.toString(16).padStart(2, '0')).join('');
}
const setIn = (obj, path, value) => {
  const parts = Array.isArray(path) ? path : String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
};

// Load the demo's own initial state builder if present, otherwise use generic
let buildInitialState;
try {
  ({ buildInitialState } = await import(resolve(root, 'demos', demo, 'state.mjs')));
} catch {
  // Fallback: bare state — the demo's sim.viv must not require specific entities
  buildInitialState = () => ({
    timestamp: 0, entities: {}, characters: [], locations: [], items: [], actions: [], vivInternalState: null,
  });
}

const tickCount = Math.max(1, parseInt(ticksArg, 10) || 5);
const rng = mulberry32(hashSeed(seed));
const state = buildInitialState();

const adapter = {
  provisionActionID: () => makeUUID(rng),
  rng,
  getEntityView: (id) => structuredClone(state.entities[id]),
  getEntityLabel: (id) => state.entities[id]?.name ?? id,
  updateEntityProperty: (id, path, value) => setIn(state.entities[id], path, value),
  saveActionData: (id, data) => {
    if (state.entities[id] === undefined) state.actions.push(id);
    state.entities[id] = data;
  },
  getCurrentTimestamp: () => state.timestamp,
  getEntityIDs: (type, locationID) => {
    if (locationID) {
      if (type === EntityType.Character) return state.characters.filter((id) => state.entities[id].location === locationID);
      if (type === EntityType.Item) return state.items.filter((id) => state.entities[id].location === locationID);
      throw new Error(`invalid type for location query: ${type}`);
    }
    switch (type) {
      case EntityType.Character: return [...state.characters];
      case EntityType.Item: return [...state.items];
      case EntityType.Location: return [...state.locations];
      case EntityType.Action: return [...state.actions];
      default: throw new Error(`invalid entity type: ${type}`);
    }
  },
  getVivInternalState: () => structuredClone(state.vivInternalState),
  saveVivInternalState: (s) => { state.vivInternalState = structuredClone(s); },
  saveCharacterMemory: (characterID, actionID, memory) => {
    if (!state.entities[characterID].memories) state.entities[characterID].memories = {};
    state.entities[characterID].memories[actionID] = memory;
  },
  saveItemInscriptions: (itemID, inscriptions) => {
    state.entities[itemID].inscriptions = inscriptions;
  },
  debug: { validateAPICalls: true, watchlists: {} },
};

initializeVivRuntime({ contentBundle: bundle, adapter });

console.log(`demo: ${demo}  seed: ${seed}  ticks: ${tickCount}\n`);

for (let t = 0; t < tickCount; t++) {
  const actionsBefore = new Set(state.actions);
  for (const cid of state.characters) {
    await selectAction({ initiatorID: cid });
  }
  state.timestamp += 10;

  const newIDs = state.actions.filter((id) => !actionsBefore.has(id));
  const events = newIDs.map((id) => state.entities[id].report ?? state.entities[id].gloss ?? '(action)');
  const chars = state.characters.map((id) => state.entities[id]);

  console.log(`tick ${t + 1}  (T=${state.timestamp})`);
  if (events.length) events.forEach((e) => console.log(`  ▸ ${e}`));
  else console.log('  (no events)');
  chars.forEach((c) => console.log(`  ${c.name}: mood=${c.mood}`));
  console.log();
}
