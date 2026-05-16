import { initializeVivRuntime, selectAction, attemptAction, EntityType } from "../../shared/viv-runtime.js";

// --- Seeded PRNG (mulberry32) ---
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

const RACES = {
  human:    { faction: "Covenant", names: { m: ["Gareth","Roland","Marcus","Edwin","Aldric","Brennan","Calder","Donovan"], f: ["Elaine","Lyssa","Celeste","Mira","Reyna","Arden","Brielle","Cayla"] } },
  dwarf:    { faction: "Covenant", names: { m: ["Thane","Belden","Grundar","Kordak","Torvin","Volgrin","Brundar","Aldric"], f: ["Helga","Sigrid","Freya","Astrid","Brynja","Ingrid","Vigdis","Dagmar"] } },
  elf:      { faction: "Covenant", names: { m: ["Faelyn","Sylvan","Aeron","Caelan","Miral","Thalion","Erevan","Caladorn"], f: ["Lyria","Aeris","Miriel","Senna","Sylara","Thalindra","Elowen","Caladwen"] } },
  gnome:    { faction: "Covenant", names: { m: ["Cogsworth","Fizzle","Sprocket","Tinkard","Boltz","Gadget","Widget","Crank"], f: ["Fizzy","Bolty","Gizmo","Twitch","Ratchet","Wrenchy","Clicky","Sparky"] } },
  orc:      { faction: "Vanguard", names: { m: ["Kragnok","Bloodtusk","Grimfang","Gorthar","Vorak","Thrak","Muzgash","Drakkul"], f: ["Dasha","Grona","Korra","Meksha","Vrasha","Gorla","Traka","Durga"] } },
  revenant: { faction: "Vanguard", names: { m: ["Valdris","Corvus","Ashgor","Grimton","Soulren","Morvane","Wraithek","Duskmore"], f: ["Velsa","Marsea","Ashlea","Corvina","Mournweave","Shadowveil","Duskara","Wraithia"] } },
  minotaur: { faction: "Vanguard", names: { m: ["Earthhorn","Stormhoof","Thunderstone","Boulderback","Wildhorn","Ironhide","Dustwalker","Stoneback"], f: ["Cloudchaser","Mistrunner","Sunwalker","Windsong","Skygazer","Meadowhoof","Dawnstep","Rainhoof"] } },
  troll:    { faction: "Vanguard", names: { m: ["Zekhan","Voodrix","Hexlord","Zanzil","Akali","Malacrass","Zaruka","Jixtar"], f: ["Zalaxa","Jixxa","Hexxa","Vuja","Mossi","Lixxa","Zanda","Trolla"] } },
};

const CLASS_DATA = {
  warrior:  { icon: "⚔️",  color: "#c79c38" },
  paladin:  { icon: "🛡️",  color: "#f58cba" },
  hunter:   { icon: "🏹",  color: "#abd473" },
  rogue:    { icon: "🗡️",  color: "#fff569" },
  priest:   { icon: "✨",  color: "#ffffff" },
  mage:     { icon: "🔮",  color: "#69ccf0" },
  warlock:  { icon: "💀",  color: "#9482c9" },
  druid:    { icon: "🌿",  color: "#ff7d0a" },
  shaman:   { icon: "⚡",  color: "#0070de" },
};

const RACE_CLASS = {
  human:    ["warrior","paladin","rogue","priest","mage","warlock"],
  dwarf:    ["warrior","paladin","hunter","rogue","priest"],
  elf:      ["warrior","hunter","rogue","priest","druid"],
  gnome:    ["warrior","rogue","mage","warlock"],
  orc:      ["warrior","hunter","rogue","shaman","warlock"],
  revenant: ["warrior","rogue","priest","mage","warlock"],
  minotaur: ["warrior","hunter","shaman","druid"],
  troll:    ["warrior","hunter","rogue","priest","shaman"],
};

const RACE_LABELS = {
  human: "Human", dwarf: "Dwarf", elf: "Elf", gnome: "Gnome",
  orc: "Orc", revenant: "Revenant", minotaur: "Minotaur", troll: "Troll",
};

