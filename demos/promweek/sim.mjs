// Promweek — two-act high school social physics with utility-scored action menus.
//
// The player picks an initiator and a target from the full cast, then chooses
// from the moves the initiator is willing to make. All social effects,
// reactions, and trigger rules live in sim.viv. Each concrete action is gated
// by a single condition: `~volition(...) > 0`. The volition function (below)
// sums rule weights based on the current social state — traits, networks,
// statuses, relationships, act — and returns a score (or null when the action
// can't apply at all).
//
// The same function feeds the player's menu: for each (initiator, target)
// pair the host enumerates every concrete action, computes its volition, and
// shows the ones with score > 0, sorted by score. The player picks a specific
// Viv action; Viv evaluates the condition, fires the action, applies effects,
// and queues the target's response plus the trigger rules.

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

const shuffled = (rng, arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ── Storyworld definitions ──────────────────────────────────────────────────

export const ACT1_TURNS = 8;
export const ACT2_TURNS = 5;

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
  { name: "share-interest",     label: "Share an interest",    desc: "Talk about something both like (cool).",              category: "warm",  act: 1 },
  { name: "bond-over-lame",     label: "Bond over a lame thing", desc: "Geek out together over something everyone hates.", category: "warm",  act: 1 },
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
    if (s.actNumber !== 1) return null;
    let v = 5;
    if (o.tension?.[a.id] >= 20) v += 3;
    if (a.relationships?.[o.id] === "enemies") v -= 8;
    return v;
  },

  "compliment": (a, o, s) => {
    if (s.actNumber !== 1) return null;
    let v = 4;
    if (a.traits.includes("charismatic")) v += 2;
    if (o.traits.includes("vain"))         v += 3;
    if (o.tension?.[a.id] >= 15)            v += 3;
    if (a.relationships?.[o.id] === "enemies") v -= 6;
    return v;
  },

  "share-interest": (a, o, s) => {
    if (s.actNumber !== 1) return null;
    const shared = (a.likes ?? []).filter(id => (o.likes ?? []).includes(id));
    const coolShared = shared.filter(id => (s.entities[id]?.coolness ?? 0) >= 0);
    if (coolShared.length === 0) return null;
    let v = 5 + coolShared.length * 2;
    if (a.traits.includes("thoughtful")) v += 2;
    return v;
  },

  "bond-over-lame": (a, o, s) => {
    if (s.actNumber !== 1) return null;
    const shared = (a.likes ?? []).filter(id => (o.likes ?? []).includes(id));
    const lameShared = shared.filter(id => (s.entities[id]?.coolness ?? 0) < 0);
    if (lameShared.length === 0) return null;
    let v = 7 + lameShared.length * 3;
    if (a.traits.includes("authentic")) v += 3;
    if (o.traits.includes("vain")) v -= 4;
    return v;
  },

  "sincere-compliment": (a, o, s) => {
    if (s.actNumber !== 1) return null;
    let v = 4;
    if (o.tension?.[a.id] >= 10) v += 4;
    if (o.traits.includes("authentic")) v += 3;
    if (o.traits.includes("guarded"))   v += 2;
    return v;
  },

  "flirt-soft": (a, o, s) => {
    if (s.actNumber !== 1) return null;
    if (a.relationships?.[o.id] === "enemies") return null;
    let v = 3;
    if ((a.romance?.[o.id] ?? 0) >= 8)  v += 4;
    if ((o.romance?.[a.id] ?? 0) >= 8)  v += 4;
    if (a.traits.includes("charismatic")) v += 2;
    if (o.tension?.[a.id] >= 25) v -= 6;
    return v;
  },

  "flirt-bold": (a, o, s) => {
    if (s.actNumber !== 1) return null;
    if (a.relationships?.[o.id] === "enemies") return null;
    if ((a.romance?.[o.id] ?? 0) < 10) return null;
    let v = 4;
    if ((o.romance?.[a.id] ?? 0) >= 20) v += 8;
    if (a.traits.includes("charismatic")) v += 3;
    if (a.traits.includes("impulsive"))   v += 2;
    if (o.tension?.[a.id] >= 25) v -= 12;
    if (o.traits.includes("guarded"))   v -= 3;
    return v;
  },

  "confide-secret": (a, o, s) => {
    if (s.actNumber !== 1) return null;
    if ((a.buddy?.[o.id] ?? 0) < 20) return null;
    let v = 5;
    if ((o.buddy?.[a.id] ?? 0) >= 30) v += 5;
    if (a.relationships?.[o.id] === "friends") v += 4;
    if (o.tension?.[a.id] >= 20) v -= 5;
    if (a.traits.includes("guarded")) v -= 2;
    return v;
  },

  "ask-out": (a, o, s) => {
    if (s.actNumber !== 1) return null;
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
    if (s.actNumber !== 1) return null;
    let v = 4;
    if (a.traits.includes("intellectual")) v += 4;
    if (o.traits.includes("intellectual")) v += 4;
    if (o.traits.includes("witty"))        v += 2;
    if (o.tension?.[a.id] >= 30) v -= 5;
    return v;
  },

  "confront": (a, o, s) => {
    if (s.actNumber !== 1) return null;
    const tens = a.tension?.[o.id] ?? 0;
    if (tens < 15) return null;
    let v = 3 + Math.floor(tens / 4);
    if (a.traits.includes("impulsive")) v += 2;
    if (a.traits.includes("guarded"))   v -= 3;
    return v;
  },

  "spread-rumor": (a, o, s) => {
    if (s.actNumber !== 1) return null;
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
    if (s.actNumber !== 1) return null;
    if ((o.tension?.[a.id] ?? 0) < 20) return null;
    let v = 6 + Math.floor((o.tension?.[a.id] ?? 0) / 8);
    if (a.traits.includes("helpful")) v += 2;
    if (a.traits.includes("loyal"))   v += 2;
    return v;
  },

  // ── Act 2 ──

  "chat-prom": (a, o, s) => {
    if (s.actNumber !== 2) return null;
    let v = 4;
    if (a.relationships?.[o.id] === "enemies") v -= 6;
    return v;
  },

  "ask-to-dance": (a, o, s) => {
    if (s.actNumber !== 2) return null;
    let v = 3;
    if ((a.buddy?.[o.id] ?? 0) >= 30) v += 5;
    if (a.relationships?.[o.id] === "friends") v += 5;
    if (a.relationships?.[o.id] === "dating")  v += 8;
    if ((a.romance?.[o.id] ?? 0) >= 20) v += 3;
    if ((o.tension?.[a.id] ?? 0) >= 20) v -= 8;
    return v;
  },

  "slow-dance": (a, o, s) => {
    if (s.actNumber !== 2) return null;
    if (a.relationships?.[o.id] !== "dating"
        && ((a.romance?.[o.id] ?? 0) < 30 || (o.romance?.[a.id] ?? 0) < 25)) return null;
    let v = 8;
    if (a.relationships?.[o.id] === "dating") v += 10;
    if ((o.romance?.[a.id] ?? 0) >= 40) v += 4;
    return v;
  },

  "prom-confess": (a, o, s) => {
    if (s.actNumber !== 2) return null;
    if ((a.romance?.[o.id] ?? 0) < 20) return null;
    let v = 5;
    if ((o.romance?.[a.id] ?? 0) >= 30) v += 10;
    if (a.traits.includes("impulsive")) v += 3;
    if ((o.tension?.[a.id] ?? 0) >= 25) v -= 12;
    return v;
  },

  "public-declaration": (a, o, s) => {
    if (s.actNumber !== 2) return null;
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
  if (!a || !o || actorID === otherID || !rule) return null;
  return rule(a, o, state);
}

