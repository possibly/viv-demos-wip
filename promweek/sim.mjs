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

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// ── Character personalities ──────────────────────────────────────────────────

export const ALEX = {
  name: "Alex",
  charisma: 70,    // How well social actions land generally
  empathy: 50,     // Effectiveness of vulnerability / confiding
  wit: 65,         // Effectiveness of debates and teasing
  pushiness: 60,   // Tendency to cause tension when moving too fast
};

export const JORDAN = {
  name: "Jordan",
  intellectualism: 85,  // Values wit and debate highly
  authenticity: 80,     // Rewards genuine gestures; penalises hollow ones
  guardedness: 70,      // Slow to open up; trust is hard-won
  romanticism: 55,      // Does develop feelings—just not in a hurry
};

// ── Starting relationship (how Jordan feels about Alex) ──────────────────────

export const INITIAL_REL = {
  friendship: 20,
  respect:    30,
  romance:    0,
  trust:      15,
  tension:    10,
};

// ── Action catalogue ─────────────────────────────────────────────────────────

export const ACTIONS = [
  { name: "small-talk",       label: "Make small talk",     desc: "Keep it casual.",                     canFlag: null              },
  { name: "compliment",       label: "Give a compliment",   desc: "Say something nice.",                 canFlag: null              },
  { name: "ask-opinion",      label: "Ask their opinion",   desc: "Get Jordan's take on something.",     canFlag: null              },
  { name: "share-gossip",     label: "Share gossip",        desc: "Lean in and spill something.",        canFlag: "canGossip"       },
  { name: "flirt",            label: "Flirt",               desc: "Try your luck.",                      canFlag: "canFlirt"        },
  { name: "challenge-debate", label: "Start a debate",      desc: "Challenge Jordan on something.",      canFlag: "canChallenge"    },
  { name: "ask-for-help",     label: "Ask for help",        desc: "Let Jordan help you with something.", canFlag: "canAskHelp"      },
  { name: "tease",            label: "Tease them",          desc: "A little playful ribbing.",           canFlag: "canTease"        },
  { name: "apologize",        label: "Apologize",           desc: "Clear the air.",                      canFlag: "canApologize"    },
  { name: "confide",          label: "Confide something",   desc: "Share something personal.",           canFlag: "canConfide"      },
  { name: "invite-out",       label: "Invite them out",     desc: "Ask Jordan somewhere.",               canFlag: "canInviteOut"    },
  { name: "be-vulnerable",    label: "Open up",             desc: "Let your guard down.",                canFlag: "canBeVulnerable" },
];

// ── Precondition checks (mirrors Viv conditions) ─────────────────────────────

const PRECONDITIONS = {
  canGossip:       rel => rel.friendship > 20,
  canFlirt:        rel => rel.respect > 40 && rel.friendship > 30,
  canChallenge:    rel => rel.respect > 35,
  canAskHelp:      rel => rel.friendship > 25,
  canTease:        rel => rel.friendship > 35 && rel.tension < 40,
  canApologize:    rel => rel.tension > 30,
  canConfide:      rel => rel.trust > 50,
  canInviteOut:    rel => rel.friendship > 60,
  canBeVulnerable: rel => rel.trust > 60,
};

function computeAlexFlags(rel) {
  return Object.fromEntries(Object.entries(PRECONDITIONS).map(([k, fn]) => [k, fn(rel)]));
}

export function getAvailableActions(rel) {
  return ACTIONS.map(a => ({ ...a, available: !a.canFlag || PRECONDITIONS[a.canFlag](rel) }));
}

// ── Player action effects + narrative ────────────────────────────────────────

