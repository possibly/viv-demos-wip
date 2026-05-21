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

// ── Cultivars ───────────────────────────────────────────────────────────────
//
// Varietals within each species. `base` is the plant's per-phase threshold
// table: the plan reads `@plant.t.<field>` against the plot. `sens.water` and
// `sens.rain` are moisture-source multipliers applied when watering or rain
// touches this plant's plot. Different cultivars feel measurably different
// because the same action gives different results.
//
//   g_m, g_w → germinate moisture, warmth
//   l_m, l_n → leaf-out moisture, nitrogen
//   f_w, f_n → flower (vegetative→flowering) warmth, nitrogen
//   r_w, r_m → ripen warmth, moisture
export const CULTIVARS = {
  tomato: {
    roma: {
      name: "Roma", blurb: "Plain, dependable. Average needs.",
      base: { g_m: 22, g_w: 20, l_m: 14, l_n: 12, f_w: 35, f_n: 18, r_w: 45, r_m: 12 },
      sens: { water: 1.0, rain: 1.0 },
    },
    cherry: {
      name: "Cherry", blurb: "Many small fruits. Rain-loving, fast.",
      base: { g_m: 18, g_w: 22, l_m: 12, l_n: 12, f_w: 32, f_n: 16, r_w: 42, r_m: 10 },
      sens: { water: 0.8, rain: 1.3 },
    },
    beefsteak: {
      name: "Beefsteak", blurb: "Big fruits. Nitrogen-hungry, slow.",
      base: { g_m: 26, g_w: 22, l_m: 16, l_n: 22, f_w: 38, f_n: 28, r_w: 50, r_m: 14 },
      sens: { water: 1.1, rain: 0.9 },
    },
  },
  bean: {
    bush: {
      name: "Bush", blurb: "Compact. Less demanding.",
      base: { g_m: 20, g_w: 18, l_m: 12, l_n: 10, f_w: 30, f_n: 14, r_w: 40, r_m: 10 },
      sens: { water: 1.0, rain: 1.0 },
    },
    pole: {
      name: "Pole", blurb: "Tall, climbs. Fixes more nitrogen but wants warmth.",
      base: { g_m: 22, g_w: 22, l_m: 14, l_n: 12, f_w: 36, f_n: 16, r_w: 46, r_m: 12 },
      sens: { water: 0.95, rain: 1.05 },
    },
  },
  lavender: {
    english: {
      name: "English", blurb: "Hardy. Dry-loving.",
      base: { g_m: 18, g_w: 22, l_m: 10, l_n: 8, f_w: 34, f_n: 12, r_w: 44, r_m: 8 },
      sens: { water: 0.85, rain: 1.0 },
    },
    french: {
      name: "French", blurb: "Showy. Wants more warmth.",
      base: { g_m: 22, g_w: 26, l_m: 14, l_n: 12, f_w: 40, f_n: 16, r_w: 48, r_m: 12 },
      sens: { water: 1.0, rain: 1.0 },
    },
  },
  sunflower: {
    mammoth: {
      name: "Mammoth", blurb: "Tall. Drinks the sun and water.",
      base: { g_m: 26, g_w: 24, l_m: 16, l_n: 14, f_w: 40, f_n: 18, r_w: 52, r_m: 14 },
      sens: { water: 1.1, rain: 1.0 },
    },
    dwarf: {
      name: "Dwarf", blurb: "Short, quick. Lower needs.",
      base: { g_m: 20, g_w: 20, l_m: 12, l_n: 10, f_w: 34, f_n: 14, r_w: 44, r_m: 10 },
      sens: { water: 0.95, rain: 1.05 },
    },
  },
  clover: {
    red: {
      name: "Red", blurb: "Strong nitrogen-fixer.",
      base: { g_m: 18, g_w: 16, l_m: 10, l_n: 8, f_w: 30, f_n: 10, r_w: 38, r_m: 8 },
      sens: { water: 1.0, rain: 1.0 },
      fixBoost: 1.15,
    },
    white: {
      name: "White", blurb: "Moderate fixer. Spreads well.",
      base: { g_m: 16, g_w: 16, l_m: 10, l_n: 8, f_w: 28, f_n: 10, r_w: 36, r_m: 8 },
      sens: { water: 1.0, rain: 1.0 },
      fixBoost: 1.0,
    },
  },
};

export function cultivarsFor(speciesId) {
  return Object.entries(CULTIVARS[speciesId] ?? {}).map(([id, c]) => ({ id, ...c }));
}

export function defaultCultivarId(speciesId) {
  return Object.keys(CULTIVARS[speciesId] ?? {})[0] ?? null;
}

function getCultivar(speciesId, cultivarId) {
  const table = CULTIVARS[speciesId];
  if (!table) return null;
  if (cultivarId && table[cultivarId]) return { id: cultivarId, ...table[cultivarId] };
  // Hybrid (e.g., "roma×cherry") — synthesized below in makePlant.
  return null;
}

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

