// ide — a generic Viv sandbox: a small ensemble of characters drifting between
// locations among a handful of inscribable items. The host knows nothing about
// the loaded bundle's actions; it just keeps co-presence churning and lets the
// runtime select actions each tick. This is the shared sim logic for both the
// Node runner (scripts/run-sim.mjs) and the browser IDE (main.js).
//
// Because the IDE compiles arbitrary user-authored .viv, the world is fixed and
// generic. Every character carries the full STATS bag (initialized to small
// values) so that numeric effects like `@x.mood += 5` never hit an undefined
// operand. Items carry `inscriptions`/`mentions` so inscription effects work.

const STATS = [
  "mood", "paranoia", "trust", "suspicion",
  "affection", "anger", "fear", "joy", "resolve", "energy",
];

const LOCATION_DATA = [
  ["the-cafe", "The Café"],
  ["the-park", "The Park"],
  ["the-office", "The Office"],
  ["the-station", "The Station"],
];

const ITEM_DATA = [
  // id, name, starting location
  ["a-letter", "A Letter", "the-office"],
  ["a-note", "A Folded Note", "the-cafe"],
  ["a-dossier", "A Sealed Dossier", "the-office"],
  ["a-notice-board", "The Notice Board", "the-park"],
  ["a-photograph", "A Photograph", "the-station"],
];

const CHARACTER_DATA = [
  ["mara", "Mara"],
  ["niels", "Niels"],
  ["odessa", "Odessa"],
  ["paz", "Paz"],
  ["quinn", "Quinn"],
  ["rui", "Rui"],
];

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
  return b.map((v, i) => ([4, 6, 8, 10].includes(i) ? "-" : "") + v.toString(16).padStart(2, "0")).join("");
}

function pickRandom(rng, arr) {
  if (arr.length === 0) return null;
  return arr[Math.floor(rng() * arr.length)];
}

const setIn = (obj, path, value) => {
  const parts = Array.isArray(path) ? path : String(path).split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
};

function buildInitialState(EntityType, rng) {
  const entities = {};
  const locations = [];
  const items = [];
  const characters = [];

  for (const [id, name] of LOCATION_DATA) {
    entities[id] = { entityType: EntityType.Location, id, name };
    locations.push(id);
  }
  for (const [id, name, locId] of ITEM_DATA) {
    entities[id] = {
      entityType: EntityType.Item, id, name,
      location: locId, inscriptions: [], mentions: null,
    };
    items.push(id);
  }

  // Two characters start notably on-edge so paranoia-gated climaxes can fire.
  const onEdge = new Set();
  while (onEdge.size < 2) onEdge.add(Math.floor(rng() * CHARACTER_DATA.length));

  for (let i = 0; i < CHARACTER_DATA.length; i++) {
    const [id, name] = CHARACTER_DATA[i];
    const c = {
      entityType: EntityType.Character, id, name,
      location: pickRandom(rng, locations),
      memories: {}, target_id: null,
    };
    for (const stat of STATS) c[stat] = Math.floor(rng() * 12);
    if (onEdge.has(i)) c.paranoia = 65 + Math.floor(rng() * 10);
    entities[id] = c;
    characters.push(id);
  }

  return {
    timestamp: 0, entities, characters, locations, items,
    actions: [], vivInternalState: null,
  };
}

function makeAdapter(state, EntityType, rng) {
  return {
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
      state.entities[characterID].memories[actionID] = memory;
    },
    saveItemInscriptions: (itemID, inscriptions) => {
      state.entities[itemID].inscriptions = inscriptions;
    },
    functions: {
      // Generic casting-pool helpers, available to any loaded bundle via `~name()`.
      // Return the most recent action with the given name as a single-element list.
      recentActionNamed: (name) => {
        for (let i = state.actions.length - 1; i >= 0; i--) {
          const a = state.entities[state.actions[i]];
          if (a?.actionName === name || a?.name === name) return [state.actions[i]];
        }
        return [];
      },
      // The single most recent action of any kind (or empty list).
      lastAction: () => (state.actions.length ? [state.actions[state.actions.length - 1]] : []),
    },
    debug: { validateAPICalls: true, watchlists: {} },
  };
}

