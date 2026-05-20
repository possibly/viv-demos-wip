// Rootwork — host adapter and game logic.
//
// Each tick is a day. The player picks one action, then nature acts: rain,
// sun, companion-plant chemistry, pollinator visits, the occasional pest.
// All these actions — player and natural — feed the same plot properties
// (moisture, warmth, nitrogen). Plants run a `plant-life` Viv plan whose
// phases gate on those properties; the plan doesn't care who satisfied
// them. The chronicle records every action with full causal bookkeeping.
// At season's end we run three sifting patterns over the chronicle to
// surface the player's gardening style.

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

function pickRandom(rng, arr) {
  if (arr.length === 0) return null;
  return arr[Math.floor(rng() * arr.length)];
}

function shuffled(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Storyworld definitions ──────────────────────────────────────────────────

export const PLOT_COUNT = 4;
export const SEASON_DAYS = 28;
export const DAY_MINUTES = 1440;

// Plant species. Each species declares the catalogue role it plays: tomato
// is a fruit crop; clover fixes nitrogen; lavender attracts pollinators.
export const SPECIES = {
  tomato: {
    name: "Tomato",
    emoji: "🍅",
    blurb: "Wants moisture, warmth, and a pollinator. Slow to fruit.",
    fruits: true,
  },
  bean: {
    name: "Bean",
    emoji: "🫘",
    blurb: "Nitrogen-fixer and a producer. Lower demands.",
    fruits: true,
    fixesNitrogen: true,
    nitrogenFixChance: 0.55,
  },
  clover: {
    name: "Clover",
    emoji: "🍀",
    blurb: "Cover crop. Fixes nitrogen in its plot. Doesn't fruit.",
    fruits: false,
    fixesNitrogen: true,
    nitrogenFixChance: 0.85,
  },
  lavender: {
    name: "Lavender",
    emoji: "💜",
    blurb: "Hardy. Attracts pollinators to neighbouring plants.",
    fruits: false,
    attractsPollinators: true,
  },
  sunflower: {
    name: "Sunflower",
    emoji: "🌻",
    blurb: "Drinks the sun. Attracts pollinators. Goes to seed late.",
    fruits: true,
    attractsPollinators: true,
  },
};

export const SPECIES_IDS = Object.keys(SPECIES);

// Stage progression (string state machine; lifecycle advances are queued by
// the Viv plant-life plan).
export const STAGE_ORDER = [
  "dormant", "sprouting", "vegetative", "flowering", "fruiting", "ripe", "spent",
];

export const STAGE_LABEL = {
  dormant:    "Dormant",
  sprouting:  "Sprouting",
  vegetative: "Leafing",
  flowering:  "Flowering",
  fruiting:   "Fruiting",
  ripe:       "Ripe",
  spent:      "Gone to seed",
};

export const STAGE_EMOJI = {
  dormant:    "·",
  sprouting:  "🌱",
  vegetative: "🌿",
  flowering:  "🌼",
  fruiting:   "🟢",
  ripe:       "✨",
  spent:      "💀",
};

export const PLAYER_ACTION_CATALOG = [
  { name: "water-plot",   label: "Water",     desc: "Add 35 moisture to a plot." },
  { name: "mulch-plot",   label: "Mulch",     desc: "Add organic matter — +10 moisture, +6 nitrogen, slows moisture loss." },
  { name: "weed-pests",   label: "Weed",      desc: "Clear pests from a plot." },
  { name: "plant-seed",   label: "Plant",     desc: "Plant a seed from inventory in an empty plot." },
  { name: "harvest-fruit",label: "Harvest",   desc: "Harvest a ripe plant." },
  { name: "wait-day",     label: "Wait",      desc: "Skip a day. Nature continues without you." },
];

// ── Initial state ──────────────────────────────────────────────────────────

function buildInitialState(EntityType, rng) {
  const entities = {};
  const locations = [];
  const characters = [];
  const items = [];

  // Garden envelope. Plants are located in plot locations; the gardener
  // and sky are situated in the garden.
  entities["garden"] = { entityType: EntityType.Location, id: "garden", name: "The Garden" };
  locations.push("garden");

  for (let i = 0; i < PLOT_COUNT; i++) {
    const id = `plot-${i + 1}`;
    entities[id] = {
      entityType: EntityType.Location,
      id, name: `Plot ${i + 1}`,
      // Plot soil/weather properties. Conditions in the Viv plant-life plan
      // read these directly; any actor that bumps them counts.
      moisture: 18 + Math.floor(rng() * 10),
      warmth:   14 + Math.floor(rng() * 8),
      nitrogen: 14 + Math.floor(rng() * 10),
      mulch: 0,
      pests: 0,
      hostPlant: null,
    };
    locations.push(id);
  }

  // Gardener (the player) — a Character.
  entities["gardener"] = {
    entityType: EntityType.Character,
    id: "gardener", name: "You",
    location: "garden",
    memories: {},
  };
  characters.push("gardener");

  // Sky — an NPC character that initiates rain/sun.
  entities["sky"] = {
    entityType: EntityType.Character,
    id: "sky", name: "The Sky",
    location: "garden",
    memories: {},
  };
  characters.push("sky");

  // A wandering bee — pollinator NPC.
  entities["bee"] = {
    entityType: EntityType.Character,
    id: "bee", name: "A Bee",
    location: "garden",
    memories: {},
  };
  characters.push("bee");

  // Pests are abstracted as a single NPC actor.
  entities["bug"] = {
    entityType: EntityType.Character,
    id: "bug", name: "Garden Pests",
    location: "garden",
    memories: {},
  };
  characters.push("bug");

  return {
    timestamp: 0,
    entities, locations, characters, items,
    actions: [],
    vivInternalState: null,
    day: 0,
    plotIds: locations.filter(id => id.startsWith("plot-")),
    plantIds: [],
    seedIds: [],
    inventory: [],
    // chronicle bookkeeping for the UI
    log: [],
    season: { ended: false, harvested: 0, ripened: 0, plantedCount: 0 },
  };
}

function makeSeed(state, EntityType, rng, speciesId, parentChronicleSummary) {
  const id = makeUUID(rng);
  state.entities[id] = {
    entityType: EntityType.Item,
    id,
    name: `${SPECIES[speciesId].name} seed`,
    species: speciesId,
    inscriptions: [],
    location: "garden",
    // Inheriting parent's life summary lets us narrate "this seed descends
    // from..." without relying on inscribe alone (which only carries the
    // single go-to-seed action). The full causal lineage is reachable via
    // the chronicle.
    parentSummary: parentChronicleSummary ?? null,
  };
  state.items.push(id);
  state.seedIds.push(id);
  return id;
}

function makePlant(state, EntityType, rng, speciesId, plotId) {
  const id = makeUUID(rng);
  const species = SPECIES[speciesId];
  state.entities[id] = {
    entityType: EntityType.Character,
    id,
    name: species.name,
    species: speciesId,
    location: plotId,
    stage: "dormant",
    vigor: 4,
    pollinated: false,
    harvested: false,
    memories: {},
    plantedDay: state.day,
  };
  state.characters.push(id);
  state.plantIds.push(id);
  state.entities[plotId].hostPlant = id;
  return id;
}

// ── Headless simulation (Node runner convention) ────────────────────────────

export async function runSim(runtime, bundle, seedStr, tickCount) {
  const game = initGame(runtime, bundle, seedStr);
  await game.start();

  const rng = game.rng;
  const ticks = [];
  const ticksToRun = Math.min(tickCount, SEASON_DAYS);

  for (let i = 0; i < ticksToRun; i++) {
    if (game.getState().season.ended) break;

    const action = chooseHeadlessAction(game, rng);

    const result = await game.takeTurn(action);
    ticks.push({
      index: i,
      timestamp: result.day,
      events: result.events,
      day: result.day,
      season: result.season,
    });
  }

  // Run the end-of-season sifting.
  const sifting = await game.runSifting();

  return { ticks, sifting };
}

export function summarize(tick) {
  const ev = tick.events.length;
  return `day ${tick.day}  events=${ev}`;
}

function chooseHeadlessAction(game, rng) {
  const state = game.getState();
  const ripe = state.plants.filter(p => p.stage === "ripe" && !p.harvested);
  if (ripe.length > 0) return { name: "harvest-fruit", plantId: ripe[0].id };

  const empty = state.plots.filter(p => !p.hostPlant);
  if (empty.length > 0 && state.inventory.length > 0) {
    // Prefer planting a companion crop (clover/bean) on the lowest-nitrogen plot.
    const lowN = [...empty].sort((a, b) => a.nitrogen - b.nitrogen)[0];
    const companionSeed = state.inventory.find(s => s.species === "clover" || s.species === "bean");
    const seed = companionSeed ?? state.inventory[0];
    return { name: "plant-seed", plotId: lowN.id, seedId: seed.id };
  }

  // Pests bothering anyone?
  const pesty = state.plots.find(p => (p.pests ?? 0) >= 2);
  if (pesty) return { name: "weed-pests", plotId: pesty.id };

  // Mulch a low-nitrogen plot with a planted plant once or twice per season.
  const lowNPlanted = state.plots
    .filter(p => p.hostPlant && p.mulch < 1 && p.nitrogen < 15)
    .sort((a, b) => a.nitrogen - b.nitrogen)[0];
  if (lowNPlanted && rng() < 0.4) return { name: "mulch-plot", plotId: lowNPlanted.id };

  // Water the driest plot if it's parched.
  const driest = [...state.plots].sort((a, b) => a.moisture - b.moisture)[0];
  if (driest && driest.moisture < 22) return { name: "water-plot", plotId: driest.id };

  return { name: "wait-day" };
}

// ── The Viv-backed game ─────────────────────────────────────────────────────

export function initGame(runtime, bundle, seedStr) {
  const {
    initializeVivRuntime, attemptAction, selectAction, tickPlanner,
    runSiftingPattern, EntityType,
  } = runtime;

  const rng = mulberry32(hashSeed(seedStr ?? `rootwork-${Date.now()}`));
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
        if (type === EntityType.Character)
          return state.characters.filter(id => state.entities[id].location === locationID);
        if (type === EntityType.Item)
          return state.items.filter(id => state.entities[id].location === locationID);
        throw new Error(`invalid type for location query: ${type}`);
      }
      switch (type) {
        case EntityType.Character: return [...state.characters];
        case EntityType.Item:      return [...state.items];
        case EntityType.Location:  return [...state.locations];
        case EntityType.Action:    return [...state.actions];
        default: throw new Error(`invalid entity type: ${type}`);
      }
    },
    getVivInternalState: () => structuredClone(state.vivInternalState),
    saveVivInternalState: (s) => { state.vivInternalState = structuredClone(s); },
    saveCharacterMemory: (cid, aid, mem) => { state.entities[cid].memories[aid] = mem; },
    saveItemInscriptions: (iid, ins) => { state.entities[iid].inscriptions = ins; },
    debug: { validateAPICalls: true, watchlists: {} },
  };

  initializeVivRuntime({ contentBundle: bundle, adapter });

  // ── Action firing helpers ──────────────────────────────────────────────

  const snapshotActions = () => new Set(state.actions);
  const newActionsSince = (before) =>
    state.actions.filter(id => !before.has(id)).map(id => state.entities[id]);

  async function fireAction(actionName, initiatorID, precastBindings) {
    const before = snapshotActions();
    await attemptAction({
      actionName,
      initiatorID,
      precastBindings,
      suppressConditions: true,
    });
    return newActionsSince(before);
  }

  // Drain queued reactions (e.g. plant-life plan firing germinate). Walks
  // every character (the plant itself is the initiator of stage actions).
  async function drainQueued(maxRounds = 10) {
    const fresh = [];
    for (let r = 0; r < maxRounds; r++) {
      let any = false;
      // Advance plans; phases may queue new urgent reactions.
      const beforePlanner = snapshotActions();
      await tickPlanner();
      const plannerNew = newActionsSince(beforePlanner);
      if (plannerNew.length > 0) { fresh.push(...plannerNew); any = true; }

      // Now drain each plant's pending urgent queue. The plant-life plan
      // queues stage-advance actions with urgent: true on the plant itself.
      for (const cid of [...state.plantIds]) {
        const before = snapshotActions();
        try {
          await selectAction({ initiatorID: cid, urgentOnly: true });
        } catch { /* role-casting may legitimately fail */ }
        const created = newActionsSince(before);
        if (created.length > 0) { fresh.push(...created); any = true; }
      }
      if (!any) break;
    }
    return fresh;
  }

  // ── State accessors for the UI ────────────────────────────────────────

  function plotView(plotId) {
    const p = state.entities[plotId];
    const plant = p.hostPlant ? state.entities[p.hostPlant] : null;
    return {
      id: plotId,
      name: p.name,
      moisture: p.moisture,
      warmth: p.warmth,
      nitrogen: p.nitrogen,
      mulch: p.mulch,
      pests: p.pests,
      hostPlant: p.hostPlant,
      plant: plant ? plantView(plant.id) : null,
    };
  }

  function plantView(plantId) {
    const e = state.entities[plantId];
    if (!e) return null;
    const species = SPECIES[e.species];
    return {
      id: plantId,
      name: e.name,
      species: e.species,
      emoji: species.emoji,
      blurb: species.blurb,
      stage: e.stage,
      stageLabel: STAGE_LABEL[e.stage] ?? e.stage,
      stageEmoji: STAGE_EMOJI[e.stage] ?? "?",
      stageIndex: STAGE_ORDER.indexOf(e.stage),
      pollinated: !!e.pollinated,
      harvested: !!e.harvested,
      location: e.location,
      vigor: e.vigor,
      plantedDay: e.plantedDay,
    };
  }

  function seedView(seedId) {
    const s = state.entities[seedId];
    return {
      id: seedId,
      name: s.name,
      species: s.species,
      emoji: SPECIES[s.species].emoji,
      inscriptions: s.inscriptions?.length ?? 0,
      parentSummary: s.parentSummary,
    };
  }

  function buildState() {
    return {
      day: state.day,
      season: { ...state.season },
      plots: state.plotIds.map(plotView),
      plants: state.plantIds.map(plantView),
      inventory: state.inventory.map(s => seedView(s.id)),
      log: state.log,
    };
  }

  function addLogEntry(entry) {
    state.log.push({ day: state.day, ...entry });
    if (state.log.length > 200) state.log.shift();
  }

  // ── Nature loop (NPC actions each tick) ────────────────────────────────

  async function natureStep() {
    const events = [];

    // Overnight cooling — warmth drifts down each day before sun acts.
    for (const plotId of state.plotIds) {
      const plot = state.entities[plotId];
      plot.warmth = clamp(plot.warmth - 6, 0, 100);
    }

    // Sun warms ~60% of the plots each day, a bit at random.
    for (const plotId of state.plotIds) {
      if (rng() < 0.6) {
        const fresh = await fireAction("sun-warms", "sky", { sky: ["sky"], plot: [plotId] });
        const plot = state.entities[plotId];
        plot.warmth = clamp(plot.warmth + 12, 0, 100);
        // Mulch slows moisture loss.
        const dry = plot.mulch > 0 ? 4 : 7;
        plot.moisture = clamp(plot.moisture - dry, 0, 100);
        for (const a of fresh) events.push({ kind: "weather", text: a.gloss, actionId: a.id });
      }
    }

    // Rain on a random subset (~25% chance per plot per day).
    for (const plotId of state.plotIds) {
      if (rng() < 0.22) {
        const fresh = await fireAction("rain-falls", "sky", { sky: ["sky"], plot: [plotId] });
        const plot = state.entities[plotId];
        plot.moisture = clamp(plot.moisture + 28, 0, 100);
        for (const a of fresh) events.push({ kind: "weather", text: a.gloss, actionId: a.id });
      }
    }

    // Clover/bean fix nitrogen in their own plot. Treated as the plant's
    // own action — its initiator is the plant.
    for (const plantId of state.plantIds) {
      const p = state.entities[plantId];
      if (p.stage === "spent" || p.stage === "dormant") continue;
      const sp = SPECIES[p.species];
      if (!sp.fixesNitrogen) continue;
      if (rng() > sp.nitrogenFixChance) continue;
      const plotId = p.location;
      const fresh = await fireAction("clover-fixes-nitrogen", plantId, { plant: [plantId], plot: [plotId] });
      for (const a of fresh) events.push({ kind: "companion", text: a.gloss, actionId: a.id });
    }

    // Pollinator visits: any flowering plant gets a visit chance, boosted
    // if there's a pollinator-attracting plant flowering anywhere.
    const flowering = state.plantIds
      .map(id => state.entities[id])
      .filter(p => p.stage === "flowering" || p.stage === "vegetative");
    const attracting = flowering.some(p => SPECIES[p.species].attractsPollinators);
    for (const p of flowering) {
      if (p.stage !== "flowering" || p.pollinated) continue;
      const chance = SPECIES[p.species].attractsPollinators ? 0.85 : (attracting ? 0.55 : 0.25);
      if (rng() < chance) {
        const fresh = await fireAction("bee-visits", "bee", { bee: ["bee"], plant: [p.id] });
        for (const a of fresh) events.push({ kind: "pollination", text: a.gloss, actionId: a.id });
      }
    }

    // Pests: occasional, mostly on plants whose plot has no mulch.
    for (const plantId of state.plantIds) {
      const p = state.entities[plantId];
      if (p.stage === "spent" || p.stage === "dormant") continue;
      const plot = state.entities[p.location];
      const baseChance = plot.mulch > 0 ? 0.04 : 0.12;
      if (rng() < baseChance) {
        const fresh = await fireAction("pest-nibbles", "bug", { bug: ["bug"], plant: [plantId] });
        plot.pests = (plot.pests ?? 0) + 1;
        for (const a of fresh) events.push({ kind: "pest", text: a.gloss, actionId: a.id });
      }
    }

    return events;
  }

  // After every action chain, advance plans + drain queued reactions, then
  // sweep for any stage advances that just happened so we can log them.
  // Also: when a go-to-seed action fires, return the inscribed seed to the
  // player's basket. The seed now carries the parent plant's chronicle.
  async function advanceWorld() {
    const before = snapshotActions();
    await drainQueued();
    const fresh = [];
    for (const a of newActionsSince(before)) {
      fresh.push({
        kind: classifyAction(a.name),
        text: a.gloss ?? a.report ?? a.name,
        actionId: a.id,
      });
      if (a.name === "go-to-seed") {
        const seedId = a.bindings?.seed?.[0];
        const plantId = a.bindings?.plant?.[0];
        if (seedId && plantId) returnSeedToBasket(seedId, plantId);
      }
    }
    return fresh;
  }

  function returnSeedToBasket(seedId, plantId) {
    const seed = state.entities[seedId];
    const plant = state.entities[plantId];
    if (!seed || !plant) return;
    // Summarize the parent plant's life for narration. The Viv inscription
    // on the seed records the go-to-seed action specifically; the full
    // lineage is reachable from there via the chronicle's causal graph.
    seed.parentSummary = summarizePlantLife(state, plant);
    seed.species = plant.species;
    seed.name = `${SPECIES[plant.species].name} seed`;
    state.inventory.push({ id: seedId, species: plant.species });
  }

  // ── Public game API ────────────────────────────────────────────────────

  return {
    rng,
    state,
    EntityType,

    async start() {
      // Seed initial inventory: a tomato, a bean, a clover, a lavender, a sunflower.
      for (const sp of ["tomato", "tomato", "bean", "clover", "lavender", "sunflower"]) {
        const id = makeSeed(state, EntityType, rng, sp, null);
        state.inventory.push({ id, species: sp });
      }
      addLogEntry({ kind: "intro", text: "Spring. Your starting seeds are in the basket." });
    },

    getState: buildState,

    async takeTurn(action) {
      if (state.season.ended) return { day: state.day, events: [], season: state.season };

      const events = [];

      // 1) Player action.
      let playerAction = null;
      if (action.name === "wait-day") {
        events.push({ kind: "skip", text: "You step back and let the garden breathe.", actionId: null });
      } else {
        playerAction = await applyPlayerAction(action, events);
      }

      // 2) Reactions / planner advance after the player action.
      const afterPlayer = await advanceWorld();
      events.push(...afterPlayer);

      // 3) Nature tick — these record themselves as Viv actions too.
      const natureEvents = await natureStep();
      events.push(...natureEvents);

      // 4) Reactions/planner advance after nature.
      const afterNature = await advanceWorld();
      events.push(...afterNature);

      // 5) Update counts for end-of-season summary.
      for (const ev of [...afterPlayer, ...afterNature]) {
        if (ev.kind === "stage" && /ripens/.test(ev.text)) state.season.ripened++;
      }

      state.day += 1;
      state.timestamp += DAY_MINUTES;

      for (const ev of events) addLogEntry(ev);

      if (state.day >= SEASON_DAYS) state.season.ended = true;

      return { day: state.day, events, season: state.season };
    },

    async runSifting() {
      // Two layers of analysis:
      //
      // 1) JS chronicle walk. Per-plot, per-ripening, count which kinds of
      //    actions touched the plot before the ripening event. The signal
      //    is reliable and gives a meaningful archetype label.
      const jsScores = chronicleArchetypeScores(state);
      const archetype = pickArchetypeFromScores(jsScores, state);

      // 2) Viv sifting patterns. These are richer (causal lineage, role
      //    constraints) but in this demo most environmental actions don't
      //    appear in stage-action causal ancestries, so matches are sparse.
      //    We still try them and surface any matches in the result.
      const vivMatches = {};
      for (const name of ["patient-cultivator", "companion-planter", "hands-on-grower"]) {
        try {
          vivMatches[name] = await runSiftingPattern({ patternName: name });
        } catch {
          vivMatches[name] = null;
        }
      }

      return {
        archetype,
        scores: jsScores,
        vivMatches,
        stats: {
          plantedCount: state.season.plantedCount,
          ripened: state.season.ripened,
          harvested: state.season.harvested,
          totalActions: state.actions.length,
        },
        chronicle: state.actions.map(id => state.entities[id]).map(a => ({
          id: a.id, name: a.name, gloss: a.gloss, tags: a.tags ?? [], timestamp: a.timestamp,
        })),
      };
    },

    listAvailableActions() {
      return availableActions(state);
    },

    getPlot: plotView,
    getPlant: plantView,
    getSeed:  seedView,
  };

  // ── Player action handlers ─────────────────────────────────────────────

  async function applyPlayerAction(action, events) {
    const gid = "gardener";

    if (action.name === "water-plot") {
      const plot = state.entities[action.plotId];
      if (!plot) throw new Error("invalid plot");
      const fresh = await fireAction("water-plot", gid, { gardener: [gid], plot: [action.plotId] });
      plot.moisture = clamp(plot.moisture + 35, 0, 100);
      for (const a of fresh) events.push({ kind: "player", text: a.gloss, actionId: a.id });
      return fresh[0]?.id ?? null;
    }

    if (action.name === "mulch-plot") {
      const plot = state.entities[action.plotId];
      if (!plot) throw new Error("invalid plot");
      const fresh = await fireAction("mulch-plot", gid, { gardener: [gid], plot: [action.plotId] });
      plot.mulch += 1;
      plot.moisture = clamp(plot.moisture + 10, 0, 100);
      plot.nitrogen = clamp(plot.nitrogen + 6, 0, 100);
      for (const a of fresh) events.push({ kind: "player", text: a.gloss, actionId: a.id });
      return fresh[0]?.id ?? null;
    }

    if (action.name === "weed-pests") {
      const plot = state.entities[action.plotId];
      if (!plot) throw new Error("invalid plot");
      const fresh = await fireAction("weed-pests", gid, { gardener: [gid], plot: [action.plotId] });
      plot.pests = 0;
      for (const a of fresh) events.push({ kind: "player", text: a.gloss, actionId: a.id });
      return fresh[0]?.id ?? null;
    }

    if (action.name === "plant-seed") {
      const plot = state.entities[action.plotId];
      const seed = state.entities[action.seedId];
      if (!plot || !seed) throw new Error("invalid plot/seed");
      if (plot.hostPlant) throw new Error("plot is occupied");

      // Create the plant entity FIRST so we can precast it into the action.
      const plantId = makePlant(state, EntityType, rng, seed.species, action.plotId);

      const fresh = await fireAction("plant-seed", gid, {
        gardener: [gid],
        plot: [action.plotId],
        seed: [action.seedId],
        plant: [plantId],
      });
      // Remove the planted seed from inventory.
      state.inventory = state.inventory.filter(s => s.id !== action.seedId);
      state.season.plantedCount += 1;
      for (const a of fresh) events.push({ kind: "player", text: a.gloss, actionId: a.id });
      return fresh[0]?.id ?? null;
    }

    if (action.name === "harvest-fruit") {
      const plant = state.entities[action.plantId];
      if (!plant) throw new Error("invalid plant");
      if (plant.stage !== "ripe") throw new Error("plant is not ripe");

      // Harvest sets plant.harvested=true via the action's effect. The
      // plant-life plan, waiting in its >ripe phase, will then advance and
      // queue go-to-seed — which inscribes the original (planted) seed
      // with this plant's life chronicle. The host JS catches go-to-seed
      // and returns the inscribed seed to the player's basket.
      const fresh = await fireAction("harvest-fruit", gid, {
        gardener: [gid],
        plant: [action.plantId],
      });
      state.season.harvested += 1;
      plant.harvested = true;

      for (const a of fresh) {
        events.push({ kind: "player", text: a.gloss, actionId: a.id });
      }
      return fresh[0]?.id ?? null;
    }

    throw new Error(`unknown action: ${action.name}`);
  }
}