// ── Player goals ────────────────────────────────────────────────────────────
//
// Goals describe states between characters, not Alex-specific outcomes. Each
// template generates a concrete goal at game-init time by sampling random
// characters from the cast.

const CHARACTER_IDS = Object.keys(CHARACTER_DEFS);

function relationOf(state, a, b) {
  return state.entities[a]?.relationships?.[b];
}

function arePair(state, a, b, kind) {
  return relationOf(state, a, b) === kind && relationOf(state, b, a) === kind;
}

function friendsCountFor(state, id) {
  const rels = state.entities[id]?.relationships ?? {};
  return Object.values(rels).filter(v => v === "friends" || v === "dating").length;
}

function allPairs() {
  const pairs = [];
  for (let i = 0; i < CHARACTER_IDS.length; i++) {
    for (let j = i + 1; j < CHARACTER_IDS.length; j++) {
      pairs.push([CHARACTER_IDS[i], CHARACTER_IDS[j]]);
    }
  }
  return pairs;
}

function countPairsOfKind(state, kind) {
  let n = 0;
  for (const [a, b] of allPairs()) if (arePair(state, a, b, kind)) n++;
  return n;
}

const GOAL_TEMPLATES = [
  {
    id: "matchmaker",
    title: "Matchmaker",
    setup: (rng) => {
      const [x, y] = shuffled(rng, CHARACTER_IDS).slice(0, 2);
      return { x, y };
    },
    flavor: ({ x, y }) =>
      `${CHARACTER_DEFS[x].name} and ${CHARACTER_DEFS[y].name} would make a perfect couple. Make it happen — before the night is over.`,
    hint:   ({ x, y }) =>
      `Get ${CHARACTER_DEFS[x].name} and ${CHARACTER_DEFS[y].name} to start dating.`,
    check:  (state, g) => arePair(state, g.x, g.y, "dating"),
    successText: (g) =>
      `${CHARACTER_DEFS[g.x].name} and ${CHARACTER_DEFS[g.y].name} are official. Cupid bowed.`,
    failText:    (g) =>
      `${CHARACTER_DEFS[g.x].name} and ${CHARACTER_DEFS[g.y].name} never quite clicked.`,
  },
  {
    id: "stir-rivalry",
    title: "Stir a Rivalry",
    setup: (rng) => {
      const [x, y] = shuffled(rng, CHARACTER_IDS).slice(0, 2);
      return { x, y };
    },
    flavor: ({ x, y }) =>
      `${CHARACTER_DEFS[x].name} and ${CHARACTER_DEFS[y].name} are too polite about each other. Push the cracks open.`,
    hint:   ({ x, y }) =>
      `Get ${CHARACTER_DEFS[x].name} and ${CHARACTER_DEFS[y].name} to become enemies.`,
    check:  (state, g) => arePair(state, g.x, g.y, "enemies"),
    successText: (g) =>
      `${CHARACTER_DEFS[g.x].name} and ${CHARACTER_DEFS[g.y].name} are openly at war. Drama achieved.`,
    failText:    (g) =>
      `${CHARACTER_DEFS[g.x].name} and ${CHARACTER_DEFS[g.y].name} kept things civil. Boring.`,
  },
  {
    id: "befriend-loner",
    title: "Bring Them Out",
    setup: (rng) => {
      const x = shuffled(rng, CHARACTER_IDS)[0];
      return { x };
    },
    flavor: ({ x }) =>
      `${CHARACTER_DEFS[x].name} doesn't have anyone yet. Get them in someone's circle — anyone's — before prom.`,
    hint:   ({ x }) =>
      `End with ${CHARACTER_DEFS[x].name} as friends (or dating) with at least 2 others.`,
    check:  (state, g) => friendsCountFor(state, g.x) >= 2,
    successText: (g) =>
      `${CHARACTER_DEFS[g.x].name} has a real circle now. Quietly, that's a big deal.`,
    failText:    (g) =>
      `${CHARACTER_DEFS[g.x].name} ended the night still on the outside.`,
  },
  {
    id: "secret-crush",
    title: "Plant a Crush",
    setup: (rng) => {
      const [x, y] = shuffled(rng, CHARACTER_IDS).slice(0, 2);
      return { x, y };
    },
    flavor: ({ x, y }) =>
      `${CHARACTER_DEFS[x].name} doesn't even know it yet. Get them falling for ${CHARACTER_DEFS[y].name} — they don't have to act on it.`,
    hint:   ({ x, y }) =>
      `Get ${CHARACTER_DEFS[x].name} to have a crush on ${CHARACTER_DEFS[y].name}.`,
    check:  (state, g) =>
      state.entities[g.x]?.statuses?.crush?.[g.y] === true,
    successText: (g) =>
      `${CHARACTER_DEFS[g.x].name} is gone on ${CHARACTER_DEFS[g.y].name}. Everyone watching can tell.`,
    failText:    (g) =>
      `${CHARACTER_DEFS[g.x].name} stayed unaffected. Romance never sparked.`,
  },
  {
    id: "peaceful-prom",
    title: "Peaceful Prom",
    setup: () => ({}),
    flavor: () =>
      `The cast is one rumor away from open war. Keep it civil — leave prom with at least two friendships and no enemies.`,
    hint:   () =>
      `End with at least 2 pairs as friends/dating and zero enemy pairs anywhere in the cast.`,
    check:  (state) =>
      countPairsOfKind(state, "enemies") === 0
      && (countPairsOfKind(state, "friends") + countPairsOfKind(state, "dating")) >= 2,
    successText: () => `Two real bonds, no enemies. Northside High made it through intact.`,
    failText:    () => `Either too thin on friendships, or too rich in enemies.`,
  },
  {
    id: "love-triangle",
    title: "Tangle Them Up",
    setup: (rng) => {
      const [x, y, z] = shuffled(rng, CHARACTER_IDS).slice(0, 3);
      return { x, y, z };
    },
    flavor: ({ x, y, z }) =>
      `${CHARACTER_DEFS[x].name} sees both ${CHARACTER_DEFS[y].name} and ${CHARACTER_DEFS[z].name}. Make it true.`,
    hint:   ({ x, y, z }) =>
      `Get ${CHARACTER_DEFS[x].name} to have crushes on both ${CHARACTER_DEFS[y].name} and ${CHARACTER_DEFS[z].name}.`,
    check:  (state, g) =>
      state.entities[g.x]?.statuses?.crush?.[g.y] === true
      && state.entities[g.x]?.statuses?.crush?.[g.z] === true,
    successText: (g) =>
      `${CHARACTER_DEFS[g.x].name} is torn between ${CHARACTER_DEFS[g.y].name} and ${CHARACTER_DEFS[g.z].name}. Beautiful mess.`,
    failText:    (g) =>
      `${CHARACTER_DEFS[g.x].name} never quite fell for both. The triangle never closed.`,
  },
];

