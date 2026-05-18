// Promweek — two-act high school social physics with utility-scored action menus.
//
// All social effects, reactions, and trigger rules live in sim.viv. Each
// concrete action is gated by a single condition: `~volition(...) > 0`.
// The volition function (defined below) sums rule weights based on the
// current social state — traits, networks, statuses, relationships, act —
// and returns a score (or null when the action can't apply at all).
//
// The same function feeds the player's menu: for the selected target, the
// host enumerates every concrete action, computes its volition, and shows
// the ones with score > 0, sorted by score. The player picks a specific
// Viv action; Viv evaluates the condition, fires the action, applies
// effects, and queues the target's response plus the trigger rules.

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

// ── Player goals ────────────────────────────────────────────────────────────
//
// Five preauthored goals, one picked at random each run. Each goal has:
//   check(state, outcome) → boolean  (evaluated at game end)
//   successText(state, outcome) → string
//   failText → string

export const PLAYER_GOALS = [
  {
    id: "find-a-date",
    title: "Find a Date",
    flavor: "Prom without a date feels incomplete. Ask someone who matters — really ask them.",
    hint: "Build romance and buddy high with one person, ask them out in Act 1, then keep the momentum at prom.",
    check: (_state, outcome) => outcome?.kind === "win-date",
    successText: (_state, outcome) =>
      `You and ${CHARACTER_DEFS[outcome.partner].name} are going to prom together. Night saved.`,
    failText: "Prom came and went solo. Romance takes more than good intentions.",
  },
  {
    id: "crack-jordan",
    title: "Crack Jordan",
    flavor: "Jordan keeps everyone at arm's length. Most people give up. You're not most people.",
    hint: "Jordan responds to sincerity, shared interests, and a good debate. Cheap flattery won't cut it.",
    check: (state) => {
      const rel = state.entities.alex?.relationships?.jordan;
      return rel === "friends" || rel === "dating";
    },
    successText: () => "You got through to Jordan. That's genuinely hard to do.",
    failText: "Jordan stayed guarded to the end. A different approach might have worked.",
  },
  {
    id: "life-of-the-party",
    title: "Life of the Party",
    flavor: "Forget one perfect night — leave prom with everyone thinking you're the best person there.",
    hint: "End prom as friends (or more) with at least 3 people. Not a single enemy.",
    check: (state) => {
      const rels = state.entities.alex?.relationships ?? {};
      const friends = Object.values(rels).filter(v => v === "friends" || v === "dating").length;
      const enemies = Object.values(rels).filter(v => v === "enemies").length;
      return friends >= 3 && enemies === 0;
    },
    successText: () => "Three real connections, zero drama. You made everyone feel seen.",
    failText: "Either short on friends or trailing enemies. The room-charming fell short.",
  },
  {
    id: "grand-gesture",
    title: "Grand Gesture",
    flavor: "Prom is a once-in-a-lifetime stage. Step onto that dance floor and say it where everyone can hear.",
    hint: "Use the Public Declaration action at prom — whatever happens next is beside the point.",
    check: (state) =>
      state.actions.some(id => state.entities[id]?.name === "public-declaration"),
    successText: () =>
      "You stepped up and said it in front of everyone. Whatever happened after — that took guts.",
    failText: "The moment came. You didn't take it. The dance floor stayed empty.",
  },
  {
    id: "stir-the-pot",
    title: "Stir the Pot",
    flavor: "Prom is theater. Play the villain for a bit — just don't let the curtain fall with you alone on stage.",
    hint: "Spread at least one rumor in Act 1, but still leave prom with at least one friend.",
    check: (state) => {
      const rumorUsed = state.actions.some(id => state.entities[id]?.name === "spread-rumor");
      const rels = state.entities.alex?.relationships ?? {};
      const friends = Object.values(rels).filter(v => v === "friends" || v === "dating").length;
      return rumorUsed && friends >= 1;
    },
    successText: () => "Drama started, friendships kept. That's a tricky balance.",
    failText: "Either you played it safe, or the drama swallowed you whole.",
  },
];