// ── Chronicle helpers ──────────────────────────────────────────────────────

function classifyAction(name) {
  if (["germinate", "leaf-out", "flower", "set-fruit", "ripen", "go-to-seed"].includes(name)) {
    return "stage";
  }
  if (["water-plot", "mulch-plot", "weed-pests", "plant-seed", "harvest-fruit"].includes(name)) {
    return "player";
  }
  if (["rain-falls", "sun-warms"].includes(name)) return "weather";
  if (["clover-fixes-nitrogen"].includes(name)) return "companion";
  if (["bee-visits"].includes(name)) return "pollination";
  if (["pest-nibbles"].includes(name)) return "pest";
  return "other";
}

function summarizePlantLife(state, plant) {
  const lineage = [];
  for (const aid of state.actions) {
    const a = state.entities[aid];
    if (!a) continue;
    const bindings = a.bindings ?? {};
    const involved = Object.values(bindings).some(v =>
      Array.isArray(v) ? v.includes(plant.id) : v === plant.id
    );
    if (involved) lineage.push({ name: a.name, gloss: a.gloss, timestamp: a.timestamp });
  }
  return {
    species: plant.species,
    plantedDay: plant.plantedDay,
    actionCount: lineage.length,
    headline: lineage.length
      ? lineage[lineage.length - 1].gloss
      : `${SPECIES[plant.species].name} that lived briefly.`,
  };
}