function buildGoal(rng) {
  const template = GOAL_TEMPLATES[Math.floor(rng() * GOAL_TEMPLATES.length)];
  const data = template.setup(rng) ?? {};
  return {
    id: template.id,
    title: template.title,
    flavor: template.flavor(data),
    hint:   template.hint(data),
    check:  (state) => template.check(state, data),
    successText: () => template.successText(data),
    failText:    () => template.failText(data),
    data,
  };
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

    const characters = game.getCandidateInitiators();
    let chosen = null;
    for (const initiatorID of shuffled(rng, characters)) {
      const targets = game.getCandidateTargets(initiatorID);
      for (const targetID of shuffled(rng, targets)) {
        const available = game.getAvailableActions(initiatorID, targetID);
        if (available.length > 0) {
          const top = available.slice(0, Math.max(1, Math.ceil(available.length / 2)));
          chosen = { initiatorID, targetID, action: top[Math.floor(rng() * top.length)] };
          break;
        }
      }
      if (chosen) break;
    }

    if (!chosen) {
      ticks.push({ index: i, timestamp: i + 1, events: [{ text: `(no moves available in the room)`, type: "skip" }], pair: null, actNumber: game.getState().actNumber });
      await game.skipTurn();
      continue;
    }

    const result = await game.takeTurn(chosen.action.name, chosen.initiatorID, chosen.targetID);
    const events = [];
    events.push({
      text: `${CHARACTER_DEFS[chosen.initiatorID].name} → ${CHARACTER_DEFS[chosen.targetID].name}: ${chosen.action.label} → ${result.exchange?.gloss ?? "(?)"}`,
      type: "intent",
    });
    if (result.response) events.push({ text: result.response.gloss, type: "response" });
    for (const t of result.triggers ?? []) events.push({ text: t.gloss, type: "trigger" });

    ticks.push({
      index: i,
      timestamp: i + 1,
      events,
      pair: { initiator: chosen.initiatorID, target: chosen.targetID },
      snapshot: result.snapshot,
      gameOutcome: result.outcome,
      actNumber: result.actNumber,
    });
    if (result.outcome) break;
  }

  return { ticks };
}