function computePlayerAction(actionName, rel, rng) {
  const r = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

  switch (actionName) {
    case "small-talk":
      return {
        delta: { friendship: r(2, 4) + (rel.friendship > 50 ? 1 : 0), tension: -r(1, 3) },
        narrative: pick([
          "You bring up the midterm. Jordan gives a short answer, then asks how yours went.",
          "You mention something dumb you saw in the hall. Jordan listens—doesn't look away.",
          "You comment on the vending machine being out of everything again. Jordan agrees, almost warmly.",
          "You ask if they caught the game last night. Jordan shrugs. \"Not really my thing.\" Brief. Neutral. Not hostile.",
          "You say nothing profound. Jordan seems okay with that.",
        ], rng),
      };

    case "compliment":
      if (rel.friendship < 30) {
        return {
          delta: { respect: -Math.ceil(JORDAN.authenticity / 20), friendship: r(1, 3) },
          narrative: pick([
            "You compliment Jordan but it comes out a little stiff. They smile the smile people make when they're being polite, not pleased.",
            "You say something nice. Jordan receives it with a flat \"thanks\" that closes the door faster than it opened.",
            "Your compliment lands a bit off. Jordan blinks, like they can't tell if you mean it.",
          ], rng),
        };
      }
      return {
        delta: { friendship: r(4, 7), romance: r(1, 3) },
        narrative: pick([
          "You tell Jordan something honest about what they said in class. They look genuinely surprised—the good kind.",
          "You mention their taste in something. They raise an eyebrow. \"Surprisingly?\" But they're clearly pleased.",
          "You say something you actually mean. Jordan takes a moment before nodding. \"...Thanks.\" It sounds real.",
        ], rng),
      };

    case "ask-opinion":
      return {
        delta: { respect: r(6, 10), friendship: r(2, 4) },
        narrative: pick([
          "You ask Jordan what they actually think about something. They pause—like they're deciding how honest to be—then actually tell you. More interesting than you expected.",
          "You want Jordan's take. They give it without pulling punches. You're not sure you agree, but you're paying attention.",
          "You ask their opinion and their whole posture changes. Like they've been waiting for someone to ask.",
          "Jordan looks at you a little differently after you ask. Not a lot. Just enough.",
        ], rng),
      };

    case "share-gossip":
      return {
        delta: {
          friendship: Math.max(1, r(5, 9) - Math.floor(JORDAN.authenticity / 25)),
          tension: r(3, 6) + Math.floor(JORDAN.guardedness / 25),
        },
        narrative: pick([
          "You lean in and share something you heard. Jordan listens—they definitely listen—but their expression stays careful. Like they're filing it away rather than enjoying it.",
          "The gossip comes out. Jordan absorbs it. \"I try not to get into that stuff,\" they say—but they didn't walk away.",
          "You tell them what's going around. Jordan doesn't flinch, but something in them goes a little still. \"Huh,\" they say. Just \"huh.\"",
        ], rng),
      };

    case "flirt":
      if (rel.romance < 20) {
        return {
          delta: { tension: r(12, 18), friendship: -r(1, 3) },
          narrative: pick([
            "You try your luck. Jordan's expression does something careful—a half-smile that keeps you at arm's length. \"Sure,\" they say, in a tone that means nothing.",
            "The flirt doesn't land. Jordan glances away, then back. The awkward beat stretches out longer than it should.",
            "You push a little. Jordan looks at you like they're reconsidering something, and not in a good way.",
          ], rng),
        };
      }
      if (rel.romance < 45) {
        return {
          delta: { romance: r(7, 12), tension: r(3, 6) },
          narrative: pick([
            "You flirt, and this time Jordan's reaction is different—caught off guard in a way they can't quite hide. It's brief. But it's there.",
            "The line lands and Jordan looks away first. There's color in their cheeks. They say something clever to recover, but you both know.",
          ], rng),
        };
      }
      return {
        delta: { romance: r(8, 14), friendship: r(3, 5) },
        narrative: pick([
          "You flirt and Jordan actually laughs—a short, surprised sound. \"You're ridiculous,\" they say, which somehow sounds like the opposite of a complaint.",
          "It comes out easy and Jordan doesn't deflect. They just look at you for a second. \"Okay,\" they say. But their mouth is curling up.",
        ], rng),
      };

    case "challenge-debate":
      return {
        delta: { respect: r(10, 16) + Math.floor(JORDAN.intellectualism / 20), friendship: r(4, 7), tension: -r(1, 3) },
        narrative: pick([
          "You push back on something Jordan said. Their eyes sharpen—that's a look you haven't seen before. They actually argue back. It's the best conversation you've had in weeks.",
          "You pick a fight with their logic. Jordan sits up straight. \"Wait, no—\" And then they're into it. Fully. Animatedly.",
          "You challenge their take. There's a beat where you think you've miscalculated. Then Jordan grins. \"Finally. Someone willing to push back.\"",
        ], rng),
      };

    case "ask-for-help":
      return {
        delta: { trust: r(8, 12), friendship: r(4, 7), respect: r(1, 3) },
        narrative: pick([
          "You admit you're stuck on something and ask if they'd walk you through it. Jordan's demeanor shifts—quiet competence, no condescension. It's different, having them pay attention to you.",
          "You ask for help, and Jordan says \"sure\" before you finish explaining. They get into it earnestly. Like they're glad you asked.",
          "Asking Jordan for help was a good call. They explain clearly, without making you feel small. And they seem to like that you came to them.",
        ], rng),
      };

    case "tease":
      if (rel.friendship > 50) {
        return {
          delta: { friendship: r(6, 10), romance: r(2, 4) },
          narrative: pick([
            "You tease Jordan about something small and dumb. They try not to laugh and fail. \"You're the worst,\" they say, which you both know means the opposite.",
            "The tease lands perfectly. Jordan rolls their eyes but the smile's already there. \"I'm done talking to you,\" they say, and immediately keep talking.",
            "You get them good and Jordan laughs—genuinely, not politely. For a second they look completely different.",
          ], rng),
        };
      }
      return {
        delta: { tension: r(6, 10), friendship: -r(2, 4) },
        narrative: pick([
          "The joke lands wrong. Jordan's face goes neutral in that specific way that means you've miscalculated. \"Right,\" they say.",
          "You thought the teasing would land, but Jordan looks at you a beat too long before responding. \"Sure,\" they say.",
          "Too early for this. Jordan gives you a small, tight smile. You've read the room completely wrong.",
        ], rng),
      };

    case "apologize":
      return {
        delta: { tension: -r(15, 22), trust: r(5, 8) },
        narrative: pick([
          "You say you're sorry—actually sorry, not the defensive kind. Jordan looks at you for a moment, then exhales slowly. \"It's fine,\" they say. Like they mean it.",
          "The apology is clumsy but genuine. Jordan listens, then nods. \"Thanks for saying that.\" The air gets easier.",
          "You own it. Jordan seems almost surprised. \"I wasn't expecting that,\" they admit. The awkwardness between you thins.",
        ], rng),
      };

    case "confide":
      return {
        delta: { trust: r(15, 20), friendship: r(10, 14), romance: r(4, 7), tension: -r(3, 6) },
        narrative: pick([
          "You tell Jordan something you haven't told many people. There's a silence afterward that isn't uncomfortable. Jordan looks at you like they're recalibrating who you are. \"I didn't know that,\" they say quietly.",
          "You open up about something real. Jordan listens without interrupting. When you're done they don't rush to fill the silence—just: \"I get that.\" And somehow it's enough.",
          "Something comes out that you didn't quite plan on saying. Jordan's expression doesn't change, exactly, but there's something different in their eyes. They share something back. Small. But real.",
        ], rng),
      };

    case "invite-out":
      if (rel.friendship > 70) {
        return {
          delta: { friendship: r(12, 16), romance: r(7, 11) },
          narrative: pick([
            "You ask Jordan if they want to grab food sometime. There's barely a pause. \"Yeah,\" they say—simple, like they'd been wondering when you'd ask.",
            "You invite Jordan out and they say yes before you can qualify it. \"When?\" Just when. Like the answer was already yes.",
            "The ask comes out smoother than you expected. Jordan tilts their head. \"I was kind of thinking about that too.\"",
          ], rng),
        };
      }
      return {
        delta: { tension: r(8, 14), friendship: -r(1, 3) },
        narrative: pick([
          "You ask Jordan out. They look caught off guard—not excited, more like surprised the conversation went here. \"Maybe sometime,\" they say.",
          "The ask comes out and Jordan's expression does that thing where they're keeping something off their face. \"I'll think about it.\" Not a yes.",
          "You invite Jordan somewhere and they don't say no exactly, but they don't say yes either. The moment sits there.",
        ], rng),
      };

    case "be-vulnerable":
      return {
        delta: { trust: r(18, 24), friendship: r(13, 17), romance: r(9, 13), tension: -r(7, 11) },
        narrative: pick([
          "You tell Jordan something that actually scares you to say out loud. They go quiet—not awkward quiet, the other kind. When they speak, their voice is different. Softer. \"Me too,\" they say.",
          "You stop being careful and say something true. Jordan blinks. Then they look at you—really look—like they're seeing something they didn't know was there. \"Yeah,\" they say. \"I know what you mean.\"",
          "The thing comes out. Jordan doesn't rush to fill the silence—and you realize how unusual that is. How good it feels. \"Thank you for telling me that,\" they say eventually.",
        ], rng),
      };

    default:
      return { delta: {}, narrative: "(unknown action)" };
  }
}

