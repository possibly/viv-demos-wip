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

export const RACES = {
  human:    { faction: "Covenant", names: { m: ["Gareth","Roland","Marcus","Edwin","Aldric","Brennan","Calder","Donovan"], f: ["Elaine","Lyssa","Celeste","Mira","Reyna","Arden","Brielle","Cayla"] } },
  dwarf:    { faction: "Covenant", names: { m: ["Thane","Belden","Grundar","Kordak","Torvin","Volgrin","Brundar","Aldric"], f: ["Helga","Sigrid","Freya","Astrid","Brynja","Ingrid","Vigdis","Dagmar"] } },
  elf:      { faction: "Covenant", names: { m: ["Faelyn","Sylvan","Aeron","Caelan","Miral","Thalion","Erevan","Caladorn"], f: ["Lyria","Aeris","Miriel","Senna","Sylara","Thalindra","Elowen","Caladwen"] } },
  gnome:    { faction: "Covenant", names: { m: ["Cogsworth","Fizzle","Sprocket","Tinkard","Boltz","Gadget","Widget","Crank"], f: ["Fizzy","Bolty","Gizmo","Twitch","Ratchet","Wrenchy","Clicky","Sparky"] } },
  orc:      { faction: "Vanguard", names: { m: ["Kragnok","Bloodtusk","Grimfang","Gorthar","Vorak","Thrak","Muzgash","Drakkul"], f: ["Dasha","Grona","Korra","Meksha","Vrasha","Gorla","Traka","Durga"] } },
  revenant: { faction: "Vanguard", names: { m: ["Valdris","Corvus","Ashgor","Grimton","Soulren","Morvane","Wraithek","Duskmore"], f: ["Velsa","Marsea","Ashlea","Corvina","Mournweave","Shadowveil","Duskara","Wraithia"] } },
  minotaur: { faction: "Vanguard", names: { m: ["Earthhorn","Stormhoof","Thunderstone","Boulderback","Wildhorn","Ironhide","Dustwalker","Stoneback"], f: ["Cloudchaser","Mistrunner","Sunwalker","Windsong","Skygazer","Meadowhoof","Dawnstep","Rainhoof"] } },
  troll:    { faction: "Vanguard", names: { m: ["Zekhan","Voodrix","Hexlord","Zanzil","Akali","Malacrass","Zaruka","Jixtar"], f: ["Zalaxa","Jixxa","Hexxa","Vuja","Mossi","Lixxa","Zanda","Trolla"] } },
};

export const CLASS_DATA = {
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

export const RACE_CLASS = {
  human:    ["warrior","paladin","rogue","priest","mage","warlock"],
  dwarf:    ["warrior","paladin","hunter","rogue","priest"],
  elf:      ["warrior","hunter","rogue","priest","druid"],
  gnome:    ["warrior","rogue","mage","warlock"],
  orc:      ["warrior","hunter","rogue","shaman","warlock"],
  revenant: ["warrior","rogue","priest","mage","warlock"],
  minotaur: ["warrior","hunter","shaman","druid"],
  troll:    ["warrior","hunter","rogue","priest","shaman"],
};

export const RACE_LABELS = {
  human: "Human", dwarf: "Dwarf", elf: "Elf", gnome: "Gnome",
  orc: "Orc", revenant: "Revenant", minotaur: "Minotaur", troll: "Troll",
};

export const ZONES = [
  { id: "hearthfield",  name: "Hearthfield",       desc: "A peaceful hillside settlement where new arrivals catch their first breath." },
  { id: "millhaven",    name: "Millhaven",          desc: "A busy crossroads hamlet; the Wayward Lantern inn draws travelers from across the realm." },
  { id: "briar_edge",   name: "The Briar's Edge",   desc: "The treeline thickens here; wolves and bandits lurk in the tangled undergrowth." },
  { id: "stonewick",    name: "Stonewick Farm",     desc: "Rolling fields and weathered farmhouses, goats grazing in the amber light." },
  { id: "stillwater",   name: "Stillwater Mere",    desc: "A glittering lake that mirrors the sky. Scouts watch from the reed banks." },
];

export const LEVEL_XP_MIN = [0, 300, 900, 2700, 6500, 14000];
export const LEVEL_CAP = 6;

function getLevel(xp) {
  for (let i = LEVEL_XP_MIN.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_XP_MIN[i]) return i + 1;
  }
  return 1;
}

export const ENEMY_FACTION = { id: "grimspawn", name: "The Grimspawn", type: "enemy" };

export const FACTIONS = {
  [ENEMY_FACTION.id]: ENEMY_FACTION,
};

export const QUEST_GIVER = {
  id: "questGiver",
  name: "Elder Mira",
  location: "millhaven",
  discoveryRate: 1.0,
};

export const RANGER_VOSS = {
  id: "rangerVoss",
  name: "Ranger Voss",
  location: "stonewick",
  discoveryRate: 1.0,
};

export const ALL_QUEST_GIVERS = [QUEST_GIVER, RANGER_VOSS];

export const VENDOR_ARNAULT = {
  id: "vendorArnault",
  name: "Arnault the Trader",
  location: "hearthfield",
  discoveryRate: 1.0,
  items: [
    { name: "Leather Gloves",  powerLevel: 1, slot: "hands", cost: 15 },
    { name: "Leather Bracers", powerLevel: 1, slot: "wrist", cost: 15 },
    { name: "Leather Belt",    powerLevel: 1, slot: "waist", cost: 15 },
  ],
};