// ── Storyworld definitions ──────────────────────────────────────────────────

export const ACT1_TURNS = 6;
export const ACT2_TURNS = 4;

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

const INITIAL_NETWORKS = {
  alex: {
    jordan: { buddy: 18, romance: 5,  cool: 25, tension: 5  },
    riley:  { buddy: 15, romance: 10, cool: 40, tension: 0  },
    sam:    { buddy: 55, romance: 0,  cool: 30, tension: 0  },
    casey:  { buddy: 22, romance: 3,  cool: 28, tension: 0  },
  },
  jordan: {
    alex:   { buddy: 15, romance: 0,  cool: 22, tension: 8  },
    riley:  { buddy: 5,  romance: 0,  cool: 15, tension: 18 },
    sam:    { buddy: 20, romance: 0,  cool: 22, tension: 0  },
    casey:  { buddy: 40, romance: 2,  cool: 35, tension: 0  },
  },
  riley: {
    alex:   { buddy: 18, romance: 8,  cool: 35, tension: 0  },
    jordan: { buddy: 5,  romance: 0,  cool: 8,  tension: 20 },
    sam:    { buddy: 15, romance: 0,  cool: 18, tension: 5  },
    casey:  { buddy: 8,  romance: 0,  cool: 12, tension: 6  },
  },
  sam: {
    alex:   { buddy: 60, romance: 0,  cool: 35, tension: 0  },
    jordan: { buddy: 25, romance: 0,  cool: 28, tension: 0  },
    riley:  { buddy: 10, romance: 0,  cool: 20, tension: 8  },
    casey:  { buddy: 30, romance: 0,  cool: 32, tension: 0  },
  },
  casey: {
    alex:   { buddy: 22, romance: 0,  cool: 26, tension: 0  },
    jordan: { buddy: 38, romance: 2,  cool: 35, tension: 0  },
    riley:  { buddy: 8,  romance: 0,  cool: 12, tension: 6  },
    sam:    { buddy: 28, romance: 0,  cool: 30, tension: 0  },
  },
};

const INITIAL_RELATIONSHIPS = {
  alex:   { sam:    "friends" },
  sam:    { alex:   "friends" },
};

// ── Action catalogue (single source of truth for the player menu) ──────────
//
// Each entry: name (matches Viv action), label, blurb, category (for UI
// grouping/coloring), act (which act it's available in).

export const ACTION_CATALOG = [
  // ── Act 1 ──
  { name: "small-talk",         label: "Make small talk",      desc: "Low-stakes chitchat. Always safe.",                   category: "warm",  act: 1 },
  { name: "compliment",         label: "Compliment them",      desc: "A light kindness.",                                   category: "warm",  act: 1 },
  { name: "share-interest",     label: "Share an interest",    desc: "Talk about something you both like (cool).",          category: "warm",  act: 1 },
  { name: "bond-over-lame",     label: "Bond over a lame thing", desc: "Geek out together over something everyone hates.",  category: "warm",  act: 1 },
  { name: "sincere-compliment", label: "Compliment, sincerely",desc: "Something specific and true.",                        category: "mend",  act: 1 },
  { name: "flirt-soft",         label: "Flirt softly",         desc: "Test the water with a knowing look.",                 category: "spicy", act: 1 },
  { name: "flirt-bold",         label: "Flirt boldly",         desc: "Lean in. No subtlety.",                               category: "spicy", act: 1 },
  { name: "confide-secret",     label: "Confide something",    desc: "Trust them with something personal.",                 category: "spicy", act: 1 },
  { name: "ask-out",            label: "Ask them out",         desc: "Make it a real ask.",                                 category: "spicy", act: 1 },
  { name: "debate-target",      label: "Push back on them",    desc: "Challenge their take. Productively.",                 category: "bold",  act: 1 },
  { name: "confront",           label: "Confront them",        desc: "Call out the elephant in the room.",                  category: "bold",  act: 1 },
  { name: "spread-rumor",       label: "Spread a rumor",       desc: "Tell anyone who'll listen.",                          category: "bold",  act: 1 },
  { name: "apologize-deep",     label: "Apologize",            desc: "A real apology. Needs something to apologize for.",   category: "mend",  act: 1 },
  // ── Act 2 ──
  { name: "chat-prom",          label: "Catch up at the punch table", desc: "Easy prom conversation.",                      category: "prom",  act: 2 },
  { name: "ask-to-dance",       label: "Ask to dance",         desc: "Offer your hand.",                                    category: "prom",  act: 2 },
  { name: "slow-dance",         label: "Slow dance",           desc: "Pull them close. Nobody else exists for a minute.",   category: "prom",  act: 2 },
  { name: "prom-confess",       label: "Confess in a corner",  desc: '"I should have said this sooner."',                   category: "prom",  act: 2 },
  { name: "public-declaration", label: "Public declaration",   desc: "Announce it. Loud. To everyone.",                     category: "prom",  act: 2 },
];