// ── Jordan's reaction system ──────────────────────────────────────────────────

function selectJordanReaction(rel) {
  if (rel.tension > 55)                             return "jordan-pulls-back";
  if (rel.romance > 40 && rel.friendship > 55)      return "jordan-reciprocates";
  if (rel.friendship > 48 && rel.tension < 45)      return "jordan-warms-up";
  return "jordan-neutral";
}

const JORDAN_REACTION_EFFECTS = {
  "jordan-warms-up":    (rng) => { const r = (a,b) => a+Math.floor(rng()*(b-a+1)); return { friendship: r(2,5), tension: -r(0,2) }; },
  "jordan-pulls-back":  (rng) => { const r = (a,b) => a+Math.floor(rng()*(b-a+1)); return { tension: r(3,7), friendship: -r(1,3) }; },
  "jordan-reciprocates":(rng) => { const r = (a,b) => a+Math.floor(rng()*(b-a+1)); return { romance: r(3,6), trust: r(2,4) }; },
  "jordan-neutral":     ()    => ({}),
};

function computeJordanNarrative(reactionName, rel, rng) {
  switch (reactionName) {
    case "jordan-warms-up":
      return pick([
        "Jordan holds your gaze a beat longer than usual before looking away. Something has shifted.",
        "Jordan relaxes. Just a little. But you notice.",
        "For a moment Jordan looks like they're going to say something else. Then they just smile—small, real.",
        "The air between you feels easier. Jordan doesn't seem to be performing indifference anymore.",
      ], rng);

    case "jordan-pulls-back":
      return pick([
        "Jordan's expression goes careful. They glance at their phone like they just remembered something.",
        "Something closes in Jordan's face. They're still there—but there's a wall now that wasn't quite there before.",
        "Jordan doesn't storm off. But you can feel them retreat behind something. It's subtle. It's obvious.",
      ], rng);

    case "jordan-reciprocates":
      return pick([
        "Jordan glances at you once—then twice. When they look away there's color in their face.",
        "Jordan says something small that is actually a compliment in disguise. You don't call it out. You don't have to.",
        "There's a moment where Jordan just looks at you. Not analyzing. Just... looking. Then they look away and pretend they weren't.",
        "Jordan touches their own hair—small, unconscious. Then: \"This isn't as bad as I thought.\" You take that.",
      ], rng);

    case "jordan-neutral":
    default:
      return pick([
        "Jordan doesn't react much. The conversation continues.",
        "Jordan checks their phone. The moment passes.",
        "Jordan just nods. The air between you stays about the same.",
      ], rng);
  }
}