const ZONES = [
  { id: "hearthfield",  name: "Hearthfield",       desc: "A peaceful hillside settlement where new arrivals catch their first breath." },
  { id: "millhaven",    name: "Millhaven",          desc: "A busy crossroads hamlet; the Wayward Lantern inn draws travelers from across the realm." },
  { id: "briar_edge",   name: "The Briar's Edge",   desc: "The treeline thickens here; wolves and bandits lurk in the tangled undergrowth." },
  { id: "stonewick",    name: "Stonewick Farm",     desc: "Rolling fields and weathered farmhouses, goats grazing in the amber light." },
  { id: "stillwater",   name: "Stillwater Mere",    desc: "A glittering lake that mirrors the sky. Scouts watch from the reed banks." },
];

// --- Leveling ---
// Cumulative XP required to reach each level (index = level - 1)
const LEVEL_XP_MIN = [0, 300, 900, 2700, 6500, 14000];
const LEVEL_CAP = 6;

function getLevel(xp) {
  for (let i = LEVEL_XP_MIN.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_XP_MIN[i]) return i + 1;
  }
  return 1;
}

// --- Factions ---
// type "enemy": initial rep 0 on first contact; type "neutral": initial rep 50
const ENEMY_FACTION = { id: "grimspawn", name: "The Grimspawn", type: "enemy" };

const FACTIONS = {
  [ENEMY_FACTION.id]: ENEMY_FACTION,
};

function initialFactionRep(factionId) {
  return FACTIONS[factionId]?.type === "enemy" ? 0 : 50;
}

// --- Enemy NPC templates ---
// power level 1 = "basic" tier
// discoveryRate: probability (0–1) of spotting this enemy on a look-around attempt
const ENEMY_TEMPLATES = {
  grimspawn_scout:    { id: "grimspawn_scout",    name: "Grimspawn Scout",    faction: ENEMY_FACTION.id, level: 1, powerLevel: 1, xpReward: 50,  discoveryRate: 1.0 },
  grimspawn_warrior:  { id: "grimspawn_warrior",  name: "Grimspawn Warrior",  faction: ENEMY_FACTION.id, level: 2, powerLevel: 1, xpReward: 100, discoveryRate: 1.0 },
  grimspawn_enforcer: { id: "grimspawn_enforcer", name: "Grimspawn Enforcer", faction: ENEMY_FACTION.id, level: 3, powerLevel: 1, xpReward: 200, discoveryRate: 1.0 },
};

// Enemy templates that inhabit each zone; absent = safe zone
const ZONE_ENEMIES = {
  briar_edge: ["grimspawn_scout", "grimspawn_warrior"],
  stonewick:  ["grimspawn_scout"],
  stillwater: ["grimspawn_warrior", "grimspawn_enforcer"],
};

// --- Equipment ---
const EQUIPMENT_SLOTS = [
  "head","neck","shoulders","chest","back","wrist","hands","waist","legs","feet",
  "ring1","ring2","trinket","mainhand","offhand","ranged","ammo",
];

const SLOT_LABELS = {
  head: "Head", neck: "Neck", shoulders: "Shoulders", chest: "Chest",
  back: "Back", wrist: "Wrist", hands: "Hands", waist: "Waist",
  legs: "Legs", feet: "Feet", ring1: "Ring", ring2: "Ring 2",
  trinket: "Trinket", mainhand: "Main Hand", offhand: "Off Hand",
  ranged: "Ranged", ammo: "Ammo",
};