function snapshotCharacters(state) {
  return state.characters.map((id) => {
    const c = state.entities[id];
    const stats = {};
    for (const s of STATS) stats[s] = c[s] ?? 0;
    return {
      id, name: c.name,
      location: c.location,
      locationName: state.entities[c.location]?.name ?? c.location,
      stats,
      target: c.target_id ? (state.entities[c.target_id]?.name ?? c.target_id) : null,
      memoryCount: Object.keys(c.memories ?? {}).length,
    };
  });
}

function snapshotItems(state) {
  return state.items.map((id) => {
    const it = state.entities[id];
    return {
      id, name: it.name,
      location: it.location,
      locationName: state.entities[it.location]?.name ?? it.location,
      mentions: it.mentions ? (state.entities[it.mentions]?.name ?? it.mentions) : null,
      inscriptionCount: Array.isArray(it.inscriptions) ? it.inscriptions.length : 0,
    };
  });
}

export const WORLD = {
  stats: STATS,
  locations: LOCATION_DATA.map(([id, name]) => ({ id, name })),
  items: ITEM_DATA.map(([id, name, location]) => ({ id, name, location })),
  characters: CHARACTER_DATA.map(([id, name]) => ({ id, name })),
};

export async function runSim(
  { initializeVivRuntime, selectAction, tickPlanner, EntityType },
  bundle, seedStr, tickCount,
) {
  const rng = mulberry32(hashSeed(seedStr));
  const state = buildInitialState(EntityType, rng);
  const adapter = makeAdapter(state, EntityType, rng);

  initializeVivRuntime({ contentBundle: bundle, adapter });

  const ticks = [];

  for (let t = 0; t < tickCount; t++) {
    // Move 1–2 random characters to keep co-presence churning.
    const moves = 1 + (rng() < 0.4 ? 1 : 0);
    for (let m = 0; m < moves; m++) {
      const charId = pickRandom(rng, state.characters);
      const newLoc = pickRandom(rng, state.locations.filter((l) => l !== state.entities[charId].location));
      if (newLoc) state.entities[charId].location = newLoc;
    }

    const actionsBefore = new Set(state.actions);

    if (tickPlanner) { try { await tickPlanner(); } catch { /* no planner content is fine */ } }

    const order = [...state.characters].sort(() => rng() - 0.5);
    for (const cid of order) {
      // Role casting / conditions may legitimately fail (no co-present match,
      // non-numeric operand on an unknown property, etc.) — that just means the
      // character takes no action this turn.
      try { await selectAction({ initiatorID: cid }); } catch { /* skip */ }
    }

    state.timestamp += 1;

    const newActionIDs = state.actions.filter((id) => !actionsBefore.has(id));
    const events = newActionIDs.map((id) => {
      const a = state.entities[id];
      return {
        id,
        actionName: a.actionName ?? a.name ?? "(action)",
        text: a.report ?? a.gloss ?? a.actionName ?? a.name ?? "(action)",
        tags: a.tags ?? [],
        timestamp: a.timestamp ?? state.timestamp,
        causes: Array.isArray(a.causes) ? a.causes : [],
        caused: Array.isArray(a.caused) ? a.caused : [],
      };
    });

    ticks.push({
      index: t,
      timestamp: state.timestamp,
      events,
      characters: snapshotCharacters(state),
      items: snapshotItems(state),
      totalActions: state.actions.length,
    });
  }

  return { ticks, state };
}

export function summarize(tick) {
  const onEdge = tick.characters.filter((c) => (c.stats.paranoia ?? 0) >= 60).length;
  return `events=${tick.events.length}  paranoid≥60=${onEdge}  totalActions=${tick.totalActions}`;
}