// ── Qualitative relationship display ─────────────────────────────────────────

export function getRelationshipDisplay(rel) {
  const composite = rel.friendship * 0.4 + rel.respect * 0.3 + rel.trust * 0.2 + rel.romance * 0.1;

  const vibe = (() => {
    if (composite < 20) return { label: "Barely acquaintances", tier: 0 };
    if (composite < 35) return { label: "Just classmates",      tier: 1 };
    if (composite < 50) return { label: "Getting warmer",       tier: 2 };
    if (composite < 65) return { label: "Becoming friends",     tier: 3 };
    if (composite < 78) return { label: "Close",                tier: 4 };
    return                     { label: "Really close",         tier: 5 };
  })();

  const spark = (() => {
    if (rel.romance < 15) return { label: "No spark",           tier: 0 };
    if (rel.romance < 35) return { label: "Maybe something?",   tier: 1 };
    if (rel.romance < 55) return { label: "Definitely something",tier: 2 };
    if (rel.romance < 75) return { label: "Clearly into you",   tier: 3 };
    return                       { label: "Head over heels",    tier: 4 };
  })();

  const tension = (() => {
    if (rel.tension < 20) return { label: "Comfortable",        tier: 0 };
    if (rel.tension < 40) return { label: "Slightly awkward",   tier: 1 };
    if (rel.tension < 60) return { label: "Tense",              tier: 2 };
    return                       { label: "Very uncomfortable", tier: 3 };
  })();

  // Vague goal progress: weighted towards friendship + romance
  const goalProgress = Math.min(100, (rel.friendship * 0.5 + rel.romance * 0.5));

  // Jordan's avatar mood expression
  const jordanMood = (() => {
    if (rel.tension > 60)                           return "😒";
    if (rel.romance > 60 && rel.friendship > 65)    return "🥰";
    if (rel.romance > 35 && rel.friendship > 50)    return "😊";
    if (rel.friendship > 40)                        return "🙂";
    if (rel.friendship > 20)                        return "😐";
    return                                                  "😑";
  })();

  return { vibe, spark, tension, goalProgress, jordanMood };
}

