// Promweek — two-act high school social physics.
//
// All social logic — conditions, effects, exchange selection, target reactions,
// and trigger rules — lives in sim.viv. The host here is intentionally thin:
//
//   * builds the storyworld (5 characters, 6 CKB items, initial network values)
//   * provides the Viv adapter (read/write entity state, enums, etc.)
//   * drives one turn at a time:
//       - host writes alex.intent to the player's chosen intent
//       - host fires `player-turn` with @alex + @target precast
//       - host drains urgent reactions (exchange selector → reaction → triggers)
//   * computes derived UI labels (relationship vibes, prom outcome)
//
// Act transition: after a fixed number of Act 1 turns, the host fires
// `act2-opens` to switch the storyworld into Act 2. Different Viv conditions
// then gate which exchanges fire.

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

// ── Storyworld definitions ──────────────────────────────────────────────────

export const ACT1_TURNS = 6;
export const ACT2_TURNS = 4;

// Cultural Knowledge Base: items have a zeitgeist `coolness` score. Each
// character has personal `likes` / `dislikes` / `wants` referencing item IDs.
export const ITEM_DEFS = {
  "scientific-calculator": { name: "scientific calculator", coolness: -30 },
  "poetry-book":           { name: "poetry book",           coolness: -10 },
  "comic-book":            { name: "comic book",            coolness:   5 },
  "vinyl-records":         { name: "vinyl records",         coolness:  25 },
  "football":              { name: "football",              coolness:  30 },
  "motorcycle":            { name: "motorcycle",            coolness:  50 },
};

export const CHARACTER_DEFS = {
  alex: {
    name: "Alex",
    portrait: "😎",
    traits: ["charismatic", "ambitious", "impulsive"],
    likes:    ["motorcycle", "vinyl-records", "comic-book"],
    dislikes: ["scientific-calculator"],
    wants:    ["motorcycle"],
  },
  jordan: {
    name: "Jordan",
    portrait: "🤓",
    traits: ["intellectual", "guarded", "witty"],
    likes:    ["poetry-book", "scientific-calculator", "vinyl-records"],
    dislikes: ["football"],
    wants:    ["poetry-book"],
  },
  riley: {
    name: "Riley",
    portrait: "💁",
    traits: ["popular", "attractive", "vain"],
    likes:    ["football", "motorcycle"],
    dislikes: ["scientific-calculator", "comic-book"],
    wants:    [],
  },
  sam: {
    name: "Sam",
    portrait: "😏",
    traits: ["loyal", "sarcastic", "helpful"],
    likes:    ["comic-book", "vinyl-records", "scientific-calculator"],
    dislikes: [],
    wants:    ["comic-book"],
  },
  casey: {
    name: "Casey",
    portrait: "🎨",
    traits: ["creative", "authentic", "thoughtful"],
    likes:    ["poetry-book", "vinyl-records", "comic-book"],
    dislikes: ["football"],
    wants:    ["poetry-book"],
  },
};

// Initial pairwise networks. Mirrors Prom Week's social networks: scalar,
// non-reciprocal, private feelings. 0–100 each.
const INITIAL_NETWORKS = {
  // Alex's view of others
  alex: {
    jordan: { buddy: 18, romance: 5,  cool: 25, tension: 5  },
    riley:  { buddy: 15, romance: 10, cool: 40, tension: 0  },
    sam:    { buddy: 55, romance: 0,  cool: 30, tension: 0  },
    casey:  { buddy: 22, romance: 3,  cool: 28, tension: 0  },
  },
  // Jordan's view
  jordan: {
    alex:   { buddy: 15, romance: 0,  cool: 22, tension: 8  },
    riley:  { buddy: 5,  romance: 0,  cool: 15, tension: 18 },
    sam:    { buddy: 20, romance: 0,  cool: 22, tension: 0  },
    casey:  { buddy: 40, romance: 2,  cool: 35, tension: 0  },
  },
  // Riley's view
  riley: {
    alex:   { buddy: 18, romance: 8,  cool: 35, tension: 0  },
    jordan: { buddy: 5,  romance: 0,  cool: 8,  tension: 20 },
    sam:    { buddy: 15, romance: 0,  cool: 18, tension: 5  },
    casey:  { buddy: 8,  romance: 0,  cool: 12, tension: 6  },
  },
  // Sam's view
  sam: {
    alex:   { buddy: 60, romance: 0,  cool: 35, tension: 0  },
    jordan: { buddy: 25, romance: 0,  cool: 28, tension: 0  },
    riley:  { buddy: 10, romance: 0,  cool: 20, tension: 8  },
    casey:  { buddy: 30, romance: 0,  cool: 32, tension: 0  },
  },
  // Casey's view
  casey: {
    alex:   { buddy: 22, romance: 0,  cool: 26, tension: 0  },
    jordan: { buddy: 38, romance: 2,  cool: 35, tension: 0  },
    riley:  { buddy: 8,  romance: 0,  cool: 12, tension: 6  },
    sam:    { buddy: 28, romance: 0,  cool: 30, tension: 0  },
  },
};