function availableActions(state) {
  const out = [];
  for (const def of PLAYER_ACTION_CATALOG) out.push({ ...def });
  return out;
}

// For each ripening in the chronicle, look at all prior actions that touched
// the same plot. Aggregate into per-archetype scores.
function chronicleArchetypeScores(state) {
  const ripenings = state.actions
    .map(id => state.entities[id])
    .filter(a => a && a.name === "ripen");

  const scores = { patient: 0, companion: 0, handsOn: 0, total: ripenings.length };

  for (const ripening of ripenings) {
    const plotId = roleBinding(ripening, "plot");
    if (!plotId) continue;
    const ripenT = ripening.timestamp ?? 0;
    let player = 0;
    let nature = 0;
    let companion = 0;

    for (const aid of state.actions) {
      const a = state.entities[aid];
      if (!a || a === ripening) continue;
      if ((a.timestamp ?? 0) >= ripenT) continue;
      const involvedPlot = roleBinding(a, "plot") === plotId;
      if (!involvedPlot) continue;

      switch (a.name) {
        case "water-plot": case "mulch-plot": case "weed-pests":
        case "plant-seed":
          player += 1; break;
        case "harvest-fruit":
          // harvest is the player action that happens after ripen
          break;
        case "rain-falls": case "sun-warms":
          nature += 1; break;
        case "bee-visits":
          nature += 1; break;
        case "clover-fixes-nitrogen":
          companion += 1; break;
      }
    }

    if (player + nature + companion === 0) continue;
    // Normalize per ripening: each ripening contributes 1 unit total.
    const total = player + nature + companion;
    scores.handsOn   += player    / total;
    scores.patient   += nature    / total;
    scores.companion += companion / total;
  }

  return scores;
}