function getStarterEquipment(classKey, raceKey) {
  const eq = Object.fromEntries(EQUIPMENT_SLOTS.map(s => [s, null]));

  eq.chest = { name: "Starter Shirt", powerLevel: 1 };
  eq.legs  = { name: "Starter Pants", powerLevel: 1 };
  eq.feet  = { name: "Starter Shoes", powerLevel: 1 };

  switch (classKey) {
    case "warrior":
      if (raceKey === "orc") {
        eq.mainhand = { name: "Starter Axe", powerLevel: 1 };
      } else if (raceKey === "minotaur" || raceKey === "troll") {
        eq.mainhand = { name: "Starter Greataxe", powerLevel: 1 };
      } else {
        eq.mainhand = { name: "Starter Sword",  powerLevel: 1 };
        eq.offhand  = { name: "Starter Shield", powerLevel: 1 };
      }
      break;
    case "paladin":
      eq.mainhand = { name: "Starter Sword",  powerLevel: 1 };
      eq.offhand  = { name: "Starter Shield", powerLevel: 1 };
      break;
    case "hunter":
      eq.mainhand = { name: "Starter Short Sword", powerLevel: 1 };
      eq.ranged   = { name: "Starter Bow",         powerLevel: 1 };
      eq.ammo     = { name: "Starter Arrows",      powerLevel: 1 };
      break;
    case "rogue":
      eq.mainhand = { name: "Starter Dagger", powerLevel: 1 };
      eq.offhand  = { name: "Starter Dagger", powerLevel: 1 };
      break;
    case "priest":
      eq.mainhand = { name: "Starter Staff", powerLevel: 1 };
      break;
    case "mage":
      eq.mainhand = { name: "Starter Wand", powerLevel: 1 };
      eq.offhand  = { name: "Starter Tome", powerLevel: 1 };
      break;
    case "warlock":
      eq.mainhand = { name: "Starter Wand",     powerLevel: 1 };
      eq.offhand  = { name: "Starter Grimoire", powerLevel: 1 };
      break;
    case "druid":
      eq.mainhand = { name: "Starter Staff", powerLevel: 1 };
      break;
    case "shaman":
      eq.mainhand = { name: "Starter Mace",   powerLevel: 1 };
      eq.offhand  = { name: "Starter Shield", powerLevel: 1 };
      break;
  }

  return eq;
}

// --- Combat ---
function getAvgEquipmentPower(char) {
  const items = Object.values(char.equipment).filter(item => item !== null);
  if (items.length === 0) return 1;
  return items.reduce((sum, item) => sum + item.powerLevel, 0) / items.length;
}

// Win probability fitted to: equal level → 99%, +1 mob level → 95%,
// +2 → 80%, +3 → 50%, +4 → 0%. Scores = level + avg power.
function combatWinChance(playerLevel, avgEquipPower, enemyLevel, enemyPower) {
  const diff = (playerLevel + avgEquipPower) - (enemyLevel + enemyPower);
  const x = Math.max(0, Math.min(4, diff + 4));
  if (x <= 0) return 0;
  if (x >= 4) return 0.99;
  return -0.000417 * x ** 4 + 0.01083 * x ** 3 - 0.12957 * x ** 2 + 0.619157 * x;
}