// ── Plant quality system ────────────────────────────────────────────────────
//
// Each plant carries running tallies of how its plan got satisfied:
//   sources: { water, rain, sun, clover, mulch, bee, pests }
//   peaks:   { moisture, warmth, nitrogen } — high-water marks during life
//
// When a plant ripens, those tallies are run against the rule list below to
// assign up to three traits. Same rules for every species; the label is
// species-flavoured so the player can learn "rain water → Juicy tomato but
// Plump bean" by watching outcomes accumulate in the journal.
//
// Order matters: earlier rules win when slots are limited. Each rule's
// `explain` is what the journal records — a plain-English why.

// Each rule's `inherit` modifies the NEXT plant's thresholds & sensitivities
// when this trait is passed down via the seed. This is what makes a "Juicy"
// seed feel different from a fresh seed — it's not just a badge.
export const TRAIT_RULES = [
  {
    id: "rain-fed",
    test: (s) => s.rain >= 2 && s.rain >= s.water * 1.5,
    labels: { tomato: "Juicy", bean: "Plump", lavender: "Pale", sunflower: "Sturdy", clover: "Spreading" },
    explain: "Most of its water came from rain — not your watering can.",
    inheritExplain: "Descendents germinate easier in rain (-6 moisture) and gain more from rainfall (+30%).",
    inherit: { t: { g_m: -6 }, sens: { rain: 0.30, water: -0.20 } },
  },
  {
    id: "hand-watered",
    test: (s) => s.water >= 2 && s.water >= s.rain * 1.5,
    labels: { tomato: "Tidy", bean: "Tender", lavender: "Compact", sunflower: "Trained", clover: "Tame" },
    explain: "You did most of the watering yourself.",
    inheritExplain: "Descendents gain more from your watering can (+30%) but less from rain.",
    inherit: { t: { g_m: -4 }, sens: { water: 0.30, rain: -0.20 } },
  },
  {
    id: "companion-fed",
    test: (s) => s.clover >= 1,
    labels: { tomato: "Sweet", bean: "Hearty", lavender: "Lush", sunflower: "Strong", clover: "Mingling" },
    explain: "A nearby nitrogen-fixer (clover or bean) fertilized it.",
    inheritExplain: "Descendents need less nitrogen to leaf out and to fruit.",
    inherit: { t: { l_n: -6, f_n: -4 } },
  },
  {
    id: "mulched",
    test: (s) => s.mulch >= 1,
    labels: { tomato: "Earthy", bean: "Mellow", lavender: "Rich", sunflower: "Stout", clover: "Loamy" },
    explain: "You mulched this plant's plot.",
    inheritExplain: "Descendents hold moisture better (slower drying not yet modeled — for now, easier germination).",
    inherit: { t: { g_m: -2 } },
  },
  {
    id: "lush-soil",
    test: (s, p) => p.nitrogen >= 45,
    labels: { tomato: "Plump", bean: "Lush", lavender: "Leggy", sunflower: "Big-headed", clover: "Greedy" },
    explain: "The plot's nitrogen rose well above the minimum to advance.",
    inheritExplain: "Descendents got used to rich soil — they now demand more nitrogen.",
    inherit: { t: { l_n: 4, f_n: 6 } },
  },
  {
    id: "sun-blessed",
    test: (s, p) => p.warmth >= 65,
    labels: { tomato: "Sun-blessed", bean: "Sun-soaked", lavender: "Fragrant", sunflower: "Tall", clover: "Bronzed" },
    explain: "Plot warmth went well above the threshold during fruiting.",
    inheritExplain: "Descendents flower and ripen at lower warmth (-4 each).",
    inherit: { t: { f_w: -4, r_w: -4 } },
  },
  {
    id: "bee-favored",
    test: (s) => s.bee >= 2,
    labels: { tomato: "Generous", bean: "Pod-heavy", lavender: "Beloved", sunflower: "Crowned", clover: "Honeyed" },
    explain: "Multiple pollinator visits set richer fruit.",
    inheritExplain: "Descendents attract pollinators more readily.",
    inherit: { beeAttract: 0.15 },
  },
  {
    id: "pest-touched",
    test: (s) => s.pests >= 1,
    labels: { tomato: "Scarred", bean: "Chewed", lavender: "Nipped", sunflower: "Holed", clover: "Patchy" },
    explain: "Pests reached this plant before you did.",
    inheritExplain: "Descendents are more vulnerable to pests.",
    inherit: { pestResist: -0.30 },
  },
  {
    id: "vigorous",
    test: (s) => s.pests === 0 && s.water + s.rain + s.sun >= 4,
    labels: { tomato: "Vigorous", bean: "Robust", lavender: "Whole", sunflower: "Proud", clover: "Glossy" },
    explain: "It lived its life untouched by pests.",
    inheritExplain: "Descendents resist pests better (+50%).",
    inherit: { pestResist: 0.50 },
  },
];

export function traitRule(traitId) {
  return TRAIT_RULES.find(r => r.id === traitId) ?? null;
}