export function summarize(tick) {
  const s = tick.snapshot;
  const o = tick.gameOutcome;
  const end = o ? ` → ${o.kind}${o.partner ? `(${o.partner})` : ""}` : "";
  if (!s) return `act${tick.actNumber} (skip)${end}`;
  const rels = Object.entries(s.relationships).filter(([_, v]) => v != null)
    .map(([k, v]) => `${k}:${v}`).join(" ");
  return `act${tick.actNumber} ${s.from}→${s.to}{b:${s.buddy} r:${s.romance} t:${s.tension}} rels:[${rels}]${end}`;
}

// ── Display + outcome helpers ───────────────────────────────────────────────

export function getSnapshot(state, fromID, toID) {
  const from = state.entities[fromID];
  if (!from || !toID) return null;
  return {
    from: fromID,
    to:   toID,
    buddy:   from.buddy[toID]   ?? 0,
    romance: from.romance[toID] ?? 0,
    cool:    from.cool[toID]    ?? 0,
    tension: from.tension[toID] ?? 0,
    relationships: { ...from.relationships },
    crushes:       { ...(from.statuses?.crush ?? {}) },
  };
}

export function getRelationshipKind(state, a, b) {
  const ab = relationOf(state, a, b);
  const ba = relationOf(state, b, a);
  if (ab === "dating"  && ba === "dating")  return "dating";
  if (ab === "enemies" || ba === "enemies") return "enemies";
  if (ab === "friends" && ba === "friends") return "friends";
  return null;
}

