// Promweek — Alex tries to ask Jordan to prom in one scene.
//
// All social logic — conditions, effects, outcome selection, Jordan's reaction
// repertoire — lives in sim.viv. The host here is intentionally thin:
//   * an adapter for the Viv runtime to read/write Jordan's relationship state
//   * a per-turn driver that fires the player's intent action and then drains
//     the urgent reactions Viv queues (the outcome variant and Jordan's reply)
//   * cosmetic glue: relationship-display labels, win/lose checks
//
// Jordan's *volition* — #PURSUIT or #GUARDED — is set by one of two scene-opens
// actions at game start. Viv conditions throughout reference @jordan.volition,
// so the volition genuinely changes which outcome and which Jordan reaction
// fires, not just the size of a delta.

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

// ── Scene definitions ────────────────────────────────────────────────────────

export const SCENES = {
  pursuit: {
    key: "pursuit",
    label: "An ordinary Tuesday",
    difficulty: "easier",
    sceneOpensAction: "scene-opens-pursuit",
    teaser: "Jordan keeps glancing your way. Something is in the air today.",
  },
  guarded: {
    key: "guarded",
    label: "After the rumor",
    difficulty: "harder",
    sceneOpensAction: "scene-opens-guarded",
    teaser: "Jordan's been keeping to themselves since last month. Tread carefully.",
  },
};

// ── Player intent catalogue ─────────────────────────────────────────────────

export const ACTIONS = [
  { name: "small-talk",  label: "Make small talk",   desc: "Keep it casual." },
  { name: "compliment",  label: "Give a compliment", desc: "Say something nice." },
  { name: "ask-opinion", label: "Ask their opinion", desc: "Get Jordan's take on something." },
  { name: "debate",      label: "Push back",         desc: "Challenge Jordan on something they said." },
  { name: "flirt",       label: "Flirt",             desc: "Try your luck." },
  { name: "apologize",   label: "Apologize",         desc: "Clear the air. Needs something to apologize for." },
  { name: "confide",     label: "Confide something", desc: "Share something personal." },
  { name: "invite-out",  label: "Invite them out",   desc: "Ask Jordan if they want to grab food." },
];

// Mirrors Viv-side gating conditions that matter for UI display.
// Viv enforces the rules; this just lets us lock the button before the click.
const UI_AVAILABILITY = {
  "apologize": (rel) => (rel.tension ?? 0) > 20,
  "debate":    (rel) => rel.hasSaid === true,
};

export function getAvailableActions(rel) {
  return ACTIONS.map(a => ({
    ...a,
    available: !UI_AVAILABILITY[a.name] || UI_AVAILABILITY[a.name](rel),
  }));
}

// ── Initial state ────────────────────────────────────────────────────────────

const INITIAL_REL = {
  friendship: 20,
  respect:    30,
  romance:    0,
  trust:      15,
  tension:    10,
  hasSaid:    false,
};

function buildInitialState(EntityType) {
  const entities = {
    school: { entityType: EntityType.Location, id: "school", name: "Northside High" },
    alex: {
      entityType: EntityType.Character,
      id: "alex", name: "Alex", location: "school", memories: {},
    },
    jordan: {
      entityType: EntityType.Character,
      id: "jordan", name: "Jordan", location: "school", memories: {},
      ...structuredClone(INITIAL_REL),
      volition: null,
    },
  };
  return {
    timestamp: 0,
    entities,
    characters: ["alex", "jordan"],
    locations: ["school"],
    items: [],
    actions: [],
    vivInternalState: null,
    turn: 0,
  };
}

function applyClamp(state) {
  const REL_KEYS = ["friendship", "respect", "romance", "trust", "tension"];
  for (const k of REL_KEYS) {
    const v = state.entities.jordan[k] ?? 0;
    state.entities.jordan[k] = Math.max(0, Math.min(100, v));
  }
}

// ── Relationship display + outcome ───────────────────────────────────────────

export function getRelationshipDisplay(rel) {
  const composite = rel.friendship * 0.4 + rel.respect * 0.3 + rel.trust * 0.2 + rel.romance * 0.1;

  const vibe =
    composite < 20 ? { label: "Barely acquaintances", tier: 0 } :
    composite < 35 ? { label: "Just classmates",      tier: 1 } :
    composite < 50 ? { label: "Getting warmer",       tier: 2 } :
    composite < 65 ? { label: "Becoming friends",     tier: 3 } :
    composite < 78 ? { label: "Close",                tier: 4 } :
                     { label: "Really close",         tier: 5 };

  const spark =
    rel.romance < 15 ? { label: "No spark",            tier: 0 } :
    rel.romance < 35 ? { label: "Maybe something?",    tier: 1 } :
    rel.romance < 55 ? { label: "Definitely something",tier: 2 } :
    rel.romance < 75 ? { label: "Clearly into you",    tier: 3 } :
                       { label: "Head over heels",     tier: 4 };

  const tension =
    rel.tension < 20 ? { label: "Comfortable",        tier: 0 } :
    rel.tension < 40 ? { label: "Slightly awkward",   tier: 1 } :
    rel.tension < 60 ? { label: "Tense",              tier: 2 } :
                       { label: "Very uncomfortable", tier: 3 };

  const goalProgress = Math.min(100, rel.friendship * 0.5 + rel.romance * 0.5);

  const jordanMood =
    rel.tension > 60                              ? "😒" :
    rel.romance > 60 && rel.friendship > 65       ? "🥰" :
    rel.romance > 35 && rel.friendship > 50       ? "😊" :
    rel.friendship > 40                           ? "🙂" :
    rel.friendship > 20                           ? "😐" :
                                                    "😑";

  return { vibe, spark, tension, goalProgress, jordanMood };
}

