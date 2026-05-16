function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeUUID(rng) {
  const b = Array.from({ length: 16 }, () => Math.floor(rng() * 256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return b.map((v, i) => ([4, 6, 8, 10].includes(i) ? "-" : "") + v.toString(16).padStart(2, "0")).join("");
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h) || 1;
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

function buildInitialState(EntityType) {
  const entities = {};
  const locationID = "tavern";
  entities[locationID] = { entityType: EntityType.Location, id: locationID, name: "The Tavern" };
  for (const [id, name] of [["alice", "Alice"], ["bob", "Bob"], ["carol", "Carol"]]) {
    entities[id] = { entityType: EntityType.Character, id, name, location: locationID, mood: 0, memories: {} };
  }
  return { timestamp: 0, entities, characters: ["alice", "bob", "carol"], locations: [locationID], items: [], actions: [], vivInternalState: null };
}

export async function runSim({ initializeVivRuntime, selectAction, EntityType }, bundle, seedStr, tickCount) {
  const rng = mulberry32(hashSeed(seedStr));
  const state = buildInitialState(EntityType);

  const adapter = {
    provisionActionID: () => makeUUID(rng),
    rng,
    getEntityView: (id) => structuredClone(state.entities[id]),
    getEntityLabel: (id) => state.entities[id].name,
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
    saveCharacterMemory: (characterID, actionID, memory) => { state.entities[characterID].memories[actionID] = memory; },
    saveItemInscriptions: (itemID, inscriptions) => { state.entities[itemID].inscriptions = inscriptions; },
    debug: { validateAPICalls: true, watchlists: {} },
  };

  initializeVivRuntime({ contentBundle: bundle, adapter });

  const ticks = [];
  for (let t = 0; t < tickCount; t++) {
    const actionsBefore = new Set(state.actions);
    for (const cid of state.characters) {
      await selectAction({ initiatorID: cid });
    }
    state.timestamp += 10;

    const newActionIDs = state.actions.filter((id) => !actionsBefore.has(id));
    const events = newActionIDs.map((id) => {
      const a = state.entities[id];
      return a.report ?? a.gloss ?? "(action)";
    });

    ticks.push({
      index: t,
      timestamp: state.timestamp,
      events,
      characters: state.characters.map((id) => structuredClone(state.entities[id])),
    });
  }

  return { ticks };
}

export function summarize(tick) {
  return tick.characters.map(c => `${c.name}: mood=${c.mood}`).join("  ");
}