function roleBinding(action, roleName) {
  const r = action?.bindings?.[roleName];
  if (!r) return null;
  if (Array.isArray(r)) return r[0] ?? null;
  return r;
}

const ARCHETYPE_LABELS = {
  patient: {
    title: "Patient Cultivator",
    blurb: "You let nature do the work. Most of what ripened got there with rain, sun, and bees doing the heavy lifting.",
  },
  companion: {
    title: "Companion Planter",
    blurb: "You planted partners. Clover and beans fixed the nitrogen that fed your fruits — your role was matchmaking the species.",
  },
  handsOn: {
    title: "Hands-On Grower",
    blurb: "You stayed close. Most of what ripened did so under your direct attention — watering, mulching, weeding.",
  },
};

function pickArchetypeFromScores(scores, state) {
  if (scores.total === 0) {
    return {
      title: "Quiet Season",
      blurb: "Nothing ripened this season. Next time — get something into the ground earlier, or lean into a companion crop.",
      scores,
      ranked: [],
    };
  }
  const ranked = [
    { key: "patient",   weight: scores.patient   },
    { key: "companion", weight: scores.companion },
    { key: "handsOn",   weight: scores.handsOn   },
  ].sort((a, b) => b.weight - a.weight);

  const top = ranked[0];
  if (top.weight <= 0) {
    return {
      title: "Quiet Season",
      blurb: "Things grew but the chronicle didn't form into a recognizable shape.",
      scores, ranked,
    };
  }
  return {
    ...ARCHETYPE_LABELS[top.key],
    key: top.key,
    scores, ranked,
  };
}