export const ALL_VENDORS = [VENDOR_ARNAULT];

export const QUEST_ITEMS = {
  captains_insignia: {
    id: "captains_insignia",
    name: "Captain's Insignia",
    dropFrom: "grimspawn_captain",
    dropChance: 1.0,
  },
};

export const QUESTS = [
  {
    id: "grimspawn_scout_patrol",
    name: "Scout Patrol",
    level: 1,
    questGiverId: "questGiver",
    targetTemplate: "grimspawn_scout",
    targetZone: "briar_edge",
    targetCount: 3,
    description: "Slay 3 Grimspawn Scouts in The Briar's Edge.",
  },
  {
    id: "grimspawn_warrior_hunt",
    name: "Warrior Hunt",
    level: 2,
    questGiverId: "questGiver",
    targetTemplate: "grimspawn_warrior",
    targetZone: "stillwater",
    targetCount: 2,
    description: "Defeat 2 Grimspawn Warriors at Stillwater Mere.",
  },
  {
    id: "grimspawn_enforcer_purge",
    name: "Enforcer Purge",
    level: 3,
    questGiverId: "questGiver",
    targetTemplate: "grimspawn_enforcer",
    targetZone: "stillwater",
    targetCount: 1,
    description: "Eliminate the Grimspawn Enforcer at Stillwater Mere.",
  },
  {
    id: "captains_seal",
    name: "The Captain's Seal",
    level: 4,
    questGiverId: "rangerVoss",
    targetTemplate: "grimspawn_captain",
    targetZone: "stillwater",
    targetCount: 1,
    questItem: "captains_insignia",
    description: "Slay a Grimspawn Captain at Stillwater Mere and recover the Captain's Insignia.",
  },
];

export function questXpReward(questLevel) {
  return questLevel * 400;
}

export function pickQuestForAdventurer(adventurer, questGiverId) {
  const completed = adventurer.completedQuests ?? [];
  return QUESTS
    .filter(q => !completed.includes(q.id) && q.level <= adventurer.level + 2 && q.questGiverId === questGiverId)
    .sort((a, b) => a.level - b.level)[0] ?? null;
}

function initialFactionRep(factionId) {
  return FACTIONS[factionId]?.type === "enemy" ? 0 : 50;
}

export const ENEMY_TEMPLATES = {
  grimspawn_scout:    { id: "grimspawn_scout",    name: "Grimspawn Scout",    faction: ENEMY_FACTION.id, type: "humanoid", level: 1, powerLevel: 1, xpReward: 50,  discoveryRate: 1.0 },
  grimspawn_warrior:  { id: "grimspawn_warrior",  name: "Grimspawn Warrior",  faction: ENEMY_FACTION.id, type: "humanoid", level: 2, powerLevel: 1, xpReward: 100, discoveryRate: 1.0 },
  grimspawn_enforcer: { id: "grimspawn_enforcer", name: "Grimspawn Enforcer", faction: ENEMY_FACTION.id, type: "humanoid", level: 3, powerLevel: 1, xpReward: 200, discoveryRate: 1.0 },
  grimspawn_captain:  { id: "grimspawn_captain",  name: "Grimspawn Captain",  faction: ENEMY_FACTION.id, type: "humanoid", level: 4, powerLevel: 2, xpReward: 350, discoveryRate: 1.0 },
  grimspawn_warlord:  { id: "grimspawn_warlord",  name: "Grimspawn Warlord",  faction: ENEMY_FACTION.id, type: "humanoid", level: 5, powerLevel: 2, xpReward: 500, discoveryRate: 1.0 },
};

export const ZONE_ENEMIES = {
  briar_edge: ["grimspawn_scout", "grimspawn_warrior"],
  stonewick:  ["grimspawn_scout"],
  stillwater: ["grimspawn_warrior", "grimspawn_enforcer", "grimspawn_captain", "grimspawn_warlord"],
};

// Unified discoverable NPC pool per zone. Contains only non-player characters (enemies, quest givers,
// vendors, etc.) — player characters are never discoverable. Each entry is { id, discoveryRate }; role
// is inferred from entity data after discovery (ENEMY_TEMPLATES, ALL_QUEST_GIVERS, ALL_VENDORS, etc.).
export const ZONE_DISCOVERABLES = Object.fromEntries(
  ZONES.map(z => [
    z.id,
    [
      ...(ZONE_ENEMIES[z.id] ?? []).map(id => ({ id, discoveryRate: ENEMY_TEMPLATES[id].discoveryRate })),
      ...ALL_QUEST_GIVERS.filter(qg => qg.location === z.id).map(qg => ({ id: qg.id, discoveryRate: qg.discoveryRate })),
      ...ALL_VENDORS.filter(v => v.location === z.id).map(v => ({ id: v.id, discoveryRate: v.discoveryRate })),
    ],
  ])
);

// Hostile zones where chests can spawn. Kept separate so CHEST_CONFIGS can reference it.
export const HOSTILE_ZONES = ["briar_edge", "stonewick", "stillwater"];

// Level-range → item power level range (unified mapping used by chests and future systems).
// level 1-5 bracket maps to item power levels 2-3 (above starter gear, below endgame).
export const LEVEL_RANGE_POWER = [
  { minLevel: 1, maxLevel: 5, minPowerLevel: 2, maxPowerLevel: 3 },
];