// ── Win / lose check ──────────────────────────────────────────────────────────

export function checkOutcome(rel) {
  if (rel.tension >= 85)                      return "lose";
  if (rel.friendship >= 80 && rel.romance >= 60) return "win-date";
  if (rel.friendship >= 85)                   return "win-friends";
  return null;
}

// ── State initialization ──────────────────────────────────────────────────────

function buildInitialState(EntityType) {
  const entities = {
    school: { entityType: EntityType.Location, id: "school", name: "Northside High" },
    alex: {
      entityType: EntityType.Character,
      id: "alex", name: ALEX.name, location: "school", memories: {},
      canGossip: false, canFlirt: false, canChallenge: false, canAskHelp: false,
      canTease: false, canApologize: false, canConfide: false,
      canInviteOut: false, canBeVulnerable: false,
    },
    jordan: {
      entityType: EntityType.Character,
      id: "jordan", name: JORDAN.name, location: "school", memories: {},
      ...structuredClone(INITIAL_REL),
      canWarmUp: false, canPullBack: false, canReciprocate: false,
    },
  };
  return { timestamp: 0, entities, characters: ["alex", "jordan"], locations: ["school"], items: [], actions: [], vivInternalState: null, turn: 0 };
}

function applyDelta(state, entityId, delta) {
  const entity = state.entities[entityId];
  const REL = new Set(["friendship", "respect", "romance", "trust", "tension"]);
  for (const [key, change] of Object.entries(delta)) {
    if (!change) continue;
    entity[key] = REL.has(key) ? clamp((entity[key] ?? 0) + change) : (entity[key] ?? 0) + change;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function initGame({ initializeVivRuntime, attemptAction, EntityType }, bundle) {
  const rng = mulberry32(hashSeed("promweek-2024"));
  const state = buildInitialState(EntityType);

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
        if (type === EntityType.Character) return state.characters.filter(id => state.entities[id].location === locationID);
        if (type === EntityType.Item) return state.items.filter(id => state.entities[id].location === locationID);
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

  return {
    getState() {
      const rel = structuredClone(state.entities.jordan);
      return { turn: state.turn, relationship: rel, display: getRelationshipDisplay(rel), outcome: checkOutcome(rel) };
    },

    getAvailableActions() {
      return getAvailableActions(state.entities.jordan);
    },

    async takeTurn(actionName) {
      // 1. Sync Alex's precondition flags to the Viv entity
      const alexFlags = computeAlexFlags(state.entities.jordan);
      Object.assign(state.entities.alex, alexFlags);

      // 2. Execute the player action through the Viv runtime
      const beforeActions = new Set(state.actions);
      await attemptAction({
        actionName,
        initiatorID: "alex",
        precastBindings: { alex: ["alex"], jordan: ["jordan"] },
        suppressConditions: false,
      });
      if (!state.actions.some(id => !beforeActions.has(id))) {
        throw new Error(`Action "${actionName}" did not fire — Viv conditions blocked it`);
      }

      // 3. Apply personality-modulated relationship effects
      const relSnapshot = structuredClone(state.entities.jordan);
      const { delta, narrative } = computePlayerAction(actionName, relSnapshot, rng);
      applyDelta(state, "jordan", delta);

      // 4. Select and execute Jordan's reaction
      const jordanReaction = selectJordanReaction(state.entities.jordan);
      state.entities.jordan.canWarmUp     = jordanReaction === "jordan-warms-up";
      state.entities.jordan.canPullBack   = jordanReaction === "jordan-pulls-back";
      state.entities.jordan.canReciprocate = jordanReaction === "jordan-reciprocates";

      const beforeJordan = new Set(state.actions);
      await attemptAction({
        actionName: jordanReaction,
        initiatorID: "jordan",
        precastBindings: { jordan: ["jordan"], alex: ["alex"] },
        suppressConditions: true,
      });

      const jordanDelta = JORDAN_REACTION_EFFECTS[jordanReaction](rng);
      applyDelta(state, "jordan", jordanDelta);
      const jordanNarrative = computeJordanNarrative(jordanReaction, state.entities.jordan, rng);

      state.timestamp += 10;
      state.turn += 1;

      const finalRel = structuredClone(state.entities.jordan);
      return { narrative, jordanNarrative, jordanReaction, outcome: checkOutcome(finalRel), display: getRelationshipDisplay(finalRel), relationship: finalRel };
    },
  };
}