function pickRandom(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function generateCharacter(rng) {
  const raceKey  = pickRandom(rng, Object.keys(RACE_CLASS));
  const classKey = pickRandom(rng, RACE_CLASS[raceKey]);
  const gender   = rng() < 0.5 ? "m" : "f";
  const name     = pickRandom(rng, RACES[raceKey].names[gender]);
  return {
    id: "adventurer",
    entityType: EntityType.Character,
    name,
    race: raceKey,
    class: classKey,
    gender,
    faction: RACES[raceKey].faction,
    location: ZONES[0].id,
    memories: {},
    level: 1,
    xp: 0,
    equipment: getStarterEquipment(classKey, raceKey),
    factionRelationships: {},   // factions are unknown until first contact
    discoveredEnemies: {},      // zone id → array of discovered template ids
  };
}

function buildInitialState(rng) {
  const entities = {};
  const locations = [];
  for (const z of ZONES) {
    entities[z.id] = { entityType: EntityType.Location, id: z.id, name: z.name, desc: z.desc };
    locations.push(z.id);
  }
  const character = generateCharacter(() => Math.random());
  entities[character.id] = character;
  return {
    timestamp: 0,
    entities,
    characters: [character.id],
    locations,
    items: [],
    actions: [],
    vivInternalState: null,
    zoneEnemyStacks: {},  // zoneId -> [enemyId, …] ordered by spawn time; first alive one is chosen
  };
}

let cachedBundle = null;

async function runSim(seedStr, tickCount) {
  const rng = mulberry32(hashSeed(seedStr));
  const state = buildInitialState(rng);

  // --- Enemy entity helpers ---

  // Returns the id of the first living enemy on a zone's stack, or null if none.
  function firstAliveEnemy(zoneId) {
    for (const id of state.zoneEnemyStacks[zoneId] ?? []) {
      if (state.entities[id]?.alive) return id;
    }
    return null;
  }

  // Spawns a new enemy entity from the given template at zoneId, pushes it onto that zone's stack.
  function spawnEnemy(templateId, zoneId) {
    const template = ENEMY_TEMPLATES[templateId];
    const id = makeUUID(rng);
    state.entities[id] = {
      entityType: EntityType.Item,
      id,
      name: template.name,
      location: zoneId,
      alive: true,
      level: template.level,
      powerLevel: template.powerLevel,
      xpReward: template.xpReward,
      templateId,
      faction: template.faction,
    };
    state.items.push(id);
    if (!state.zoneEnemyStacks[zoneId]) state.zoneEnemyStacks[zoneId] = [];
    state.zoneEnemyStacks[zoneId].push(id);
    return id;
  }

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
    saveCharacterMemory: (characterID, actionID, memory) => { state.entities[characterID].memories[actionID] = memory; },
    saveItemInscriptions: (itemID, inscriptions) => { state.entities[itemID].inscriptions = inscriptions; },
    debug: { validateAPICalls: true, watchlists: {} },
  };

  if (!cachedBundle) {
    cachedBundle = await fetch("./bundle.json").then((r) => r.json());
  }

  initializeVivRuntime({ contentBundle: cachedBundle, adapter });

  const ticks = [];
  const char = structuredClone(state.entities["adventurer"]);

  for (let t = 0; t < tickCount; t++) {
    const adventurer = state.entities["adventurer"];
    const locationID = adventurer.location;
    const zoneName = ZONES.find(z => z.id === locationID)?.name ?? locationID;
    const allEnemiesHere = ZONE_ENEMIES[locationID] ?? [];
    const discoveredHere = adventurer.discoveredEnemies[locationID] ?? [];
    const undiscoveredHere = allEnemiesHere.filter(id => !discoveredHere.includes(id));

    // Expose precondition flags to viv so the pick-activity selector can gate fight/look-around.
    adventurer.canFight = discoveredHere.length > 0;
    adventurer.canScout = undiscoveredHere.length > 0;

    // events is [{text, type}] — type maps to a CSS class on the entry
    const events = [];

    // Viv's pick-activity selector picks wander / fight / look-around with equal weight,
    // skipping any option whose conditions are unmet.
    const actionsBefore = new Set(state.actions);
    await selectAction({ initiatorID: "adventurer" });
    const newActionIDs = state.actions.filter(id => !actionsBefore.has(id));
    const selectedActionName = newActionIDs.length > 0 ? state.entities[newActionIDs[0]].name : null;

    if (selectedActionName === "fight") {
      // Reuse an existing living enemy at this zone, or spawn a fresh one from a discovered template.
      let enemyId = firstAliveEnemy(locationID);
      if (!enemyId) {
        enemyId = spawnEnemy(pickRandom(rng, discoveredHere), locationID);
      }
      const enemy = state.entities[enemyId];

      const avgPower = getAvgEquipmentPower(adventurer);
      const winChance = combatWinChance(adventurer.level, avgPower, enemy.level, enemy.powerLevel);
      const playerWins = rng() < winChance;

      // Cap the reward so xp never exceeds the max-level threshold, then store it for the kill effect.
      const xpCap = LEVEL_XP_MIN[LEVEL_CAP - 1];
      adventurer.pendingXpReward = Math.min(enemy.xpReward, Math.max(0, xpCap - adventurer.xp));

      // Shared precast: both kill and retreat reference the specific enemy viv entity.
      const combatBindings = { adventurer: ["adventurer"], enemy: [enemyId] };

      if (playerWins) {
        const oldLevel = adventurer.level;
        // kill: applies XP via its viv effect and marks @enemy.alive = false.
        const killBefore = new Set(state.actions);
        await attemptAction({ actionName: "kill", initiatorID: "adventurer", precastBindings: combatBindings, suppressConditions: true });
        state.actions.filter(id => !killBefore.has(id)).forEach(id => {
          const a = state.entities[id];
          events.push({ text: a.report ?? a.gloss ?? "(action)", type: "victory" });
        });

        // level-up fires immediately as a reserved viv action when the sim awards a new level.
        const newLevel = Math.min(getLevel(adventurer.xp), LEVEL_CAP);
        if (newLevel > oldLevel) {
          adventurer.level = newLevel;
          const levelBefore = new Set(state.actions);
          await attemptAction({ actionName: "level-up", initiatorID: "adventurer", suppressConditions: true });
          state.actions.filter(id => !levelBefore.has(id)).forEach(id => {
            const a = state.entities[id];
            events.push({ text: a.report ?? a.gloss ?? "(action)", type: "victory" });
          });
        }
      } else {
        // retreat: enemy stays alive on the zone stack; next player to fight here meets this same enemy.
        const retreatBefore = new Set(state.actions);
        await attemptAction({ actionName: "retreat", initiatorID: "adventurer", precastBindings: combatBindings, suppressConditions: true });
        state.actions.filter(id => !retreatBefore.has(id)).forEach(id => {
          const a = state.entities[id];
          events.push({ text: a.report ?? a.gloss ?? "(action)", type: "retreat" });
        });
      }

    } else if (selectedActionName === "look-around") {
      const foundId = pickRandom(rng, undiscoveredHere);
      const enemy = ENEMY_TEMPLATES[foundId];
      if (rng() < enemy.discoveryRate) {
        if (!adventurer.discoveredEnemies[locationID]) {
          adventurer.discoveredEnemies[locationID] = [];
        }
        adventurer.discoveredEnemies[locationID].push(foundId);

        const factionId = enemy.faction;
        const newFaction = !(factionId in adventurer.factionRelationships);
        if (newFaction) {
          adventurer.factionRelationships[factionId] = initialFactionRep(factionId);
        }

        const factionNote = newFaction
          ? ` ${FACTIONS[factionId]?.name ?? factionId} added to known factions.`
          : "";
        events.push({ text: `${adventurer.name} spots a level ${enemy.level} ${enemy.name} in ${zoneName}.${factionNote}`, type: "scouting" });
      } else {
        events.push({ text: `${adventurer.name} searches ${zoneName} but finds nothing unusual.`, type: "scouting" });
      }

    } else {
      // wander: viv already changed adventurer.location via its effect; just surface the gloss.
      newActionIDs.forEach(id => {
        const a = state.entities[id];
        events.push({ text: a.report ?? a.gloss ?? "(action)", type: "" });
      });
    }

    state.timestamp += 10;
    ticks.push({
      index: t,
      timestamp: state.timestamp,
      events,
      character: structuredClone(state.entities["adventurer"]),
    });
  }

  return { character: char, ticks };
}