export const CHEST_CONFIGS = [
  {
    name: "Worn Wooden Chest",
    minLevel: 1, maxLevel: 5,
    minPowerLevel: 2, maxPowerLevel: 3,
    minItems: 1, maxItems: 2,
    discoveryRate: 0.75,
    spawnChance: 0.25,
    cooldownTicks: 100,
    spawnZones: HOSTILE_ZONES,
  },
];

export const WEAK_LOOT_ITEMS = [
  { name: "Tattered Cloth Hood",     powerLevel: 1, slot: "head" },
  { name: "Worn Leather Gloves",     powerLevel: 1, slot: "hands" },
  { name: "Rusty Iron Knife",        powerLevel: 1, slot: "mainhand" },
  { name: "Crude Wooden Club",       powerLevel: 1, slot: "mainhand" },
  { name: "Frayed Linen Bracers",    powerLevel: 1, slot: "wrist" },
  { name: "Battered Iron Helm",      powerLevel: 2, slot: "head" },
  { name: "Scratched Leather Boots", powerLevel: 2, slot: "feet" },
  { name: "Chipped Short Sword",     powerLevel: 2, slot: "mainhand" },
  { name: "Old Iron Mace",           powerLevel: 2, slot: "mainhand" },
  { name: "Dented Iron Shield",      powerLevel: 2, slot: "offhand" },
  { name: "Rough-spun Chain Coif",   powerLevel: 3, slot: "head" },
  { name: "Scuffed Iron Pauldrons",  powerLevel: 3, slot: "shoulders" },
  { name: "Notched Broadsword",      powerLevel: 3, slot: "mainhand" },
  { name: "Crude Iron Axe",          powerLevel: 3, slot: "mainhand" },
  { name: "Pitted Iron Gauntlets",   powerLevel: 3, slot: "hands" },
];

export function itemSellPrice(item) {
  return (item.powerLevel ?? 1) * 5;
}

export function copperToString(total) {
  const gold   = Math.floor(total / 10000);
  const silver = Math.floor((total % 10000) / 100);
  const copper = total % 100;
  const parts  = [];
  if (gold   > 0) parts.push(`${gold}g`);
  if (silver > 0) parts.push(`${silver}s`);
  if (copper > 0) parts.push(`${copper}c`);
  return parts.length > 0 ? parts.join(" ") : "0c";
}

function generateLoot(rng, enemy) {
  const result = { copper: 0, item: null };
  if (enemy.type !== "humanoid" || enemy.level > 5) return result;
  if (rng() < 0.4) result.copper = Math.floor(rng() * 3) + 1;
  if (rng() < 0.3) result.item = pickRandom(rng, WEAK_LOOT_ITEMS);
  return result;
}

function spawnChest(config, EntityType, rng, state) {
  const zoneId = pickRandom(rng, config.spawnZones);
  const itemCount = Math.floor(rng() * (config.maxItems - config.minItems + 1)) + config.minItems;

  const lootItemIds = [];
  for (let i = 0; i < itemCount; i++) {
    const powerLevel = Math.floor(rng() * (config.maxPowerLevel - config.minPowerLevel + 1)) + config.minPowerLevel;
    const candidates = WEAK_LOOT_ITEMS.filter(it => it.powerLevel === powerLevel);
    const template = pickRandom(rng, candidates.length > 0 ? candidates : WEAK_LOOT_ITEMS);
    const itemId = makeUUID(rng);
    state.entities[itemId] = {
      entityType: EntityType.Item,
      id: itemId,
      name: template.name,
      powerLevel: template.powerLevel,
      slot: template.slot,
      location: zoneId,
    };
    state.items.push(itemId);
    lootItemIds.push(itemId);
  }

  const chestId = makeUUID(rng);
  state.entities[chestId] = {
    entityType: EntityType.Item,
    id: chestId,
    name: config.name,
    location: zoneId,
    isChest: true,
    lootItems: lootItemIds,
  };
  state.items.push(chestId);
  state.chestState.activeChestId = chestId;
  return { chestId, zoneId };
}

export const EQUIPMENT_SLOTS = [
  "head","neck","shoulders","chest","back","wrist","hands","waist","legs","feet",
  "ring1","ring2","trinket","mainhand","offhand","ranged","ammo",
];

export const SLOT_LABELS = {
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
    case "priest":  eq.mainhand = { name: "Starter Staff",    powerLevel: 1 }; break;
    case "mage":    eq.mainhand = { name: "Starter Wand",     powerLevel: 1 }; eq.offhand = { name: "Starter Tome",     powerLevel: 1 }; break;
    case "warlock": eq.mainhand = { name: "Starter Wand",     powerLevel: 1 }; eq.offhand = { name: "Starter Grimoire", powerLevel: 1 }; break;
    case "druid":   eq.mainhand = { name: "Starter Staff",    powerLevel: 1 }; break;
    case "shaman":  eq.mainhand = { name: "Starter Mace",     powerLevel: 1 }; eq.offhand = { name: "Starter Shield",  powerLevel: 1 }; break;
  }
  return eq;
}

function getAvgEquipmentPower(char) {
  const items = Object.values(char.equipment).filter(item => item !== null);
  if (items.length === 0) return 1;
  return items.reduce((sum, item) => sum + item.powerLevel, 0) / items.length;
}

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