export const CATEGORIES = [
  { key: "warm",  label: "Warm"     },
  { key: "spicy", label: "Romantic" },
  { key: "bold",  label: "Bold"     },
  { key: "mend",  label: "Mend"     },
  { key: "prom",  label: "Prom"     },
];

// ── Volition rules ─────────────────────────────────────────────────────────
//
// One function per action. Returns a numeric score, or null if the action
// can't apply at all (wrong act, missing CKB item, hard prereq unmet).
//
// Scores typically run 0–25. Baselines 3–6, modifiers ±2–15. The action
// is visible to the player and runnable in Viv iff volition > 0. So most
// rule blocks open with "early-return null" guards for fundamental gating,
// then sum positive/negative modifiers reflecting how much the actor
// *wants* this with the current state.

const VOLITION_RULES = {
  "small-talk": (a, o, s) => {
    if (a.act !== "ACT_ONE") return null;
    let v = 5;
    if (o.tension?.[a.id] >= 20) v += 3;     // smooths things
    if (a.relationships?.[o.id] === "enemies") v -= 8;
    return v;
  },

  "compliment": (a, o, s) => {
    if (a.act !== "ACT_ONE") return null;
    let v = 4;
    if (a.traits.includes("charismatic")) v += 2;
    if (o.traits.includes("vain"))         v += 3;  // loves it
    if (o.tension?.[a.id] >= 15)            v += 3;  // smooth
    if (a.relationships?.[o.id] === "enemies") v -= 6;
    return v;
  },

  "share-interest": (a, o, s) => {
    if (a.act !== "ACT_ONE") return null;
    const shared = (a.likes ?? []).filter(id => (o.likes ?? []).includes(id));
    const coolShared = shared.filter(id => (s.entities[id]?.coolness ?? 0) >= 0);
    if (coolShared.length === 0) return null;
    let v = 5 + coolShared.length * 2;
    if (a.traits.includes("thoughtful")) v += 2;
    return v;
  },

  "bond-over-lame": (a, o, s) => {
    if (a.act !== "ACT_ONE") return null;
    const shared = (a.likes ?? []).filter(id => (o.likes ?? []).includes(id));
    const lameShared = shared.filter(id => (s.entities[id]?.coolness ?? 0) < 0);
    if (lameShared.length === 0) return null;
    let v = 7 + lameShared.length * 3;
    if (a.traits.includes("authentic")) v += 3;
    if (o.traits.includes("vain")) v -= 4;  // they care what people think
    return v;
  },

  "sincere-compliment": (a, o, s) => {
    if (a.act !== "ACT_ONE") return null;
    let v = 4;
    if (o.tension?.[a.id] >= 10) v += 4;
    if (o.traits.includes("authentic")) v += 3;
    if (o.traits.includes("guarded"))   v += 2;  // disarms
    return v;
  },

  "flirt-soft": (a, o, s) => {
    if (a.act !== "ACT_ONE") return null;
    if (a.relationships?.[o.id] === "enemies") return null;
    let v = 3;
    if ((a.romance?.[o.id] ?? 0) >= 8)  v += 4;
    if ((o.romance?.[a.id] ?? 0) >= 8)  v += 4;
    if (a.traits.includes("charismatic")) v += 2;
    if (o.tension?.[a.id] >= 25) v -= 6;
    return v;
  },

  "flirt-bold": (a, o, s) => {
    if (a.act !== "ACT_ONE") return null;
    if (a.relationships?.[o.id] === "enemies") return null;
    if ((a.romance?.[o.id] ?? 0) < 10) return null;   // hard prereq
    let v = 4;
    if ((o.romance?.[a.id] ?? 0) >= 20) v += 8;
    if (a.traits.includes("charismatic")) v += 3;
    if (a.traits.includes("impulsive"))   v += 2;
    if (o.tension?.[a.id] >= 25) v -= 12;
    if (o.traits.includes("guarded"))   v -= 3;
    return v;
  },

  "confide-secret": (a, o, s) => {
    if (a.act !== "ACT_ONE") return null;
    if ((a.buddy?.[o.id] ?? 0) < 20) return null;
    let v = 5;
    if ((o.buddy?.[a.id] ?? 0) >= 30) v += 5;
    if (a.relationships?.[o.id] === "friends") v += 4;
    if (o.tension?.[a.id] >= 20) v -= 5;
    if (a.traits.includes("guarded")) v -= 2;
    return v;
  },

  "ask-out": (a, o, s) => {
    if (a.act !== "ACT_ONE") return null;
    if ((a.romance?.[o.id] ?? 0) < 25) return null;
    if ((a.buddy?.[o.id]   ?? 0) < 25) return null;
    let v = 6;
    if ((o.romance?.[a.id] ?? 0) >= 30) v += 8;
    if ((o.buddy?.[a.id]   ?? 0) >= 30) v += 4;
    if (a.traits.includes("ambitious")) v += 2;
    if (o.tension?.[a.id] >= 15) v -= 10;
    return v;
  },

  "debate-target": (a, o, s) => {
    if (a.act !== "ACT_ONE") return null;
    let v = 4;
    if (a.traits.includes("intellectual")) v += 4;
    if (o.traits.includes("intellectual")) v += 4;
    if (o.traits.includes("witty"))        v += 2;
    if (o.tension?.[a.id] >= 30) v -= 5;
    return v;
  },

  "confront": (a, o, s) => {
    if (a.act !== "ACT_ONE") return null;
    const tens = a.tension?.[o.id] ?? 0;
    if (tens < 15) return null;
    let v = 3 + Math.floor(tens / 4);
    if (a.traits.includes("impulsive")) v += 2;
    if (a.traits.includes("guarded"))   v -= 3;
    return v;
  },

  "spread-rumor": (a, o, s) => {
    if (a.act !== "ACT_ONE") return null;
    if (a.relationships?.[o.id] === "friends") return null;
    if (a.relationships?.[o.id] === "dating")  return null;
    let v = -2;
    if ((a.tension?.[o.id] ?? 0) >= 10) v += 8;
    if (a.relationships?.[o.id] === "enemies") v += 6;
    if (o.traits.includes("vain"))             v += 3;
    if (a.traits.includes("loyal"))            v -= 5;
    return v;
  },

  "apologize-deep": (a, o, s) => {
    if (a.act !== "ACT_ONE") return null;
    if ((o.tension?.[a.id] ?? 0) < 20) return null;
    let v = 6 + Math.floor((o.tension?.[a.id] ?? 0) / 8);
    if (a.traits.includes("helpful")) v += 2;
    if (a.traits.includes("loyal"))   v += 2;
    return v;
  },

  // ── Act 2 ──

  "chat-prom": (a, o, s) => {
    if (a.act !== "ACT_TWO") return null;
    let v = 4;
    if (a.relationships?.[o.id] === "enemies") v -= 6;
    return v;
  },

  "ask-to-dance": (a, o, s) => {
    if (a.act !== "ACT_TWO") return null;
    let v = 3;
    if ((a.buddy?.[o.id] ?? 0) >= 30) v += 5;
    if (a.relationships?.[o.id] === "friends") v += 5;
    if (a.relationships?.[o.id] === "dating")  v += 8;
    if ((a.romance?.[o.id] ?? 0) >= 20) v += 3;
    if ((o.tension?.[a.id] ?? 0) >= 20) v -= 8;
    return v;
  },

  "slow-dance": (a, o, s) => {
    if (a.act !== "ACT_TWO") return null;
    if (a.relationships?.[o.id] !== "dating"
        && ((a.romance?.[o.id] ?? 0) < 30 || (o.romance?.[a.id] ?? 0) < 25)) return null;
    let v = 8;
    if (a.relationships?.[o.id] === "dating") v += 10;
    if ((o.romance?.[a.id] ?? 0) >= 40) v += 4;
    return v;
  },

  "prom-confess": (a, o, s) => {
    if (a.act !== "ACT_TWO") return null;
    if ((a.romance?.[o.id] ?? 0) < 20) return null;
    let v = 5;
    if ((o.romance?.[a.id] ?? 0) >= 30) v += 10;
    if (a.traits.includes("impulsive")) v += 3;
    if ((o.tension?.[a.id] ?? 0) >= 25) v -= 12;
    return v;
  },

  "public-declaration": (a, o, s) => {
    if (a.act !== "ACT_TWO") return null;
    if ((a.romance?.[o.id] ?? 0) < 40) return null;
    let v = 4;
    if ((o.romance?.[a.id] ?? 0) >= 50) v += 12;
    if (a.relationships?.[o.id] === "dating") v += 4;
    if (a.traits.includes("ambitious")) v += 3;
    if (a.traits.includes("impulsive")) v += 3;
    if ((o.tension?.[a.id] ?? 0) >= 15) v -= 20;
    if (o.traits.includes("guarded")) v -= 4;
    return v;
  },
};