// Initial public relationships. Symmetric: friends/dating/enemies are
// reciprocal in Prom Week's design.
const INITIAL_RELATIONSHIPS = {
  alex:   { sam:    "friends" },
  sam:    { alex:   "friends" },
};

// ── Player intent + action catalogue ────────────────────────────────────────

export const INTENTS = {
  WARM:  { key: "WARM",  label: "Warm",     desc: "Be friendly. Small talk, compliments, share an interest.",       color: "warm"  },
  SPICY: { key: "SPICY", label: "Romantic", desc: "Test the romantic water. Flirt, confide, ask out.",              color: "spicy" },
  BOLD:  { key: "BOLD",  label: "Bold",     desc: "Push. Debate, confront, spread a rumor.",                        color: "bold"  },
  MEND:  { key: "MEND",  label: "Mend",     desc: "Repair things. Apologize sincerely, compliment from the heart.", color: "mend"  },
};

// ── Initial state ───────────────────────────────────────────────────────────

function buildInitialState(EntityType) {
  const entities = {};
  const characters = [];
  const items = [];
  const locations = [];

  // Locations
  for (const [id, name] of [["school", "Northside High"], ["prom", "The Prom"]]) {
    entities[id] = { entityType: EntityType.Location, id, name };
    locations.push(id);
  }

  // Items
  for (const [id, def] of Object.entries(ITEM_DEFS)) {
    entities[id] = {
      entityType: EntityType.Item,
      id,
      name: def.name,
      coolness: def.coolness,
      location: "school",
      inscriptions: [],
    };
    items.push(id);
  }

  // Characters
  for (const [id, def] of Object.entries(CHARACTER_DEFS)) {
    const networks = INITIAL_NETWORKS[id] ?? {};
    const buddy = {}, romance = {}, cool = {}, tension = {};
    for (const otherID of Object.keys(CHARACTER_DEFS)) {
      if (otherID === id) continue;
      const n = networks[otherID] ?? { buddy: 0, romance: 0, cool: 0, tension: 0 };
      buddy[otherID]   = n.buddy;
      romance[otherID] = n.romance;
      cool[otherID]    = n.cool;
      tension[otherID] = n.tension;
    }
    entities[id] = {
      entityType: EntityType.Character,
      id,
      name: def.name,
      location: "school",
      memories: {},
      traits: [...def.traits],
      likes: [...def.likes],
      dislikes: [...def.dislikes],
      wants: [...def.wants],
      relationships: { ...(INITIAL_RELATIONSHIPS[id] ?? {}) },
      statuses: { popular: false, embarrassed: false, crush: {} },
      buddy, romance, cool, tension,
      // Alex-only — null on others, set per turn by the host.
      intent: null,
      act: null,
    };
    characters.push(id);
  }

  return {
    timestamp: 0,
    entities,
    characters,
    locations,
    items,
    actions: [],
    vivInternalState: null,
    turn: 0,
    actNumber: 1,
  };
}

function clamp(v) {
  if (v == null) return v;
  return Math.max(-100, Math.min(100, v));
}

function clampNetworks(state) {
  const keys = ["buddy", "romance", "cool", "tension"];
  for (const cid of state.characters) {
    const c = state.entities[cid];
    for (const k of keys) {
      if (!c[k]) continue;
      for (const otherID of Object.keys(c[k])) {
        c[k][otherID] = clamp(c[k][otherID] ?? 0);
        if (c[k][otherID] < 0 && k !== "buddy" && k !== "cool") c[k][otherID] = 0;
        if (c[k][otherID] < -30 && k === "buddy") c[k][otherID] = -30;
      }
    }
  }
}

// ── Headless simulation (Node runner convention) ────────────────────────────

