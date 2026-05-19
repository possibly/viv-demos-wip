// causal-actions — host adapter and 200-tick simulation loop.

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

const LOCATION_DATA = [
  ["the-post-office", "The Post Office"],
  ["the-tavern", "The Tavern"],
  ["the-bowling-alley", "The Bowling Alley"],
  ["the-station-platform", "The Station Platform"],
];

const ITEM_DATA = [
  ["postcard-1", "Postcard № 1", "the-post-office"],
  ["postcard-2", "Postcard № 2", "the-post-office"],
  ["bathroom-wall", "The Tavern Bathroom Wall", "the-tavern"],
  ["napkin", "A Cocktail Napkin", "the-tavern"],
  ["bowling-trophy", "The Bowling Trophy", "the-bowling-alley"],
];

const CHARACTER_DATA = [
  ["slothrop", "Slothrop"],
  ["oedipa", "Oedipa"],
  ["pig-bodine", "Pig Bodine"],
  ["mucho", "Mucho"],
  ["pierce", "Pierce"],
  ["koteks", "Koteks"],
];

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

  const highParanoiaIdx = new Set();
  while (highParanoiaIdx.size < 2) highParanoiaIdx.add(Math.floor(rng() * CHARACTER_DATA.length));

  for (let i = 0; i < CHARACTER_DATA.length; i++) {
    const [id, name] = CHARACTER_DATA[i];
    const locId = pickRandom(rng, LOCATION_DATA.map(([lid]) => lid));
    const paranoia = highParanoiaIdx.has(i) ? 70 : 30 + Math.floor(rng() * 20);
    entities[id] = {
      entityType: EntityType.Character, id, name,
      location: locId, mood: 0, paranoia, memories: {},
      target_id: null,
    };
    characters.push(id);
  }

  return {
    timestamp: 0, entities, characters, locations, items,
    actions: [], vivInternalState: null,
  };
}

function snapshotPerCharacter(state) {
  return state.characters.map((id) => {
    const c = state.entities[id];
    return {
      id, name: c.name, location: c.location, locationName: state.entities[c.location].name,
      paranoia: c.paranoia, memoryCount: Object.keys(c.memories ?? {}).length,
    };
  });
}

function snapshotItems(state) {
  return state.items.map((id) => {
    const it = state.entities[id];
    return {
      id, name: it.name, location: it.location, locationName: state.entities[it.location].name,
      inscriptionCount: Array.isArray(it.inscriptions) ? it.inscriptions.length : 0,
    };
  });
}

export async function runSim(
  { initializeVivRuntime, selectAction, tickPlanner, EntityType },
  bundle, seedStr, tickCount,
) {
  const rng = mulberry32(hashSeed(seedStr));
  const state = buildInitialState(EntityType, rng);

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
      state.entities[characterID].memories[actionID] = memory;
    },
    saveItemInscriptions: (itemID, inscriptions) => {
      state.entities[itemID].inscriptions = inscriptions;
    },
    functions: {
      // Returns the most recent scrawl-on-wall action ID as a single-element list
      // (or empty list). Used by mistake-identity's @past-scrawl casting pool to
      // import a sign-reading lineage into the mail lineage — engineering the
      // cross-lineage convergence the trystero-arc pattern lives or dies on.
      recentScrawl: () => {
        for (let i = state.actions.length - 1; i >= 0; i--) {
          const a = state.entities[state.actions[i]];
          if (a?.name === "scrawl-on-wall") return [state.actions[i]];
        }
        return [];
      },
    },
    debug: { validateAPICalls: true, watchlists: {} },
  };

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

    if (tickPlanner) await tickPlanner();

    const order = [...state.characters].sort(() => rng() - 0.5);
    for (const cid of order) {
      try { await selectAction({ initiatorID: cid }); }
      catch (e) { /* role casting may fail when no co-present chars match — that's fine */ }
    }

    state.timestamp += 1;

    const newActionIDs = state.actions.filter((id) => !actionsBefore.has(id));
    const events = newActionIDs.map((id) => {
      const a = state.entities[id];
      return {
        id,
        actionName: a.actionName ?? a.name ?? "(action)",
        text: a.report ?? a.gloss ?? "(action)",
        tags: a.tags ?? [],
        timestamp: a.timestamp,
      };
    });

    ticks.push({
      index: t,
      timestamp: state.timestamp,
      events,
      characters: snapshotPerCharacter(state),
      items: snapshotItems(state),
      totalActions: state.actions.length,
    });
  }

  return { ticks, state };
}

export function summarize(tick) {
  const eventCount = tick.events.length;
  const paranoid = tick.characters.filter((c) => c.paranoia >= 60).length;
  return `events=${eventCount}  paranoid≥60=${paranoid}  totalActions=${tick.totalActions}`;
}