// --- UI ---

let simData = null;
let currentTick = 0;
let currentDisplayChar = null;

const statusEl    = document.getElementById("status");
const simViewEl   = document.getElementById("sim-view");
const tickLabelEl = document.getElementById("tick-label");
const btnPrev     = document.getElementById("btn-prev");
const btnNext     = document.getElementById("btn-next");
const btnRun      = document.getElementById("btn-run");
const eventsEl    = document.getElementById("events");
const seedInput   = document.getElementById("seed-input");
const stepsInput  = document.getElementById("steps-input");
const charCardEl  = document.getElementById("char-card");
const zonemapEl   = document.getElementById("zonemap");
const charModalEl = document.getElementById("char-modal");
const modalBodyEl = document.getElementById("modal-body");

function factionStanding(rep) {
  if (rep <= 10)  return { label: "Hostile",     cls: "standing-hostile" };
  if (rep <= 25)  return { label: "Unfriendly",  cls: "standing-unfriendly" };
  if (rep <= 60)  return { label: "Neutral",     cls: "standing-neutral" };
  if (rep <= 80)  return { label: "Friendly",    cls: "standing-friendly" };
  return            { label: "Honored",      cls: "standing-honored" };
}

function renderCharCard(char) {
  const cd = CLASS_DATA[char.class];
  const level = char.level ?? 1;
  const xp = char.xp ?? 0;
  const nextXP = level < LEVEL_CAP ? LEVEL_XP_MIN[level] : null;
  const xpText = nextXP !== null ? `${xp} / ${nextXP} XP` : `${xp} XP (max)`;

  charCardEl.innerHTML = `
    <div class="char-portrait" style="border-color: ${cd.color}">
      <span class="char-icon">${cd.icon}</span>
    </div>
    <div class="char-info">
      <div class="char-name">${char.name}</div>
      <div class="char-details">
        <span class="char-class" style="color:${cd.color}">${char.class.charAt(0).toUpperCase() + char.class.slice(1)}</span>
        <span class="char-sep">·</span>
        <span>${RACE_LABELS[char.race]}</span>
      </div>
      <div class="char-level">Level ${level} · ${xpText}</div>
    </div>`;
}