function computeVolition(state, actorID, otherID, actionName) {
  const a = state.entities[actorID];
  const o = state.entities[otherID];
  const rule = VOLITION_RULES[actionName];
  if (!a || !o || !rule) return null;
  return rule(a, o, state);
}

// ── Initial state ───────────────────────────────────────────────────────────

function buildInitialState(EntityType) {
  const entities = {};
  const characters = [];
  const items = [];
  const locations = [];

  for (const [id, name] of [["school", "Northside High"], ["prom", "The Prom"]]) {
    entities[id] = { entityType: EntityType.Location, id, name };
    locations.push(id);
  }

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

function clamp(v) { return v == null ? v : Math.max(-100, Math.min(100, v)); }

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
    const available = game.getAvailableActions(target);
    if (available.length === 0) {
      ticks.push({ index: i, timestamp: i + 1, events: [{ text: `(no moves available toward ${target})`, type: "skip" }], relationship: game.getSnapshot(target), actNumber: game.getState().actNumber });
      // Force end-of-turn anyway so we don't infinite-loop in Node.
      await game.skipTurn();
      continue;
    }
    // Weighted-ish: pick from top half by volition for more interesting runs.
    const top = available.slice(0, Math.max(1, Math.ceil(available.length / 2)));
    const action = top[Math.floor(rng() * top.length)];

    const result = await game.takeTurn(action.name, target);
    const events = [];
    events.push({ text: `${action.label} → ${result.exchange?.gloss ?? "(?)"}`, type: "intent" });
    if (result.response) events.push({ text: result.response.gloss, type: "response" });
    for (const t of result.triggers ?? []) events.push({ text: t.gloss, type: "trigger" });

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

export function checkOutcome(state) {
  if (state.actNumber < 2) return null;
  if (state.turn < ACT1_TURNS + ACT2_TURNS) return null;
  const alex = state.entities.alex;
  const datingPartner = Object.entries(alex.relationships).find(([_, v]) => v === "dating");
  const friends = Object.entries(alex.relationships).filter(([_, v]) => v === "friends").map(([k]) => k);
  const enemies = Object.entries(alex.relationships).filter(([_, v]) => v === "enemies").map(([k]) => k);
  if (datingPartner) return { kind: "win-date", partner: datingPartner[0], friends, enemies };
  if (friends.length >= 3) return { kind: "win-friends", friends, enemies };
  if (enemies.length >= 2) return { kind: "lose-pariah", friends, enemies };
  return { kind: "neutral", friends, enemies };
}

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
  const goal = PLAYER_GOALS[Math.floor(rng() * PLAYER_GOALS.length)];
  const state = buildInitialState(EntityType);

  const adapter = {
    provisionActionID: () => makeUUID(rng),
    rng,
    enums: {
      ACT_ONE: "ACT_ONE",
      ACT_TWO: "ACT_TWO",
    },
    functions: {
      // Volition function — sums rule weights for the (actor, other, action)
      // triple. Returns a number, or null when the action can't apply at all.
      // Viv conditions guard on `~volition(...) > 0`.
      volition: (actorID, otherID, actionName) =>
        computeVolition(state, actorID, otherID, actionName),
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

  function listAvailableActions(targetID) {
    if (!targetID || targetID === "alex") return [];
    const out = [];
    for (const def of ACTION_CATALOG) {
      const v = computeVolition(state, "alex", targetID, def.name);
      if (v == null || v <= 0) continue;
      out.push({ ...def, volition: v });
    }
    out.sort((a, b) => b.volition - a.volition);
    return out;
  }

  async function advanceActIfNeeded() {
    if (state.actNumber === 1 && state.turn >= ACT1_TURNS) {
      await fireScene("act2-opens", "alex");
      moveAllTo("prom");
      state.actNumber = 2;
    }
  }

  return {
    state,

    getGoal() { return goal; },

    async start() {
      const opening = await fireScene("act1-opens", "alex");
      return { opening: opening[0] ?? null, actNumber: state.actNumber, turn: state.turn };
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

    getAvailableActions(targetID) {
      return listAvailableActions(targetID);
    },

    getSnapshot(focusID) { return getSnapshot(state, focusID); },
    getCharacter(id)     { return state.entities[id]; },

    async takeTurn(actionName, targetID) {
      if (!state.entities[targetID] || targetID === "alex") {
        throw new Error(`Invalid target: ${targetID}`);
      }
      if (!VOLITION_RULES[actionName]) {
        throw new Error(`Unknown action: ${actionName}`);
      }

      const before = snapshotActions();
      await attemptAction({
        actionName,
        initiatorID: "alex",
        precastBindings: { alex: ["alex"], target: [targetID] },
      });
      const intentActions = newActionsSince(before);
      if (intentActions.length === 0) {
        throw new Error(`Action "${actionName}" blocked by Viv conditions (volition <= 0?).`);
      }

      await drainUrgent("alex");
      await drainUrgent(targetID);
      await drainUrgent("alex");
      clampNetworks(state);

      state.timestamp += 10;
      state.turn += 1;

      const allNew = newActionsSince(before);
      const exchange = allNew.find(a => isExchange(a.name));
      const response = allNew.find(a => isResponse(a.name));
      const triggers = allNew.filter(a => isTrigger(a.name));

      await advanceActIfNeeded();

      return {
        exchange,
        response,
        triggers,
        snapshot: getSnapshot(state, targetID),
        actNumber: state.actNumber,
        outcome: checkOutcome(state),
      };
    },

    // Used by the headless runner when no action is available for a target.
    async skipTurn() {
      state.timestamp += 10;
      state.turn += 1;
      await advanceActIfNeeded();
      return { actNumber: state.actNumber, outcome: checkOutcome(state) };
    },
  };
}

// ── Action-name classifiers ─────────────────────────────────────────────────

const EXCHANGE_NAMES = new Set(ACTION_CATALOG.map(a => a.name));
const RESPONSE_NAMES = new Set(["react-fuming", "react-thrilled", "react-icy", "react-warm", "react-cool"]);
const TRIGGER_NAMES  = new Set(["become-friends", "become-dating", "become-enemies", "set-has-crush"]);

function isExchange(n) { return EXCHANGE_NAMES.has(n); }
function isResponse(n) { return RESPONSE_NAMES.has(n); }
function isTrigger(n)  { return TRIGGER_NAMES.has(n);  }