function generateCharacter(EntityType, rng) {
  const raceKey  = pickRandom(rng, Object.keys(RACE_CLASS));
  const classKey = pickRandom(rng, RACE_CLASS[raceKey]);
  const gender   = rng() < 0.5 ? "m" : "f";
  const name     = pickRandom(rng, RACES[raceKey].names[gender]);
  return {
    id: "adventurer",
    entityType: EntityType.Character,
    name, race: raceKey, class: classKey, gender,
    faction: RACES[raceKey].faction,
    location: ZONES[0].id,
    memories: {},
    level: 1, xp: 0,
    copper: 0,
    inventory: [],
    equipment: getStarterEquipment(classKey, raceKey),
    factionRelationships: {},
    discoveredNPCs: {},
    completedQuests: [],
    questActive: false,
    questEnemyFound: false,
    questHuntDone: false,
    questReadyToComplete: false,
    pendingQuestEligible: false,
  };
}

function buildInitialState(EntityType) {
  const entities = {};
  const locations = [];
  for (const z of ZONES) {
    entities[z.id] = { entityType: EntityType.Location, id: z.id, name: z.name, desc: z.desc };
    locations.push(z.id);
  }
  const character = generateCharacter(EntityType, () => Math.random());
  entities[character.id] = character;
  const questGiverEntity = {
    entityType: EntityType.Character,
    id: QUEST_GIVER.id,
    name: QUEST_GIVER.name,
    location: QUEST_GIVER.location,
    memories: {},
  };
  entities[QUEST_GIVER.id] = questGiverEntity;
  const rangerVossEntity = {
    entityType: EntityType.Character,
    id: RANGER_VOSS.id,
    name: RANGER_VOSS.name,
    location: RANGER_VOSS.location,
    memories: {},
  };
  entities[RANGER_VOSS.id] = rangerVossEntity;
  for (const vendor of ALL_VENDORS) {
    entities[vendor.id] = {
      entityType: EntityType.Character,
      id: vendor.id,
      name: vendor.name,
      location: vendor.location,
      memories: {},
    };
  }
  const worldEntity = { entityType: EntityType.Character, id: "world", name: "The World", memories: {} };
  entities["world"] = worldEntity;
  return {
    timestamp: 0, entities,
    characters: [character.id, QUEST_GIVER.id, RANGER_VOSS.id, ...ALL_VENDORS.map(v => v.id), "world"], locations,
    items: [], actions: [],
    vivInternalState: null,
    zoneEnemyStacks: {},
    chestState: { activeChestId: null, cooldownUntilTick: 0 },
  };
}