function renderModal(char) {
  const cd = CLASS_DATA[char.class];
  const factionColor = char.faction === "Covenant" ? "#2a7dc9" : "#c42b2b";
  const genderLabel  = char.gender === "m" ? "Male" : "Female";
  const level = char.level ?? 1;
  const xp    = char.xp ?? 0;
  const nextXP = level < LEVEL_CAP ? LEVEL_XP_MIN[level] : null;
  const xpText = nextXP !== null ? `${xp} / ${nextXP}` : `${xp} (max)`;
  const className = char.class.charAt(0).toUpperCase() + char.class.slice(1);

  const statsRows = [
    ["Class",   `<span style="color:${cd.color}">${className}</span>`],
    ["Race",    RACE_LABELS[char.race]],
    ["Gender",  genderLabel],
    ["Faction", `<span style="color:${factionColor}">${char.faction}</span>`],
    ["Level",   String(level)],
    ["XP",      xpText],
  ].map(([k, v]) => `<tr><td class="col-label">${k}</td><td>${v}</td></tr>`).join("");

  const equipRows = EQUIPMENT_SLOTS.map(slot => {
    const item  = char.equipment[slot];
    const label = SLOT_LABELS[slot];
    if (!item) {
      return `<tr><td class="col-label col-muted">${label}</td><td class="col-muted">—</td><td class="col-power col-muted">—</td></tr>`;
    }
    return `<tr><td class="col-label">${label}</td><td>${item.name}</td><td class="col-power">${item.powerLevel}</td></tr>`;
  }).join("");

  const knownFactions = Object.entries(char.factionRelationships ?? {});
  const factionRows = knownFactions.length === 0
    ? `<tr><td colspan="3" class="col-muted" style="font-style:italic">None discovered yet</td></tr>`
    : knownFactions.map(([factionId, rep]) => {
        const name = FACTIONS[factionId]?.name ?? factionId;
        const { label, cls } = factionStanding(rep);
        return `<tr>
          <td class="col-label">${name}</td>
          <td class="${cls}">${label}</td>
          <td class="col-power ${cls}">${rep}</td>
        </tr>`;
      }).join("");

  const factionHead = knownFactions.length > 0
    ? `<thead><tr><td class="col-label col-head">Faction</td><td class="col-head">Standing</td><td class="col-power col-head">Rep</td></tr></thead>`
    : "";

  modalBodyEl.innerHTML = `
    <div class="modal-char-header">
      <div class="char-portrait" style="border-color:${cd.color}; width:48px; height:48px">
        <span class="char-icon" style="font-size:1.4rem">${cd.icon}</span>
      </div>
      <div>
        <div class="char-name">${char.name}</div>
        <div class="modal-char-sub">Level ${level} <span style="color:${cd.color}">${className}</span></div>
      </div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">Character</div>
      <table class="modal-table"><tbody>${statsRows}</tbody></table>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">Equipment</div>
      <table class="modal-table">
        <thead><tr>
          <td class="col-label col-head">Slot</td>
          <td class="col-head">Item</td>
          <td class="col-power col-head">Power</td>
        </tr></thead>
        <tbody>${equipRows}</tbody>
      </table>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">Known Factions</div>
      <table class="modal-table">
        ${factionHead}
        <tbody>${factionRows}</tbody>
      </table>
    </div>`;
}