export function checkOutcome(state, goal) {
  if (state.actNumber < 2) return null;
  if (state.turn < ACT1_TURNS + ACT2_TURNS) return null;
  const achieved = !!(goal && goal.check(state));
  return {
    kind: achieved ? "goal-won" : "goal-lost",
    achieved,
    friendsPairs: countPairsOfKind(state, "friends"),
    datingPairs:  countPairsOfKind(state, "dating"),
    enemiesPairs: countPairsOfKind(state, "enemies"),
  };
}

export function getPairVibe(state, a, b) {
  const rel = getRelationshipKind(state, a, b);
  if (rel === "dating")  return { label: "Dating",   cls: "rel-dating"  };
  if (rel === "enemies") return { label: "Enemies",  cls: "rel-enemies" };
  if (rel === "friends") return { label: "Friends",  cls: "rel-friends" };
  const ea = state.entities[a];
  const eb = state.entities[b];
  if (!ea || !eb) return { label: "—", cls: "rel-neutral" };
  const romance = Math.max(ea.romance?.[b] ?? 0, eb.romance?.[a] ?? 0);
  const tension = Math.max(ea.tension?.[b] ?? 0, eb.tension?.[a] ?? 0);
  const buddy   = Math.max(ea.buddy?.[b]   ?? 0, eb.buddy?.[a]   ?? 0);
  if (tension >= 30) return { label: "Tense",            cls: "rel-tense" };
  if (romance >= 30) return { label: "Something there?", cls: "rel-spark" };
  if (buddy   >= 30) return { label: "Warming up",       cls: "rel-warm" };
  if (buddy   <= 5 && tension < 5 && romance < 5) return { label: "Barely acquainted", cls: "rel-cold" };
  return                       { label: "Acquaintances", cls: "rel-neutral" };
}