export async function runSim({ initializeVivRuntime, selectAction, attemptAction, tickPlanner, EntityType }, bundle, seedStr, tickCount) {
  const rng = mulberry32(hashSeed(seedStr));
  const state = buildInitialState(EntityType);

  function firstAliveEnemyOfTemplate(zoneId, templateId) {
    for (const id of state.zoneEnemyStacks[zoneId] ?? []) {
      const e = state.entities[id];
      if (e?.alive && e.templateId === templateId) return id;
    }
    return null;
  }

  function spawnEnemy(templateId, zoneId) {
    const template = ENEMY_TEMPLATES[templateId];
    const id = makeUUID(rng);
    state.entities[id] = {
      entityType: EntityType.Character,
      id, name: template.name, location: zoneId,
      alive: true, level: template.level, powerLevel: template.powerLevel,
      xpReward: template.xpReward, templateId, type: template.type, faction: template.faction, memories: {},
    };
    state.characters.push(id);
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

  initializeVivRuntime({ contentBundle: bundle, adapter });

  const ticks = [];
  const initialChar = structuredClone(state.entities["adventurer"]);
  const xpCap = LEVEL_XP_MIN[LEVEL_CAP - 1];
  const chestConfig = CHEST_CONFIGS[0];

  for (let t = 0; t < tickCount; t++) {
    // Chest spawn check: 25% chance per tick when no chest is active and cooldown has passed.
    if (!state.chestState.activeChestId && t >= state.chestState.cooldownUntilTick) {
      if (rng() < chestConfig.spawnChance) {
        const { chestId, zoneId } = spawnChest(chestConfig, EntityType, rng, state);
        await attemptAction({
          actionName: "spawn-chest",
          initiatorID: "world",
          precastBindings: { world: ["world"], chest: [chestId], zone: [zoneId] },
          suppressConditions: true,
        });
      }
    }

    const adventurer = state.entities["adventurer"];
    const locationID = adventurer.location;
    const zoneName = ZONES.find(z => z.id === locationID)?.name ?? locationID;
    const discoveredHere = adventurer.discoveredNPCs[locationID] ?? [];

    // Undiscovered pool: any Viv character in this zone not yet found
    const undiscoveredPool = (ZONE_DISCOVERABLES[locationID] ?? []).filter(d => !discoveredHere.includes(d.id));

    // If a chest is spawned in this zone and not yet discovered, add it to the pool.
    if (state.chestState.activeChestId) {
      const chest = state.entities[state.chestState.activeChestId];
      if (chest?.location === locationID && !discoveredHere.includes(chest.id)) {
        undiscoveredPool.push({ id: chest.id, discoveryRate: chestConfig.discoveryRate });
      }
    }

    // Quest givers already discovered here — used for auto-accept logic below
    const discoveredQuestGiversHere = ALL_QUEST_GIVERS.filter(qg =>
      qg.location === locationID && discoveredHere.includes(qg.id)
    );

    // Vendors already discovered here — used for buy/sell flag computation
    const discoveredVendorsHere = ALL_VENDORS.filter(v =>
      v.location === locationID && discoveredHere.includes(v.id)
    );

    // Update quest state flags read by Viv plan conditions
    if (adventurer.questActive) {
      adventurer.questEnemyFound = (adventurer.discoveredNPCs[adventurer.questTargetZone] ?? []).includes(adventurer.questTargetTemplate);
      const killsDone = (adventurer.questKillsDone ?? 0) >= (adventurer.questKillsNeeded ?? 1);
      const activeQuest = QUESTS.find(q => q.id === adventurer.questId);
      const itemDone = !activeQuest?.questItem || adventurer.questItemCollected;
      adventurer.questHuntDone = killsDone && itemDone;
      // Use the stored questGiverLocation set at accept time (works for any quest giver)
      adventurer.questReadyToComplete = adventurer.questHuntDone && locationID === adventurer.questGiverLocation;

      // Precompute pendingLevel for complete-quest's level-up reaction
      if (adventurer.questReadyToComplete) {
        const newXp = Math.min(adventurer.xp + (adventurer.questXpReward ?? 0), xpCap);
        adventurer.pendingLevel = Math.min(getLevel(newXp), LEVEL_CAP);
      }
    }

    // Auto-queue accept-quest when at a discovered quest giver and not on a quest
    if (!adventurer.questActive && discoveredQuestGiversHere.length > 0) {
      for (const qg of discoveredQuestGiversHere) {
        const nextQuest = pickQuestForAdventurer(adventurer, qg.id);
        if (nextQuest) {
          adventurer.pendingQuestId = nextQuest.id;
          adventurer.pendingQuestLevel = nextQuest.level;
          adventurer.pendingQuestEligible = nextQuest.level <= adventurer.level + 2;
          adventurer.pendingAcceptQuestGiverId = qg.id;
          adventurer.pendingAcceptQuest = true;
          break;
        }
      }
    }

    // Viv's quest-directed selector handles all quest-phase routing; these flags just expose
    // what's possible at the current location and are read as conditions by Viv actions.
    adventurer.canFight = discoveredHere.some(id => id in ENEMY_TEMPLATES);
    adventurer.canScout = undiscoveredPool.length > 0;

    // Vendor interaction flags: sell when inventory has non-quest items; buy when a vendor here
    // stocks an item whose power level exceeds the equipped slot and the player can afford it.
    const sellableItems = (adventurer.inventory ?? []).filter(item => !item.isQuestItem);
    adventurer.canSellItems = sellableItems.length > 0 && discoveredVendorsHere.length > 0;

    const buyableCandidates = [];
    for (const vendor of discoveredVendorsHere) {
      for (const vi of vendor.items) {
        const currentPower = adventurer.equipment[vi.slot]?.powerLevel ?? 0;
        if (vi.powerLevel > currentPower && vi.cost <= (adventurer.copper ?? 0)) {
          buyableCandidates.push({ item: vi, vendor });
        }
      }
    }
    adventurer.canBuyItem = buyableCandidates.length > 0;

    const events = [];

    // Fire pending accept-quest (from first encounter or return visit)
    if (adventurer.pendingAcceptQuest) {
      adventurer.pendingAcceptQuest = false;
      const quest = QUESTS.find(q => q.id === adventurer.pendingQuestId);
      const activeQuestGiverId = adventurer.pendingAcceptQuestGiverId ?? QUEST_GIVER.id;
      const questBindings = { adventurer: ["adventurer"], questGiver: [activeQuestGiverId] };
      const acceptBefore = new Set(state.actions);
      await attemptAction({ actionName: "accept-quest", initiatorID: "adventurer", precastBindings: questBindings });
      const newAcceptIDs = state.actions.filter(id => !acceptBefore.has(id));
      if (newAcceptIDs.length > 0 && quest) {
        adventurer.questId = quest.id;
        adventurer.questGiverId = activeQuestGiverId;
        adventurer.questTargetTemplate = quest.targetTemplate;
        adventurer.questTargetZone = quest.targetZone;
        adventurer.questKillsNeeded = quest.targetCount;
        adventurer.questKillsDone = 0;
        adventurer.questItemCollected = false;
        adventurer.questXpReward = questXpReward(quest.level);
        adventurer.questEnemyFound = (adventurer.discoveredNPCs[quest.targetZone] ?? []).includes(quest.targetTemplate);
        adventurer.questHuntDone = false;
        adventurer.questReadyToComplete = false;
        newAcceptIDs.forEach(id => {
          const a = state.entities[id];
          events.push({ text: a.report ?? a.gloss ?? "(action)", type: "quest" });
        });
        events.push({ text: `Quest: ${quest.description}`, type: "quest" });
      }
    }

    // Advance the quest plan (no-op when no plan is queued)
    await tickPlanner();

    // Viv's pick-activity selector drives all routing: quest-directed (in order) → free-roaming
    const actionsBefore = new Set(state.actions);
    await selectAction({ initiatorID: "adventurer" });
    const newActionIDs = state.actions.filter(id => !actionsBefore.has(id));
    const selectedActionName = newActionIDs.length > 0 ? state.entities[newActionIDs[0]].name : null;

    if (selectedActionName === "fight") {
      // Bias toward quest target when Viv selects fight during the hunt phase
      const enemiesDiscoveredHere = discoveredHere.filter(id => id in ENEMY_TEMPLATES);
      const inHuntPhase = adventurer.questActive && (adventurer.questEnemyFound ?? false) && !(adventurer.questHuntDone ?? false);
      const questTargetHere = inHuntPhase && locationID === adventurer.questTargetZone && enemiesDiscoveredHere.includes(adventurer.questTargetTemplate);
      const templateId = questTargetHere ? adventurer.questTargetTemplate : pickRandom(rng, enemiesDiscoveredHere);

      let enemyId = firstAliveEnemyOfTemplate(locationID, templateId);
      if (!enemyId) enemyId = spawnEnemy(templateId, locationID);
      const enemy = state.entities[enemyId];

      const avgPower = getAvgEquipmentPower(adventurer);
      const winChance = combatWinChance(adventurer.level, avgPower, enemy.level, enemy.powerLevel);
      const playerWins = rng() < winChance;

      adventurer.pendingXpReward = Math.min(enemy.xpReward, Math.max(0, xpCap - adventurer.xp));
      adventurer.pendingLevel = Math.min(getLevel(adventurer.xp + adventurer.pendingXpReward), LEVEL_CAP);

      const combatBindings = { adventurer: ["adventurer"], enemy: [enemyId] };

      if (playerWins) {
        // Generate loot before kill fires so the kill reaction can queue loot-item
        const loot = generateLoot(rng, enemy);
        let lootItemId = null;
        if (loot.item) {
          lootItemId = makeUUID(rng);
          state.entities[lootItemId] = { entityType: EntityType.Item, id: lootItemId, location: locationID, ...loot.item };
          state.items.push(lootItemId);
          adventurer.pendingLootId = lootItemId;
          adventurer.shouldEquipLoot = loot.item.powerLevel > (adventurer.equipment[loot.item.slot]?.powerLevel ?? 0);
          adventurer.pendingEquipSlot = loot.item.slot;
        } else {
          adventurer.pendingLootId = false;
          adventurer.shouldEquipLoot = false;
        }

        const killBefore = new Set(state.actions);
        await attemptAction({ actionName: "kill", initiatorID: "adventurer", precastBindings: combatBindings, suppressConditions: true });
        state.actions.filter(id => !killBefore.has(id)).forEach(id => {
          const a = state.entities[id];
          events.push({ text: a.report ?? a.gloss ?? "(action)", type: "victory" });
        });

        // Track quest kill progress
        if (adventurer.questActive && enemy.templateId === templateId && templateId === adventurer.questTargetTemplate) {
          adventurer.questKillsDone = (adventurer.questKillsDone ?? 0) + 1;
        }

        // Quest item drop — only when the player has the quest and hasn't collected it yet
        if (adventurer.questActive && !adventurer.questItemCollected) {
          const activeQuest = QUESTS.find(q => q.id === adventurer.questId);
          if (activeQuest?.questItem) {
            const questItemDef = QUEST_ITEMS[activeQuest.questItem];
            if (questItemDef?.dropFrom === enemy.templateId && rng() < (questItemDef.dropChance ?? 1.0)) {
              adventurer.questItemCollected = true;
              events.push({ text: `${adventurer.name} recovers the ${questItemDef.name}!`, type: "loot" });
            }
          }
        }

        // Drain all urgent reactions: level-up → loot-item → equip-item
        while (true) {
          const urgentBefore = new Set(state.actions);
          await selectAction({ initiatorID: "adventurer", urgentOnly: true });
          const urgentNew = state.actions.filter(id => !urgentBefore.has(id));
          if (urgentNew.length === 0) break;
          urgentNew.forEach(id => {
            const a = state.entities[id];
            const evType = (a.name === "loot-item" || a.name === "equip-item") ? "loot" : "victory";
            events.push({ text: a.report ?? a.gloss ?? "(action)", type: evType });
            if (a.name === "loot-item" && lootItemId) {
              const item = state.entities[lootItemId];
              if (item) {
                adventurer.inventory = [...(adventurer.inventory ?? []), item];
              }
            }
            if (a.name === "equip-item" && lootItemId) {
              const slot = adventurer.pendingEquipSlot;
              const item = state.entities[lootItemId];
              if (slot && item) {
                const displaced = adventurer.equipment[slot];
                if (displaced) {
                  adventurer.inventory = [...(adventurer.inventory ?? []), { ...displaced, slot }];
                }
                adventurer.equipment[slot] = { name: item.name, powerLevel: item.powerLevel };
                adventurer.inventory = (adventurer.inventory ?? []).filter(i => i !== item);
              }
            }
          });
        }

        // Copper drop is a simple JS-level event (not in action graph)
        if (loot.copper > 0) {
          adventurer.copper = (adventurer.copper ?? 0) + loot.copper;
          events.push({ text: `${adventurer.name} picks up ${loot.copper} copper.`, type: "loot" });
        }
      } else {
        const retreatBefore = new Set(state.actions);
        await attemptAction({ actionName: "retreat", initiatorID: "adventurer", precastBindings: combatBindings, suppressConditions: true });
        state.actions.filter(id => !retreatBefore.has(id)).forEach(id => {
          const a = state.entities[id];
          events.push({ text: a.report ?? a.gloss ?? "(action)", type: "retreat" });
        });
      }

    } else if (selectedActionName === "look-around") {
      if (undiscoveredPool.length > 0) {
        // When on a quest, bias toward the quest target if it's still undiscovered.
        // Chests are never the quest target, so they don't interfere with quest bias.
        const questTargetEntry = (adventurer.questActive && !adventurer.questEnemyFound)
          ? undiscoveredPool.find(d => d.id === adventurer.questTargetTemplate)
          : null;
        const chosen = questTargetEntry ?? pickRandom(rng, undiscoveredPool);

        if (rng() < chosen.discoveryRate) {
          if (!adventurer.discoveredNPCs[locationID]) adventurer.discoveredNPCs[locationID] = [];
          adventurer.discoveredNPCs[locationID].push(chosen.id);

          const chosenEntity = state.entities[chosen.id];
          const enemyTemplate = ENEMY_TEMPLATES[chosen.id];

          if (chosenEntity?.isChest) {
            // Chest discovered — fire loot-chest + equip-item (urgent) on this same tick.
            const chest = chosenEntity;
            events.push({ text: `${adventurer.name} discovers a ${chest.name} in ${zoneName}!`, type: "scouting" });

            for (const itemId of chest.lootItems) {
              const item = state.entities[itemId];
              adventurer.pendingLootId = itemId;
              adventurer.shouldEquipLoot = item.powerLevel > (adventurer.equipment[item.slot]?.powerLevel ?? 0);
              adventurer.pendingEquipSlot = item.slot;

              const lootChestBefore = new Set(state.actions);
              await attemptAction({
                actionName: "loot-chest",
                initiatorID: "adventurer",
                precastBindings: { adventurer: ["adventurer"], item: [itemId], chest: [chest.id] },
                suppressConditions: true,
              });
              state.actions.filter(id => !lootChestBefore.has(id)).forEach(id => {
                const a = state.entities[id];
                events.push({ text: a.report ?? a.gloss ?? "(action)", type: "loot" });
              });

              // All chest items go to inventory first; equip-item will move upgrades to equipment.
              adventurer.inventory = [...(adventurer.inventory ?? []), item];

              // Drain urgent: equip-item fires if loot-chest queued it (item is an upgrade).
              while (true) {
                const urgentBefore = new Set(state.actions);
                await selectAction({ initiatorID: "adventurer", urgentOnly: true });
                const urgentNew = state.actions.filter(id => !urgentBefore.has(id));
                if (urgentNew.length === 0) break;
                urgentNew.forEach(id => {
                  const a = state.entities[id];
                  events.push({ text: a.report ?? a.gloss ?? "(action)", type: "loot" });
                  if (a.name === "equip-item") {
                    const slot = item.slot;
                    const displaced = adventurer.equipment[slot];
                    if (displaced) {
                      adventurer.inventory = [...(adventurer.inventory ?? []), { ...displaced, slot }];
                    }
                    adventurer.equipment[slot] = { name: item.name, powerLevel: item.powerLevel };
                    adventurer.inventory = (adventurer.inventory ?? []).filter(i => i !== item);
                  }
                });
              }
            }

            // Chest is fully looted; start cooldown before the next one can spawn.
            state.chestState.activeChestId = null;
            state.chestState.cooldownUntilTick = t + chestConfig.cooldownTicks;

          } else if (enemyTemplate) {
            const factionId = enemyTemplate.faction;
            const newFaction = !(factionId in adventurer.factionRelationships);
            if (newFaction) adventurer.factionRelationships[factionId] = initialFactionRep(factionId);
            const factionNote = newFaction ? ` ${FACTIONS[factionId]?.name ?? factionId} added to known factions.` : "";
            events.push({ text: `${adventurer.name} spots a level ${enemyTemplate.level} ${enemyTemplate.name} in ${zoneName}.${factionNote}`, type: "scouting" });
          } else {
            const vendor = ALL_VENDORS.find(v => v.id === chosen.id);
            if (vendor) {
              events.push({ text: `${adventurer.name} encounters ${vendor.name} in ${zoneName}!`, type: "scouting" });
            } else {
              const questGiver = ALL_QUEST_GIVERS.find(qg => qg.id === chosen.id);
              events.push({ text: `${adventurer.name} meets ${questGiver.name} in ${zoneName}!`, type: "scouting" });
            }
          }
        } else {
          events.push({ text: `${adventurer.name} searches ${zoneName} but finds nothing unusual.`, type: "scouting" });
        }
      }

    } else if (selectedActionName === "complete-quest") {
      newActionIDs.forEach(id => {
        const a = state.entities[id];
        events.push({ text: a.report ?? a.gloss ?? "(action)", type: "quest" });
      });
      const activeGiver = ALL_QUEST_GIVERS.find(qg => qg.id === adventurer.questGiverId) ?? QUEST_GIVER;
      events.push({ text: `${adventurer.name} receives ${adventurer.questXpReward} XP from ${activeGiver.name}!`, type: "quest" });
      adventurer.completedQuests = [...(adventurer.completedQuests ?? []), adventurer.questId];
      adventurer.questItemCollected = false;

      // Fire level-up if queued by complete-quest's reaction
      const levelUpBefore = new Set(state.actions);
      await selectAction({ initiatorID: "adventurer", urgentOnly: true });
      state.actions.filter(id => !levelUpBefore.has(id)).forEach(id => {
        const a = state.entities[id];
        events.push({ text: a.report ?? a.gloss ?? "(action)", type: "victory" });
      });

    } else if (selectedActionName === "sell-items") {
      const toSell = (adventurer.inventory ?? []).filter(item => !item.isQuestItem);
      const sellValue = toSell.reduce((sum, item) => sum + itemSellPrice(item), 0);
      const soldAt = discoveredVendorsHere[0];
      newActionIDs.forEach(id => {
        const a = state.entities[id];
        events.push({ text: a.report ?? a.gloss ?? "(action)", type: "vendor" });
      });
      adventurer.copper = (adventurer.copper ?? 0) + sellValue;
      adventurer.inventory = (adventurer.inventory ?? []).filter(item => item.isQuestItem);
      events.push({
        text: `${adventurer.name} sells ${toSell.length} item(s) to ${soldAt.name} for ${copperToString(sellValue)}.`,
        type: "vendor",
      });

    } else if (selectedActionName === "buy-item") {
      if (buyableCandidates.length > 0) {
        const { item: boughtItem, vendor: boughtFrom } = pickRandom(rng, buyableCandidates);
        const boughtItemId = makeUUID(rng);
        state.entities[boughtItemId] = {
          entityType: EntityType.Item,
          id: boughtItemId,
          name: boughtItem.name,
          powerLevel: boughtItem.powerLevel,
          slot: boughtItem.slot,
          location: locationID,
        };
        state.items.push(boughtItemId);

        adventurer.copper = (adventurer.copper ?? 0) - boughtItem.cost;
        adventurer.inventory = [...(adventurer.inventory ?? []), state.entities[boughtItemId]];
        adventurer.pendingLootId = boughtItemId;
        adventurer.shouldEquipLoot = true;
        adventurer.pendingEquipSlot = boughtItem.slot;

        newActionIDs.forEach(id => {
          const a = state.entities[id];
          events.push({ text: a.report ?? a.gloss ?? "(action)", type: "vendor" });
        });
        events.push({
          text: `${adventurer.name} buys ${boughtItem.name} from ${boughtFrom.name} for ${copperToString(boughtItem.cost)}.`,
          type: "vendor",
        });

        // Fire purchase-item so its reaction urgent-queues equip-item
        const purchaseBefore = new Set(state.actions);
        await attemptAction({
          actionName: "purchase-item",
          initiatorID: "adventurer",
          precastBindings: { adventurer: ["adventurer"], item: [boughtItemId], vendor: [boughtFrom.id] },
          suppressConditions: true,
        });
        state.actions.filter(id => !purchaseBefore.has(id)).forEach(id => {
          const a = state.entities[id];
          events.push({ text: a.report ?? a.gloss ?? "(action)", type: "vendor" });
        });

        // Drain urgent queue: equip-item fires here
        while (true) {
          const urgentBefore = new Set(state.actions);
          await selectAction({ initiatorID: "adventurer", urgentOnly: true });
          const urgentNew = state.actions.filter(id => !urgentBefore.has(id));
          if (urgentNew.length === 0) break;
          urgentNew.forEach(id => {
            const a = state.entities[id];
            events.push({ text: a.report ?? a.gloss ?? "(action)", type: "vendor" });
            if (a.name === "equip-item") {
              const slot = adventurer.pendingEquipSlot;
              const boughtEntity = state.entities[boughtItemId];
              if (slot && boughtEntity) {
                const displaced = adventurer.equipment[slot];
                if (displaced) {
                  adventurer.inventory = [...(adventurer.inventory ?? []), { ...displaced, slot }];
                }
                adventurer.equipment[slot] = { name: boughtEntity.name, powerLevel: boughtEntity.powerLevel };
                adventurer.inventory = (adventurer.inventory ?? []).filter(i => i !== boughtEntity && i.id !== boughtItemId);
              }
            }
          });
        }
      }

    } else if (selectedActionName === "travel-to-quest-zone" || selectedActionName === "return-to-quest-giver") {
      // Viv effect already updated adventurer.location; just surface the event
      newActionIDs.forEach(id => {
        const a = state.entities[id];
        events.push({ text: a.report ?? a.gloss ?? "(action)", type: "quest" });
      });

    } else {
      newActionIDs.forEach(id => {
        const a = state.entities[id];
        events.push({ text: a.report ?? a.gloss ?? "(action)", type: "" });
      });
    }

    state.timestamp += 10;
    ticks.push({ index: t, timestamp: state.timestamp, events, character: structuredClone(state.entities["adventurer"]) });
  }

  return { character: initialChar, ticks };
}

export function summarize(tick) {
  const c = tick.character;
  const loc = ZONES.find(z => z.id === c.location)?.name ?? c.location;
  const questPart = c.questActive ? ` [Quest: ${c.questKillsDone ?? 0}/${c.questKillsNeeded ?? 0}]` : "";
  const copperPart = (c.copper ?? 0) > 0 ? ` [${copperToString(c.copper)}]` : "";
  return `${c.name} (${c.class}, Lv.${c.level ?? 1}, ${c.xp ?? 0} XP) @ ${loc}${questPart}${copperPart}`;
}