function renderZonemap(currentLocationID, discoveredEnemies) {
  zonemapEl.innerHTML = "";
  for (const z of ZONES) {
    const el = document.createElement("div");
    const isDanger = !!ZONE_ENEMIES[z.id];
    el.className = "zone-node" +
      (z.id === currentLocationID ? " active" : "") +
      (isDanger ? " danger" : "");

    const discovered = (discoveredEnemies?.[z.id] ?? [])
      .map(id => ENEMY_TEMPLATES[id])
      .filter(Boolean)
      .sort((a, b) => a.level - b.level);

    const enemyHTML = discovered.length > 0
      ? `<div class="zone-enemies">${
          discovered.map(e => `<span class="zone-enemy">${e.name} · Lv. ${e.level}</span>`).join("")
        }</div>`
      : "";

    el.innerHTML = `<span class="zone-name">${z.name}</span><span class="zone-desc">${z.desc}</span>${enemyHTML}`;
    zonemapEl.appendChild(el);
  }
}

function render() {
  const tick = simData.ticks[currentTick];
  currentDisplayChar = tick.character;

  tickLabelEl.textContent = `Tick ${currentTick + 1} / ${simData.ticks.length}`;
  btnPrev.disabled = currentTick === 0;
  btnNext.disabled = currentTick === simData.ticks.length - 1;

  renderCharCard(tick.character);
  renderZonemap(tick.character.location, tick.character.discoveredEnemies);

  if (!charModalEl.hidden) renderModal(tick.character);

  eventsEl.innerHTML = "";
  if (tick.events.length === 0) {
    const el = document.createElement("div");
    el.className = "event-entry empty";
    el.textContent = "(no events this tick)";
    eventsEl.appendChild(el);
  } else {
    for (const e of tick.events) {
      const el = document.createElement("div");
      el.className = "event-entry" + (e.type ? " " + e.type : "");
      el.textContent = e.text;
      eventsEl.appendChild(el);
    }
  }
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.hidden = !msg;
  statusEl.className = "status" + (isError ? " error" : "");
}

async function runSimulation() {
  const seedStr   = seedInput.value.trim() || "greenvale";
  const tickCount = Math.min(500, Math.max(1, parseInt(stepsInput.value, 10) || 20));
  btnRun.disabled = true;
  setStatus(`entering the world…`);
  simViewEl.hidden = true;
  charModalEl.hidden = true;
  cachedBundle = null;
  try {
    simData = await runSim(seedStr, tickCount);
    currentTick = 0;
    currentDisplayChar = simData.character;
    renderCharCard(simData.character);
    simViewEl.hidden = false;
    render();
    setStatus("");
  } catch (err) {
    setStatus(`error: ${err.message}`, true);
    console.error(err);
  } finally {
    btnRun.disabled = false;
  }
}

// --- Modal ---
charCardEl.addEventListener("click", () => {
  if (!currentDisplayChar) return;
  renderModal(currentDisplayChar);
  charModalEl.hidden = false;
});

document.getElementById("modal-backdrop").addEventListener("click", () => {
  charModalEl.hidden = true;
});

document.getElementById("modal-close").addEventListener("click", () => {
  charModalEl.hidden = true;
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !charModalEl.hidden) charModalEl.hidden = true;
});

btnRun.addEventListener("click", runSimulation);
btnPrev.addEventListener("click", () => { if (currentTick > 0) { currentTick--; render(); } });
btnNext.addEventListener("click", () => { if (currentTick < simData.ticks.length - 1) { currentTick++; render(); } });
seedInput.addEventListener("keydown",  (e) => { if (e.key === "Enter") runSimulation(); });
stepsInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runSimulation(); });