export async function runSim(runtime, bundle, seedStr, tickCount) {
  const game = initGame(runtime, bundle);
  const rng = mulberry32(hashSeed(seedStr));
  await game.start();

  const ticks = [];
  for (let i = 0; i < tickCount; i++) {
    if (game.getState().outcome) break;

    const targets = game.getCandidateTargets();
    const target = targets[Math.floor(rng() * targets.length)];
    const intents = Object.keys(INTENTS);
    const intent = intents[Math.floor(rng() * intents.length)];

    const result = await game.takeTurn(target, intent);
    const events = [];
    if (result.intent)   events.push({ text: result.intent.gloss,   type: "intent"   });
    if (result.exchange) events.push({ text: result.exchange.gloss, type: "exchange" });
    if (result.response) events.push({ text: result.response.gloss, type: "response" });
    for (const t of result.triggers ?? []) {
      events.push({ text: t.gloss, type: "trigger" });
    }

    ticks.push({
      index: i,
      timestamp: i + 1,
      events,
      relationship: result.snapshot,
      gameOutcome: result.outcome,
      actNumber: result.actNumber,
    });
    if (result.outcome) break;
  }

  return { ticks };
}

export function summarize(tick) {
  const s = tick.relationship;
  const o = tick.gameOutcome;
  const end = o ? ` → ${o.kind}${o.partner ? `(${o.partner})` : ""}` : "";
  const rels = Object.entries(s.relationships).filter(([_, v]) => v != null)
    .map(([k, v]) => `${k}:${v}`).join(" ");
  return `act${tick.actNumber} alex→${s.focus}{b:${s.focusBuddy} r:${s.focusRomance} t:${s.focusTension}} rels:[${rels}]${end}`;
}

// ── Display + outcome helpers ───────────────────────────────────────────────

export function getSnapshot(state, focusID) {
  const alex = state.entities.alex;
  const focus = focusID ?? Object.keys(CHARACTER_DEFS).find(id => id !== "alex");
  return {
    focus,
    focusBuddy:    alex.buddy[focus]   ?? 0,
    focusRomance:  alex.romance[focus] ?? 0,
    focusCool:     alex.cool[focus]    ?? 0,
    focusTension:  alex.tension[focus] ?? 0,
    relationships: { ...alex.relationships },
    crushes:       { ...(alex.statuses?.crush ?? {}) },
    popular:       alex.statuses?.popular ?? false,
  };
}

// Prom outcome: examined when game ends. Looks at Alex's relationships
// and feelings at prom's close to compute a "happy ending".
export function checkOutcome(state) {
  if (state.actNumber < 2) return null;
  if (state.turn < ACT1_TURNS + ACT2_TURNS) return null;
  const alex = state.entities.alex;

  // Did Alex end up dating someone?
  const datingPartner = Object.entries(alex.relationships).find(([_, v]) => v === "dating");
  // Friend count
  const friends = Object.entries(alex.relationships).filter(([_, v]) => v === "friends").map(([k]) => k);
  const enemies = Object.entries(alex.relationships).filter(([_, v]) => v === "enemies").map(([k]) => k);

  if (datingPartner) {
    return { kind: "win-date", partner: datingPartner[0], friends, enemies };
  }
  if (friends.length >= 3) {
    return { kind: "win-friends", friends, enemies };
  }
  if (enemies.length >= 2) {
    return { kind: "lose-pariah", friends, enemies };
  }
  return { kind: "neutral", friends, enemies };
}

// Per-character "vibe" label for UI.
export function getCharacterVibe(state, otherID) {
  const alex = state.entities.alex;
  const buddy   = alex.buddy[otherID]   ?? 0;
  const romance = alex.romance[otherID] ?? 0;
  const tension = alex.tension[otherID] ?? 0;
  const rel = alex.relationships[otherID];

  if (rel === "dating")  return { label: "Dating",       cls: "rel-dating"  };
  if (rel === "enemies") return { label: "Enemies",      cls: "rel-enemies" };
  if (rel === "friends") {
    if (romance >= 40) return { label: "Friends, sparking", cls: "rel-friends-spark" };
    return { label: "Friends",       cls: "rel-friends" };
  }
  if (tension >= 30) return { label: "Tense",            cls: "rel-tense" };
  if (romance >= 30) return { label: "Something there?", cls: "rel-spark" };
  if (buddy   >= 30) return { label: "Warming up",       cls: "rel-warm" };
  if (buddy   <= 5)  return { label: "Barely acquainted", cls: "rel-cold" };
  return                       { label: "Classmates",     cls: "rel-neutral" };
}

// ── The Viv-backed game ─────────────────────────────────────────────────────