export function checkOutcome(rel) {
  if (rel.tension >= 80)                            return "lose";
  if (rel.friendship >= 75 && rel.romance >= 55)    return "win-date";
  if (rel.friendship >= 80)                         return "win-friends";
  return null;
}

// ── Headless simulation (Node runner convention) ─────────────────────────────

export async function runSim(runtime, bundle, seedStr, tickCount) {
  const game = initGame(runtime, bundle, "pursuit");
  const rng = mulberry32(hashSeed(seedStr));

  await game.start();

  const ticks = [];
  for (let i = 0; i < tickCount; i++) {
    const available = game.getAvailableActions().filter(a => a.available);
    if (available.length === 0) break;

    const action = available[Math.floor(rng() * available.length)];
    const result = await game.takeTurn(action.name);
    const events = [];
    if (result.intent)        events.push({ text: result.intent.gloss,        type: "intent" });
    if (result.outcome)       events.push({ text: result.outcome.gloss,       type: "outcome" });
    if (result.jordanReaction) events.push({ text: result.jordanReaction.gloss, type: "reaction" });

    ticks.push({ index: i, timestamp: i + 1, events, relationship: result.relationship, gameOutcome: result.gameOutcome });
    if (result.gameOutcome) break;
  }

  return { ticks };
}

export function summarize(tick) {
  const r = tick.relationship;
  const end = tick.gameOutcome ? ` → ${tick.gameOutcome}` : "";
  return `friendship:${r.friendship} romance:${r.romance} trust:${r.trust} tension:${r.tension}${end}`;
}


// ── The Viv-backed game ──────────────────────────────────────────────────────

export function initGame({ initializeVivRuntime, attemptAction, selectAction, EntityType }, bundle, sceneKey = "pursuit") {
  const scene = SCENES[sceneKey];
  if (!scene) throw new Error(`Unknown scene: ${sceneKey}`);

  const rng = mulberry32(hashSeed(`promweek-${sceneKey}`));
  const state = buildInitialState(EntityType);

  const adapter = {
    provisionActionID: () => makeUUID(rng),
    rng,
    enums: { PURSUIT: "PURSUIT", GUARDED: "GUARDED" },
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
        if (type === EntityType.Character) return state.characters.filter(id => state.entities[id].location === locationID);
        if (type === EntityType.Item)      return state.items.filter(id => state.entities[id].location === locationID);
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

  // Helpers
  const snapshotActions = () => new Set(state.actions);
  const newActionsSince = (before) => state.actions
    .filter(id => !before.has(id))
    .map(id => state.entities[id]);

  // Drain urgent reactions queued for a particular initiator, returning all
  // new actions that fired in order.
  async function drainUrgent(initiatorID) {
    const collected = [];
    // Loop: a single selectAction call processes at most one urgent reaction
    // per round. We need to keep calling until no new action fires.
    for (let safety = 0; safety < 6; safety++) {
      const before = snapshotActions();
      const result = await selectAction({ initiatorID, urgentOnly: true });
      const fresh = newActionsSince(before);
      if (fresh.length === 0) break;
      collected.push(...fresh);
      if (!result) break;
    }
    return collected;
  }

  // Fire the scene-opening action to set @jordan.volition.
  async function openScene() {
    const before = snapshotActions();
    await attemptAction({
      actionName: scene.sceneOpensAction,
      initiatorID: "jordan",
      precastBindings: { jordan: ["jordan"], alex: ["alex"] },
      suppressConditions: true,
    });
    return newActionsSince(before);
  }

  let opening = null;

  return {
    scene,

    async start() {
      const openingActions = await openScene();
      opening = openingActions[0] ?? null;
      return {
        scene,
        opening: opening ? { gloss: opening.gloss, name: opening.name } : null,
        relationship: structuredClone(state.entities.jordan),
        display: getRelationshipDisplay(state.entities.jordan),
      };
    },

    getState() {
      const rel = structuredClone(state.entities.jordan);
      return {
        turn: state.turn,
        scene,
        relationship: rel,
        display: getRelationshipDisplay(rel),
        outcome: checkOutcome(rel),
      };
    },

    getAvailableActions() {
      return getAvailableActions(state.entities.jordan);
    },

    async takeTurn(actionName) {
      // 1. Fire the player's intent action. This action's effects (if any)
      //    plus its urgent reactions (outcome variant + Jordan's response)
      //    are queued.
      const before = snapshotActions();
      await attemptAction({
        actionName,
        initiatorID: "alex",
        precastBindings: { alex: ["alex"], jordan: ["jordan"] },
      });
      const intentActions = newActionsSince(before);
      if (intentActions.length === 0) {
        throw new Error(`Action "${actionName}" was blocked by its Viv conditions.`);
      }
      applyClamp(state);

      // 2. Drain Alex's urgent reactions — the outcome variant (if the intent
      //    queued one).
      const alexUrgent = await drainUrgent("alex");
      applyClamp(state);

      // 3. Drain Jordan's urgent reactions — Jordan's response.
      const jordanUrgent = await drainUrgent("jordan");
      applyClamp(state);

      state.timestamp += 10;
      state.turn += 1;

      const rel = structuredClone(state.entities.jordan);
      return {
        intent: intentActions[0],
        outcome: alexUrgent[0] ?? null,
        jordanReaction: jordanUrgent[0] ?? null,
        relationship: rel,
        display: getRelationshipDisplay(rel),
        gameOutcome: checkOutcome(rel),
      };
    },
  };
}