const MAX_TRAITS = 3;

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
    season: { ended: false, harvested: 0, ripened: 0, plantedCount: 0, seasonNumber: 1 },
    // Cross-plant lessons. Keyed by `${species}:${traitId}` so the player can
    // see "Sweet tomato — happens when a nitrogen-fixer feeds it."
    journal: {},
    // Local cultivars stabilized through breeding. Keyed `${species}:${id}`.
    localCultivars: {},
    // Hybrid lineage tracking: for each (species, fingerprint), count
    // consecutive consistent generations. At 3, promote to a named cultivar.
    hybridStability: {},
    // Lineage graph: a parallel data structure for the pedigree view that
    // survives season resets (chronicle gets wiped between seasons).
    lineage: {},
    // Newest cultivar promotions (so the UI can highlight them this session).
    newCultivars: [],
  };
}

// ── Persistence ────────────────────────────────────────────────────────────

const SAVE_KEY = "rootwork:save:v1";

export function loadSave() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function saveSave(save) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* full disk etc — ignore */ }
}

export function clearSave() {
  if (typeof localStorage === "undefined") return;
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

function serializeForSave(state) {
  // Persist only what's needed to continue the breeding loop next season.
  const seedRecords = state.inventory.map(s => {
    const e = state.entities[s.id];
    return {
      id: e.id, species: e.species, cultivarId: e.cultivarId,
      name: e.name, inscriptions: e.inscriptions ?? [],
      parentSummary: e.parentSummary, parentTraits: e.parentTraits ?? [],
      donorTraits: e.donorTraits ?? [], donorCultivarId: e.donorCultivarId,
      parentSeedId: e.parentSeedId, donorSeedId: e.donorSeedId,
      generation: e.generation ?? 1,
    };
  });
  return {
    version: 1,
    seasonNumber: (state.season?.seasonNumber ?? 1) + 1,
    inventory: seedRecords,
    journal: state.journal,
    localCultivars: state.localCultivars,
    hybridStability: state.hybridStability,
    lineage: state.lineage,
  };
}

// Bump a plant's source-tally for whatever just happened to its plot.
// Called from the player/nature action handlers.
function attributePlot(state, plotId, kind, n = 1) {
  const plot = state.entities[plotId];
  if (!plot) return;
  // Update peak measurements regardless of host plant; we read them when
  // a plant first ripens in this plot.
  if (plot.moisture > (plot._peakMoisture ?? 0)) plot._peakMoisture = plot.moisture;
  if (plot.warmth   > (plot._peakWarmth   ?? 0)) plot._peakWarmth   = plot.warmth;
  if (plot.nitrogen > (plot._peakNitrogen ?? 0)) plot._peakNitrogen = plot.nitrogen;

  const plant = plot.hostPlant ? state.entities[plot.hostPlant] : null;
  if (!plant || plant.stage === "spent") return;
  plant.sources[kind] = (plant.sources[kind] ?? 0) + n;
  // Peak tracking on the plant too — easier to consult at ripening time.
  if (plot.moisture > plant.peaks.moisture) plant.peaks.moisture = plot.moisture;
  if (plot.warmth   > plant.peaks.warmth)   plant.peaks.warmth   = plot.warmth;
  if (plot.nitrogen > plant.peaks.nitrogen) plant.peaks.nitrogen = plot.nitrogen;
}

// Assign traits to a plant whose stage just turned "ripe". Up to MAX_TRAITS,
// picked in TRAIT_RULES order. Each trait stores its species-flavoured label
// and the explanation, so the journal can show "Sweet (because a clover fed
// it)." without recomputing.
function assignTraits(plant) {
  if (plant.traits && plant.traits.length) return; // idempotent
  const out = [];
  for (const rule of TRAIT_RULES) {
    if (out.length >= MAX_TRAITS) break;
    if (rule.test(plant.sources, plant.peaks)) {
      const label = rule.labels[plant.species] ?? rule.id;
      out.push({ id: rule.id, label, explain: rule.explain });
    }
  }
  plant.traits = out;
}

function recordTraitsInJournal(state, plant) {
  for (const t of plant.traits ?? []) {
    const key = `${plant.species}:${t.id}`;
    const entry = state.journal[key];
    if (entry) {
      entry.count += 1;
    } else {
      state.journal[key] = {
        species: plant.species,
        traitId: t.id,
        label:  t.label,
        explain: t.explain,
        firstSeenDay: state.day,
        count: 1,
      };
    }
  }
}

function makeSeed(state, EntityType, rng, speciesId, opts = {}) {
  const id = makeUUID(rng);
  const cultivarId = opts.cultivarId ?? defaultCultivarId(speciesId);
  const cultivarName = cultivarLabelFor(state, speciesId, cultivarId);
  state.entities[id] = {
    entityType: EntityType.Item,
    id,
    name: `${cultivarName} ${SPECIES[speciesId].name} seed`,
    species: speciesId,
    cultivarId,
    inscriptions: [],
    location: "garden",
    parentSummary: opts.parentSummary ?? null,
    parentTraits: opts.parentTraits ?? [],
    donorTraits: opts.donorTraits ?? [],
    donorCultivarId: opts.donorCultivarId ?? null,
    parentSeedId: opts.parentSeedId ?? null,
    donorSeedId: opts.donorSeedId ?? null,
    generation: opts.generation ?? 1,
  };
  state.items.push(id);
  state.seedIds.push(id);
  return id;
}

// Build the per-plant threshold table and sensitivity multipliers from
// (a) cultivar base, (b) inherited-trait modifiers from parent, (c) donor
// modifiers if hybrid. Trait modifiers stack additively.
function deriveThresholds(speciesId, cultivarId, inheritedTraits, donorTraits, localCultivars) {
  const t = { g_m: 22, g_w: 20, l_m: 14, l_n: 12, f_w: 35, f_n: 18, r_w: 45, r_m: 12 };
  const sens = { water: 1.0, rain: 1.0 };
  let beeAttract = 0;
  let pestResist = 0;
  let fixBoost = null;

  // Resolve cultivar — could be a base entry, a hybrid like "roma×cherry"
  // (we average the two), or a stable local cultivar from a prior run.
  const c = resolveCultivar(speciesId, cultivarId, localCultivars);
  if (c) {
    Object.assign(t, c.base);
    Object.assign(sens, c.sens ?? {});
    if (c.fixBoost) fixBoost = c.fixBoost;
  }

  for (const tr of [...(inheritedTraits ?? []), ...(donorTraits ?? [])]) {
    const rule = traitRule(tr.id);
    if (!rule?.inherit) continue;
    if (rule.inherit.t) for (const [k, v] of Object.entries(rule.inherit.t)) t[k] = (t[k] ?? 0) + v;
    if (rule.inherit.sens) for (const [k, v] of Object.entries(rule.inherit.sens)) sens[k] = (sens[k] ?? 1) + v;
    if (rule.inherit.beeAttract) beeAttract += rule.inherit.beeAttract;
    if (rule.inherit.pestResist) pestResist += rule.inherit.pestResist;
  }
  // Clamp thresholds to sane minimums so a heavily-inherited plant can't go
  // below zero and germinate instantly off zero moisture.
  for (const k of Object.keys(t)) t[k] = Math.max(2, Math.round(t[k]));
  sens.water = Math.max(0.2, sens.water);
  sens.rain  = Math.max(0.2, sens.rain);
  pestResist = clamp(pestResist, -0.9, 0.9);
  beeAttract = clamp(beeAttract, 0, 0.6);

  return { t, sens, beeAttract, pestResist, fixBoost };
}

function resolveCultivar(speciesId, cultivarId, localCultivars) {
  if (!cultivarId) return null;
  // Local stable cultivar from prior breeding (registered at runtime).
  const local = localCultivars?.[`${speciesId}:${cultivarId}`];
  if (local) return local;
  // Hybrid notation: "parent×donor" — average the two cultivars' bases.
  if (cultivarId.includes("×")) {
    const [a, b] = cultivarId.split("×");
    const ca = CULTIVARS[speciesId]?.[a];
    const cb = CULTIVARS[speciesId]?.[b];
    if (ca && cb) {
      const base = {};
      for (const k of Object.keys(ca.base)) base[k] = Math.round((ca.base[k] + cb.base[k]) / 2);
      const sens = {
        water: ((ca.sens?.water ?? 1) + (cb.sens?.water ?? 1)) / 2,
        rain:  ((ca.sens?.rain  ?? 1) + (cb.sens?.rain  ?? 1)) / 2,
      };
      return { base, sens, hybrid: true };
    }
    if (ca) return { id: a, ...ca };
    if (cb) return { id: b, ...cb };
    return null;
  }
  const c = CULTIVARS[speciesId]?.[cultivarId];
  return c ? { id: cultivarId, ...c } : null;
}

function cultivarLabelFor(state, speciesId, cultivarId) {
  if (!cultivarId) return SPECIES[speciesId].name;
  const local = state?.localCultivars?.[`${speciesId}:${cultivarId}`];
  if (local) return local.name;
  if (cultivarId.includes("×")) {
    const [a, b] = cultivarId.split("×");
    const ca = CULTIVARS[speciesId]?.[a]?.name ?? a;
    const cb = CULTIVARS[speciesId]?.[b]?.name ?? b;
    return `${ca}×${cb}`;
  }
  return CULTIVARS[speciesId]?.[cultivarId]?.name ?? cultivarId;
}

function makePlant(state, EntityType, rng, speciesId, plotId, opts = {}) {
  const id = makeUUID(rng);
  const species = SPECIES[speciesId];
  const cultivarId = opts.cultivarId ?? defaultCultivarId(speciesId);
  const inheritedTraits = opts.inheritedTraits ?? [];
  const donorTraits = opts.donorTraits ?? [];
  const derived = deriveThresholds(speciesId, cultivarId, inheritedTraits, donorTraits, state.localCultivars);

  state.entities[id] = {
    entityType: EntityType.Character,
    id,
    name: `${cultivarLabelFor(state, speciesId, cultivarId)} ${species.name}`,
    species: speciesId,
    cultivarId,
    location: plotId,
    stage: "dormant",
    vigor: 4,
    pollinated: false,
    harvested: false,
    memories: {},
    plantedDay: state.day,
    // Tally of how this plant's plan got satisfied. Bumped by every action
    // that touched its plot. Used to assign traits when the plant ripens.
    sources: { water: 0, rain: 0, sun: 0, clover: 0, mulch: 0, bee: 0, pests: 0 },
    peaks:   { moisture: 0, warmth: 0, nitrogen: 0 },
    traits: [],
    inheritedTraits,
    donorTraits,
    donorCultivarId: opts.donorCultivarId ?? null,
    parentSeedId: opts.parentSeedId ?? null,
    donorSeedId: opts.donorSeedId ?? null,
    generation: opts.generation ?? 1,
    // The plan reads from `@plant.t.<field>`; sensitivity is read in JS.
    t: derived.t,
    sens: derived.sens,
    beeAttract: derived.beeAttract,
    pestResist: derived.pestResist,
    fixBoost: derived.fixBoost,
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
    functions: {
      // Casting pools for germinate's @ancestry / @hybrid-origin roles.
      // Each returns the most recent matching action ID as a single-element
      // list (or empty). The action-typed roles auto-wire these returned
      // actions as direct causes of `germinate`, so pedigree walks via
      // entity.causes work for free.
      lastRipeningForPlant: (plantArg) => {
        const plantId = Array.isArray(plantArg) ? plantArg[0] : plantArg;
        const plant = state.entities[plantId];
        if (!plant) return [];
        const parentSeedId = plant.parentSeedId;
        if (!parentSeedId) return [];
        // Find the ripen action whose plant was grown from the same seed.
        for (let i = state.actions.length - 1; i >= 0; i--) {
          const a = state.entities[state.actions[i]];
          if (a?.name !== "ripen") continue;
          const ripenPlantId = a.bindings?.plant?.[0];
          const ripenPlant = ripenPlantId ? state.entities[ripenPlantId] : null;
          if (ripenPlant?.destinedSeedId === parentSeedId) return [state.actions[i]];
        }
        return [];
      },
      lastCrossForPlant: (plantArg) => {
        const plantId = Array.isArray(plantArg) ? plantArg[0] : plantArg;
        const plant = state.entities[plantId];
        if (!plant?.parentSeedId) return [];
        for (let i = state.actions.length - 1; i >= 0; i--) {
          const a = state.entities[state.actions[i]];
          if (a?.name !== "cross-pollinate") continue;
          if (a.bindings?.seed?.[0] === plant.parentSeedId) return [state.actions[i]];
        }
        return [];
      },
    },
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
      cultivarId: e.cultivarId,
      cultivarName: cultivarLabelFor(state, e.species, e.cultivarId),
      donorCultivarId: e.donorCultivarId,
      isHybrid: !!(e.cultivarId && e.cultivarId.includes("×")),
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
      sources: { ...(e.sources ?? {}) },
      peaks:   { ...(e.peaks ?? {}) },
      traits:  (e.traits ?? []).map(t => ({ ...t })),
      inheritedTraits: (e.inheritedTraits ?? []).map(t => ({ ...t })),
      donorTraits: (e.donorTraits ?? []).map(t => ({ ...t })),
      t: { ...(e.t ?? {}) },
      sens: { ...(e.sens ?? {}) },
      generation: e.generation ?? 1,
    };
  }

  function seedView(seedId) {
    const s = state.entities[seedId];
    return {
      id: seedId,
      name: s.name,
      species: s.species,
      cultivarId: s.cultivarId,
      cultivarName: cultivarLabelFor(state, s.species, s.cultivarId),
      donorCultivarId: s.donorCultivarId,
      donorCultivarName: s.donorCultivarId
        ? cultivarLabelFor(state, s.species, s.donorCultivarId)
        : null,
      isHybrid: !!(s.cultivarId && s.cultivarId.includes("×")),
      emoji: SPECIES[s.species].emoji,
      inscriptions: s.inscriptions?.length ?? 0,
      parentSummary: s.parentSummary,
      parentTraits: (s.parentTraits ?? []).map(t => ({ ...t })),
      donorTraits: (s.donorTraits ?? []).map(t => ({ ...t })),
      generation: s.generation ?? 1,
      parentSeedId: s.parentSeedId ?? null,
      donorSeedId: s.donorSeedId ?? null,
      // What this seed will produce when planted — pre-derived so the player
      // can see "Juicy Cherry tomato: germinates at moisture 12, base 18."
      preview: previewForSeed(s),
    };
  }

  function previewForSeed(seed) {
    const cultivar = resolveCultivar(seed.species, seed.cultivarId, state.localCultivars);
    const base = cultivar?.base ?? null;
    const derived = deriveThresholds(seed.species, seed.cultivarId, seed.parentTraits ?? [], seed.donorTraits ?? [], state.localCultivars);
    return {
      cultivarName: cultivarLabelFor(state, seed.species, seed.cultivarId),
      blurb: cultivar?.blurb ?? "",
      base, t: derived.t, sens: derived.sens,
      beeAttract: derived.beeAttract, pestResist: derived.pestResist,
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
      journal: Object.values(state.journal ?? {}),
      localCultivars: { ...state.localCultivars },
      newCultivars: [...state.newCultivars],
      lineage: state.lineage,
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
        attributePlot(state, plotId, "sun");
        for (const a of fresh) events.push({ kind: "weather", text: a.gloss, actionId: a.id });
      }
    }

    // Rain on a random subset (~22% chance per plot per day). Moisture
    // gained is multiplied by the host plant's `sens.rain` — a Rain-fed
    // Cherry actually drinks rain more deeply than a Hand-watered Beefsteak.
    for (const plotId of state.plotIds) {
      if (rng() < 0.22) {
        const fresh = await fireAction("rain-falls", "sky", { sky: ["sky"], plot: [plotId] });
        const plot = state.entities[plotId];
        const sens = plot.hostPlant ? (state.entities[plot.hostPlant].sens?.rain ?? 1) : 1;
        plot.moisture = clamp(plot.moisture + Math.round(28 * sens), 0, 100);
        attributePlot(state, plotId, "rain");
        for (const a of fresh) events.push({ kind: "weather", text: a.gloss, actionId: a.id });
      }
    }

    // Clover/bean fix nitrogen in their own plot. Treated as the plant's
    // own action — its initiator is the plant. Some cultivars boost the fix.
    for (const plantId of state.plantIds) {
      const p = state.entities[plantId];
      if (p.stage === "spent" || p.stage === "dormant") continue;
      const sp = SPECIES[p.species];
      if (!sp.fixesNitrogen) continue;
      const chance = sp.nitrogenFixChance * (p.fixBoost ?? 1);
      if (rng() > chance) continue;
      const plotId = p.location;
      const fresh = await fireAction("clover-fixes-nitrogen", plantId, { plant: [plantId], plot: [plotId] });
      attributePlot(state, plotId, "clover");
      for (const a of fresh) events.push({ kind: "companion", text: a.gloss, actionId: a.id });
    }

    // Pollinator visits and opportunistic cross-pollination. A bee that
    // lands on a flowering plant can, with some probability, also carry
    // pollen from another flowering plant of the same species (different
    // cultivar) — that fires a `cross-pollinate` action, which inscribes
    // the recipient's eventual seed with the donor's identity.
    const flowering = state.plantIds
      .map(id => state.entities[id])
      .filter(p => p.stage === "flowering" || p.stage === "vegetative");
    const attracting = flowering.some(p => SPECIES[p.species].attractsPollinators);
    for (const p of flowering) {
      if (p.stage !== "flowering" || p.pollinated) continue;
      const beeAttract = p.beeAttract ?? 0;
      const base = SPECIES[p.species].attractsPollinators ? 0.85 : (attracting ? 0.55 : 0.25);
      const chance = clamp(base + beeAttract, 0, 0.98);
      if (rng() < chance) {
        const fresh = await fireAction("bee-visits", "bee", { bee: ["bee"], plant: [p.id] });
        p.sources.bee += 1;
        for (const a of fresh) events.push({ kind: "pollination", text: a.gloss, actionId: a.id });

        // Try cross-pollination: any OTHER flowering plant of the same
        // species but a different cultivar that's currently in bloom.
        const donor = flowering.find(other =>
          other.id !== p.id
          && other.species === p.species
          && other.cultivarId !== p.cultivarId
          && (other.stage === "flowering" || other.pollinated)
        );
        if (donor) {
          // Find a seed item to inscribe. Each plot has a "destined" seed
          // entity created at planting; cross-pollinate inscribes it.
          const recipientSeedId = findSeedForPlant(p.id);
          if (recipientSeedId) {
            const cFresh = await fireAction("cross-pollinate", "bee", {
              bee: ["bee"],
              donor: [donor.id],
              recipient: [p.id],
              seed: [recipientSeedId],
            });
            // Stash the cross on the seed for replant-time blending.
            const seed = state.entities[recipientSeedId];
            seed.crossedWith = donor.id;
            seed.crossedWithCultivar = donor.cultivarId;
            seed.crossedWithTraits = (donor.inheritedTraits ?? []).map(t => ({ ...t }));
            for (const a of cFresh) events.push({ kind: "pollination", text: a.gloss + ` (cross with ${cultivarLabelFor(state, donor.species, donor.cultivarId)})`, actionId: a.id });
          }
        }
      }
    }

    // Pests: occasional, mostly on plants whose plot has no mulch. The
    // plant's pestResist modifies the chance (Vigorous descendents resist).
    for (const plantId of state.plantIds) {
      const p = state.entities[plantId];
      if (p.stage === "spent" || p.stage === "dormant") continue;
      const plot = state.entities[p.location];
      const baseChance = plot.mulch > 0 ? 0.04 : 0.12;
      const adjusted = clamp(baseChance * (1 - (p.pestResist ?? 0)), 0, 0.5);
      if (rng() < adjusted) {
        const fresh = await fireAction("pest-nibbles", "bug", { bug: ["bug"], plant: [plantId] });
        plot.pests = (plot.pests ?? 0) + 1;
        p.sources.pests += 1;
        for (const a of fresh) events.push({ kind: "pest", text: a.gloss, actionId: a.id });
      }
    }

    return events;
  }

  // Each plant gets a designated "future seed" entity at planting time so
  // cross-pollinate has something to inscribe onto BEFORE go-to-seed fires.
  function findSeedForPlant(plantId) {
    const plant = state.entities[plantId];
    return plant?.destinedSeedId ?? null;
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
      // When a plant ripens, compute its traits from accumulated sources
      // and record any new ones in the journal so the player can learn
      // which actions tend to produce which qualities.
      if (a.name === "ripen") {
        const plantId = a.bindings?.plant?.[0];
        const plant = plantId ? state.entities[plantId] : null;
        if (plant && (!plant.traits || plant.traits.length === 0)) {
          assignTraits(plant);
          recordTraitsInJournal(state, plant);
          if (plant.traits.length) {
            fresh.push({
              kind: "trait",
              text: `${SPECIES[plant.species].name} ripens with traits: ${plant.traits.map(t => t.label).join(", ")}.`,
              actionId: a.id,
            });
          }
        }
      }
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
    seed.parentTraits  = (plant.traits ?? []).map(t => ({ ...t }));
    seed.species = plant.species;
    seed.cultivarId = plant.cultivarId;
    seed.donorCultivarId = seed.crossedWithCultivar ?? plant.donorCultivarId ?? null;
    seed.donorTraits = seed.crossedWithTraits ?? plant.donorTraits ?? [];
    seed.donorSeedId = null; // donor's seed ID is from a different parent — not tracked here
    seed.name = `${cultivarLabelFor(state, plant.species, plant.cultivarId)} ${SPECIES[plant.species].name} seed`;
    seed.generation = (plant.generation ?? 1) + 1;
    state.inventory.push({ id: seedId, species: plant.species });

    // Record on the lineage node that this plant produced this seed, so
    // future pedigree walks can hop "seed → producing plant → its parent
    // seed → its producing plant…" across seasons.
    if (state.lineage[plant.id]) {
      state.lineage[plant.id].producedSeedId = seed.id;
      state.lineage[plant.id].earnedTraits = (plant.traits ?? []).map(t => ({ ...t }));
    }

    // Stable-cultivar promotion: if this plant is a hybrid (or already a
    // local cultivar) and its (parent cultivar pair + trait fingerprint)
    // matches what we've seen 3 generations in a row, give it a name.
    promoteIfStable(plant);
  }

  function promoteIfStable(plant) {
    const isHybrid = plant.cultivarId && plant.cultivarId.includes("×");
    const isLocal = !!state.localCultivars[`${plant.species}:${plant.cultivarId}`];
    if (!isHybrid && !isLocal) return;
    const fingerprint = hybridFingerprint(plant);
    const key = `${plant.species}:${fingerprint}`;
    const rec = state.hybridStability[key] ?? { count: 0, lastSeason: 0 };
    rec.count = (rec.lastSeason === state.season.seasonNumber) ? rec.count : rec.count + 1;
    rec.lastSeason = state.season.seasonNumber;
    state.hybridStability[key] = rec;
    if (rec.count >= 3 && isHybrid) {
      const name = inventCultivarName(plant);
      const localId = `local-${Object.keys(state.localCultivars).length + 1}`;
      const cultivar = resolveCultivar(plant.species, plant.cultivarId, state.localCultivars);
      const base = cultivar?.base ?? { g_m: 22, g_w: 20, l_m: 14, l_n: 12, f_w: 35, f_n: 18, r_w: 45, r_m: 12 };
      const sens = cultivar?.sens ?? { water: 1, rain: 1 };
      state.localCultivars[`${plant.species}:${localId}`] = {
        id: localId, name, blurb: `Stable local strain bred in your garden (gen ${plant.generation}).`,
        base, sens, parentHybridId: plant.cultivarId, traits: (plant.inheritedTraits ?? []).map(t => t.id),
      };
      state.newCultivars.push({ species: plant.species, cultivarId: localId, name });
      addLogEntry({
        kind: "trait",
        text: `New cultivar stabilized: ${name} ${SPECIES[plant.species].name}. Future ${plant.cultivarId} hybrids breed true as this strain.`,
      });
    }
  }

  function hybridFingerprint(plant) {
    const traitIds = [...(plant.inheritedTraits ?? []).map(t => t.id), ...(plant.donorTraits ?? []).map(t => t.id)].sort();
    return `${plant.cultivarId}|${traitIds.join(",")}`;
  }

  function inventCultivarName(plant) {
    // Use the dominant trait flavour for a punchy name.
    const traitLabels = (plant.traits ?? [])
      .concat(plant.inheritedTraits ?? [])
      .map(t => t.label);
    const flavor = traitLabels[0] ?? "Garden";
    const parts = plant.cultivarId.split("×").map(p => {
      const c = CULTIVARS[plant.species]?.[p];
      return c?.name ?? p[0].toUpperCase() + p.slice(1);
    });
    return `${flavor} ${parts.join("-")}`;
  }

  // ── Public game API ────────────────────────────────────────────────────

  return {
    rng,
    state,
    EntityType,

    async start(opts = {}) {
      const save = opts.save ?? null;
      if (save) {
        // Continuing a multi-season run. Restore the player's basket,
        // journal, lineage, and any cultivars they stabilized.
        state.journal = { ...(save.journal ?? {}) };
        state.localCultivars = { ...(save.localCultivars ?? {}) };
        state.hybridStability = { ...(save.hybridStability ?? {}) };
        state.lineage = { ...(save.lineage ?? {}) };
        state.season.seasonNumber = save.seasonNumber ?? 1;
        for (const rec of save.inventory ?? []) {
          const id = rec.id;
          state.entities[id] = {
            entityType: EntityType.Item, id,
            name: rec.name ?? `${SPECIES[rec.species].name} seed`,
            species: rec.species, cultivarId: rec.cultivarId ?? defaultCultivarId(rec.species),
            // Inscriptions reference actions from prior seasons whose entities
            // no longer exist; drop them. Lineage info is preserved on the
            // seed's own fields (parentTraits, donorCultivarId, etc.).
            inscriptions: [],
            location: "garden",
            parentSummary: rec.parentSummary ?? null,
            parentTraits: rec.parentTraits ?? [],
            donorTraits: rec.donorTraits ?? [],
            donorCultivarId: rec.donorCultivarId ?? null,
            parentSeedId: rec.parentSeedId ?? null,
            donorSeedId: rec.donorSeedId ?? null,
            generation: rec.generation ?? 1,
          };
          state.items.push(id);
          state.seedIds.push(id);
          state.inventory.push({ id, species: rec.species });
        }
        addLogEntry({ kind: "intro", text: `Season ${state.season.seasonNumber}. Your saved basket is intact.` });
      } else {
        // Fresh start. One of each cultivar of the staple crops so the player
        // can see varietal differences from day one.
        const starters = [
          ["tomato", "roma"], ["tomato", "cherry"],
          ["bean", "bush"],
          ["clover", "white"],
          ["lavender", "english"],
          ["sunflower", "dwarf"],
        ];
        for (const [sp, cv] of starters) {
          const id = makeSeed(state, EntityType, rng, sp, { cultivarId: cv });
          state.inventory.push({ id, species: sp });
        }
        addLogEntry({ kind: "intro", text: "Spring. Your starter basket has a few cultivars to compare. Plant deliberately." });
      }
    },

    serialize() {
      return serializeForSave(state);
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
      const sens = plot.hostPlant ? (state.entities[plot.hostPlant].sens?.water ?? 1) : 1;
      plot.moisture = clamp(plot.moisture + Math.round(35 * sens), 0, 100);
      attributePlot(state, action.plotId, "water");
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
      attributePlot(state, action.plotId, "mulch");
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

      // Resolve which cultivar this seed becomes — and whether it's a hybrid
      // (if cross-pollinated last season). A hybrid takes the parent's
      // cultivar plus the donor's cultivar joined with "×".
      let cultivarId = seed.cultivarId ?? defaultCultivarId(seed.species);
      const donorTraits = (seed.donorTraits ?? []).slice(0, 1); // donor contributes 1 trait
      const inheritedTraits = (seed.parentTraits ?? []).slice(0, 2); // mother contributes up to 2
      if (seed.donorCultivarId && seed.donorCultivarId !== cultivarId) {
        // Build the canonical hybrid id (sorted for stability so
        // "roma×cherry" === "cherry×roma").
        const parts = [cultivarId, seed.donorCultivarId].sort();
        cultivarId = parts.join("×");
      }

      // Create the plant entity FIRST so we can precast it into the action.
      const plantId = makePlant(state, EntityType, rng, seed.species, action.plotId, {
        cultivarId,
        inheritedTraits,
        donorTraits,
        donorCultivarId: seed.donorCultivarId,
        parentSeedId: seed.id,
        donorSeedId: seed.donorSeedId,
        generation: (seed.generation ?? 1),
      });

      // The planted seed entity persists through the plant's life and is
      // returned to the basket at go-to-seed (with updated lineage info).
      // Cross-pollinate, if it fires mid-life, inscribes this same seed.
      state.entities[plantId].destinedSeedId = seed.id;
      // Record lineage node so cross-season pedigree walks keep working.
      state.lineage[plantId] = {
        id: plantId,
        species: seed.species,
        cultivarId,
        cultivarName: cultivarLabelFor(state, seed.species, cultivarId),
        plantedDay: state.day,
        seasonNumber: state.season.seasonNumber ?? 1,
        parentSeedId: seed.id,
        donorSeedId: seed.donorSeedId,
        inheritedTraits, donorTraits,
        generation: (seed.generation ?? 1),
      };

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