export function initGame({ initializeVivRuntime, attemptAction, selectAction, EntityType }, bundle) {
  const rng = mulberry32(hashSeed(`promweek-${Date.now()}-${Math.random()}`));
  const state = buildInitialState(EntityType);

  const adapter = {
    provisionActionID: () => makeUUID(rng),
    rng,
    enums: {
      ACT_ONE: "ACT_ONE",
      ACT_TWO: "ACT_TWO",
      WARM:    "WARM",
      SPICY:   "SPICY",
      BOLD:    "BOLD",
      MEND:    "MEND",
    },
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

  const snapshotActions = () => new Set(state.actions);
  const newActionsSince = (before) => state.actions
    .filter(id => !before.has(id))
    .map(id => state.entities[id]);

  async function drainUrgent(initiatorID) {
    const collected = [];
    for (let safety = 0; safety < 20; safety++) {
      const before = snapshotActions();
      await selectAction({ initiatorID, urgentOnly: true });
      const fresh = newActionsSince(before);
      if (fresh.length === 0) break;
      collected.push(...fresh);
    }
    return collected;
  }

  async function fireScene(actionName, initiatorID = "alex") {
    const before = snapshotActions();
    await attemptAction({
      actionName,
      initiatorID,
      precastBindings: { alex: [initiatorID] },
      suppressConditions: true,
    });
    return newActionsSince(before);
  }

  function moveAllTo(locationID) {
    for (const cid of state.characters) state.entities[cid].location = locationID;
    for (const iid of state.items)      state.entities[iid].location = locationID;
  }

  return {
    state,

    async start() {
      const opening = await fireScene("act1-opens", "alex");
      return {
        opening: opening[0] ?? null,
        actNumber: state.actNumber,
        turn: state.turn,
      };
    },

    getState() {
      return {
        turn: state.turn,
        actNumber: state.actNumber,
        outcome: checkOutcome(state),
        characters: state.characters.filter(id => id !== "alex").map(id => ({
          id,
          name: state.entities[id].name,
          portrait: CHARACTER_DEFS[id].portrait,
          traits: state.entities[id].traits,
          vibe: getCharacterVibe(state, id),
        })),
        alexStatuses: { ...state.entities.alex.statuses },
      };
    },

    getCandidateTargets() {
      return state.characters.filter(id => id !== "alex");
    },

    getSnapshot(focusID) {
      return getSnapshot(state, focusID);
    },

    getCharacter(id) {
      return state.entities[id];
    },

    async takeTurn(targetID, intentKey) {
      if (!state.entities[targetID] || targetID === "alex") {
        throw new Error(`Invalid target: ${targetID}`);
      }
      if (!INTENTS[intentKey]) {
        throw new Error(`Invalid intent: ${intentKey}`);
      }

      state.entities.alex.intent = intentKey;

      const before = snapshotActions();
      await attemptAction({
        actionName: "player-turn",
        initiatorID: "alex",
        precastBindings: { alex: ["alex"], target: [targetID] },
      });
      const intentActions = newActionsSince(before);

      // Drain urgent for both Alex (exchange selector + trigger queueing)
      // and the target (response).
      const alexUrgent   = await drainUrgent("alex");
      const targetUrgent = await drainUrgent(targetID);
      const alexFollowup = await drainUrgent("alex"); // triggers queued during exchange
      clampNetworks(state);

      state.timestamp += 10;
      state.turn += 1;

      // Filter out the structural meta-action `run-triggers` and the
      // selector-driven dispatch from the surfaced events.
      const allNew = [...intentActions, ...alexUrgent, ...targetUrgent, ...alexFollowup];
      const exchange = allNew.find(a => isExchange(a.name));
      const response = allNew.find(a => isResponse(a.name));
      const triggers = allNew.filter(a => isTrigger(a.name));

      // Act transition.
      if (state.actNumber === 1 && state.turn >= ACT1_TURNS) {
        await fireScene("act2-opens", "alex");
        moveAllTo("prom");
        state.actNumber = 2;
      }

      return {
        intent: intentActions[0] ?? null,
        exchange,
        response,
        triggers,
        snapshot: getSnapshot(state, targetID),
        actNumber: state.actNumber,
        outcome: checkOutcome(state),
      };
    },
  };
}

// ── Action-name classifiers ─────────────────────────────────────────────────

const EXCHANGE_NAMES = new Set([
  "public-declaration", "slow-dance", "prom-confess", "ask-to-dance", "chat-prom",
  "ask-out", "flirt-bold", "flirt-soft", "confide-secret",
  "confront", "spread-rumor", "debate-target",
  "apologize-deep", "sincere-compliment",
  "share-interest", "bond-over-lame", "compliment", "small-talk",
  "awkward-pause",
]);
const RESPONSE_NAMES = new Set([
  "react-fuming", "react-thrilled", "react-icy", "react-warm", "react-cool",
]);
const TRIGGER_NAMES = new Set([
  "become-friends", "become-dating", "become-enemies", "set-has-crush",
]);

function isExchange(n) { return EXCHANGE_NAMES.has(n); }
function isResponse(n) { return RESPONSE_NAMES.has(n); }
function isTrigger(n)  { return TRIGGER_NAMES.has(n);  }