// ── The Viv-backed game ─────────────────────────────────────────────────────

export function initGame({ initializeVivRuntime, attemptAction, selectAction, EntityType }, bundle) {
  const rng = mulberry32(hashSeed(`promweek-${Date.now()}-${Math.random()}`));
  const goal = buildGoal(rng);
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

  async function fireScene(actionName, initiatorID) {
    const before = snapshotActions();
    await attemptAction({
      actionName,
      initiatorID,
      precastBindings: { initiator: [initiatorID] },
      suppressConditions: true,
    });
    return newActionsSince(before);
  }

  function moveAllTo(locationID) {
    for (const cid of state.characters) state.entities[cid].location = locationID;
    for (const iid of state.items)      state.entities[iid].location = locationID;
  }

  function listAvailableActions(initiatorID, targetID) {
    if (!initiatorID || !targetID || initiatorID === targetID) return [];
    const out = [];
    for (const def of ACTION_CATALOG) {
      const v = computeVolition(state, initiatorID, targetID, def.name);
      if (v == null || v <= 0) continue;
      out.push({ ...def, volition: v });
    }
    out.sort((a, b) => b.volition - a.volition);
    return out;
  }

  async function advanceActIfNeeded() {
    if (state.actNumber === 1 && state.turn >= ACT1_TURNS) {
      await fireScene("act2-opens", state.characters[0]);
      moveAllTo("prom");
      state.actNumber = 2;
    }
  }

  return {
    state,

    getGoal() { return goal; },

    async start() {
      const opening = await fireScene("act1-opens", state.characters[0]);
      return { opening: opening[0] ?? null, actNumber: state.actNumber, turn: state.turn };
    },

    getState() {
      return {
        turn: state.turn,
        actNumber: state.actNumber,
        outcome: checkOutcome(state, goal),
        characters: state.characters.map(id => ({
          id,
          name: state.entities[id].name,
          portrait: CHARACTER_DEFS[id].portrait,
          traits: state.entities[id].traits,
          relationships: { ...state.entities[id].relationships },
          crushes: { ...(state.entities[id].statuses?.crush ?? {}) },
        })),
      };
    },

    getCandidateInitiators() {
      return [...state.characters];
    },

    getCandidateTargets(initiatorID) {
      return state.characters.filter(id => id !== initiatorID);
    },

    getAvailableActions(initiatorID, targetID) {
      return listAvailableActions(initiatorID, targetID);
    },

    getSnapshot(fromID, toID) { return getSnapshot(state, fromID, toID); },
    getPairVibe(a, b)          { return getPairVibe(state, a, b); },
    getCharacter(id)           { return state.entities[id]; },

    async takeTurn(actionName, initiatorID, targetID) {
      if (!state.entities[initiatorID]) throw new Error(`Invalid initiator: ${initiatorID}`);
      if (!state.entities[targetID])    throw new Error(`Invalid target: ${targetID}`);
      if (initiatorID === targetID)     throw new Error(`Initiator and target must differ`);
      if (!VOLITION_RULES[actionName])  throw new Error(`Unknown action: ${actionName}`);

      const before = snapshotActions();
      await attemptAction({
        actionName,
        initiatorID,
        precastBindings: { initiator: [initiatorID], target: [targetID] },
      });
      const intentActions = newActionsSince(before);
      if (intentActions.length === 0) {
        throw new Error(`Action "${actionName}" blocked by Viv conditions (volition <= 0?).`);
      }

      await drainUrgent(initiatorID);
      await drainUrgent(targetID);
      await drainUrgent(initiatorID);
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
        snapshot: getSnapshot(state, initiatorID, targetID),
        actNumber: state.actNumber,
        outcome: checkOutcome(state, goal),
      };
    },

    async skipTurn() {
      state.timestamp += 10;
      state.turn += 1;
      await advanceActIfNeeded();
      return { actNumber: state.actNumber, outcome: checkOutcome(state, goal) };
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
