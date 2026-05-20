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

// Armor material restrictions per class. Weapons and jewelry (material: null) are unrestricted.
export const CLASS_ARMOR_TYPES = {
  warrior:  ["leather", "mail"],
  paladin:  ["leather", "mail"],
  hunter:   ["leather", "mail"],
  rogue:    ["leather"],
  priest:   ["cloth"],
  mage:     ["cloth"],
  warlock:  ["cloth"],
  druid:    ["cloth", "leather"],
  shaman:   ["leather", "mail"],
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

// levelMin/levelMax: recommended character level bracket for this zone.
// powerMin/powerMax: item power range for loot that drops in (or is sold in) this zone.
export const ZONES = [
  { id: "hearthfield",  name: "Hearthfield",       desc: "A peaceful hillside settlement where new arrivals catch their first breath.",  levelMin: 1, levelMax: 2, powerMin: 1, powerMax: 2 },
  { id: "millhaven",    name: "Millhaven",          desc: "A busy crossroads hamlet; the Wayward Lantern inn draws travelers from across the realm.", levelMin: 1, levelMax: 2, powerMin: 1, powerMax: 2 },
  { id: "briar_edge",   name: "The Briar's Edge",   desc: "The treeline thickens here; wolves and bandits lurk in the tangled undergrowth.",  levelMin: 1, levelMax: 3, powerMin: 1, powerMax: 2 },
  { id: "stillwater",   name: "Stillwater Mere",    desc: "A glittering lake that mirrors the sky. Scouts watch from the reed banks.",         levelMin: 2, levelMax: 5, powerMin: 2, powerMax: 3 },
  { id: "stonewick",    name: "Stonewick Farm",      desc: "Rolling fields and weathered farmhouses, goats grazing in the amber light.",        levelMin: 3, levelMax: 5, powerMin: 3, powerMax: 4 },
];

export const ZONE_MAP = new Map(ZONES.map(z => [z.id, z]));

export const LEVEL_XP_MIN = [0, 300, 900, 2700, 6500, 14000];
export const LEVEL_CAP = 6;

export const ENEMY_FACTION = { id: "grimspawn", name: "The Grimspawn", type: "enemy" };

// Zone factions sit between players and the rest of the world. Players start neutral (50)
// the moment they discover one, and earn rep by completing quests for that faction's NPCs.
// Rep-per-quest is computed dynamically from the total number of quests in the zone (see
// factionRepPerQuest in core/quests.mjs).
export const ZONE_FACTION = {
  id: "greenvale_alliance",
  name: "Greenvale Alliance",
  type: "zone",
  zones: ["hearthfield", "millhaven", "briar_edge", "stonewick", "stillwater"],
};

export const FACTIONS = {
  [ENEMY_FACTION.id]: ENEMY_FACTION,
  [ZONE_FACTION.id]: ZONE_FACTION,
};

export const QUEST_GIVER = {
  id: "questGiver",
  name: "Elder Mira",
  location: "millhaven",
  factionId: ZONE_FACTION.id,
  discoveryRate: 1.0,
};

export const RANGER_VOSS = {
  id: "rangerVoss",
  name: "Ranger Voss",
  location: "stonewick",
  factionId: ZONE_FACTION.id,
  discoveryRate: 1.0,
};

export const HERBALIST_KASPAR = {
  id: "herbalistKaspar",
  name: "Herbalist Kaspar",
  location: "hearthfield",
  factionId: ZONE_FACTION.id,
  discoveryRate: 1.0,
};

export const ALL_QUEST_GIVERS = [QUEST_GIVER, RANGER_VOSS, HERBALIST_KASPAR];

export const VENDOR_ARNAULT = {
  id: "vendorArnault",
  name: "Arnault the Trader",
  location: "hearthfield",
  discoveryRate: 1.0,
  items: [
    { name: "Leather Gloves",  powerLevel: 1, slot: "hands", material: "leather", cost: 15 },
    { name: "Leather Bracers", powerLevel: 1, slot: "wrist", material: "leather", cost: 15 },
    { name: "Leather Belt",    powerLevel: 1, slot: "waist", material: "leather", cost: 15 },
    { name: "Cloth Gloves",    powerLevel: 1, slot: "hands", material: "cloth",   cost: 15 },
    { name: "Cloth Bracers",   powerLevel: 1, slot: "wrist", material: "cloth",   cost: 15 },
    { name: "Cloth Sash",      powerLevel: 1, slot: "waist", material: "cloth",   cost: 15 },
    { name: "Iron Gauntlets",  powerLevel: 1, slot: "hands", material: "mail",    cost: 15 },
    { name: "Iron Vambraces",  powerLevel: 1, slot: "wrist", material: "mail",    cost: 15 },
    { name: "Iron Girdle",     powerLevel: 1, slot: "waist", material: "mail",    cost: 15 },
  ],
};

// Faction quartermaster — sells power-4 gear gated by reputation tier.
export const QUARTERMASTER_RHYS = {
  id: "quartermasterRhys",
  name: "Quartermaster Rhys",
  location: "millhaven",
  factionId: ZONE_FACTION.id,
  discoveryRate: 1.0,
  items: [
    { name: "Sentinel's Iron Helm",      powerLevel: 4, slot: "head",      material: "mail",    cost: 100, requiredRep: 70 },
    { name: "Sentinel's Iron Pauldrons", powerLevel: 4, slot: "shoulders", material: "mail",    cost: 150, requiredRep: 80 },
    { name: "Sentinel's Iron Greaves",   powerLevel: 4, slot: "legs",      material: "mail",    cost: 200, requiredRep: 90 },
    { name: "Sentinel's Leather Helm",   powerLevel: 4, slot: "head",      material: "leather", cost: 100, requiredRep: 70 },
    { name: "Sentinel's Leather Spaulders", powerLevel: 4, slot: "shoulders", material: "leather", cost: 150, requiredRep: 80 },
    { name: "Sentinel's Leather Leggings",  powerLevel: 4, slot: "legs",   material: "leather", cost: 200, requiredRep: 90 },
    { name: "Adept's Embroidered Mantle",   powerLevel: 4, slot: "shoulders", material: "cloth", cost: 150, requiredRep: 80 },
    { name: "Adept's Spun Leggings",     powerLevel: 4, slot: "legs",      material: "cloth",   cost: 200, requiredRep: 90 },
  ],
};

export const ALL_VENDORS = [VENDOR_ARNAULT, QUARTERMASTER_RHYS];

// Pre-indexed by zone for O(1) lookup in the tick loop
export const QUEST_GIVERS_BY_ZONE = {};
for (const qg of ALL_QUEST_GIVERS) (QUEST_GIVERS_BY_ZONE[qg.location] ??= []).push(qg);
export const VENDORS_BY_ZONE = {};
for (const v of ALL_VENDORS) (VENDORS_BY_ZONE[v.location] ??= []).push(v);

export const QUEST_ITEMS = {
  captains_insignia: {
    id: "captains_insignia",
    name: "Captain's Insignia",
    dropFrom: "grimspawn_captain",
    dropChance: 1.0,
  },
  rare_mushroom: {
    id: "rare_mushroom",
    name: "Spore-Crested Mushroom",
    dropFrom: "grimspawn_warrior",
    dropChance: 0.25,
  },
};

// Every quest given by a Zone Faction NPC awards 10c on completion (in addition to XP).
const ZONE_QUEST_COPPER_REWARD = 10;

export const QUESTS = [
  {
    id: "grimspawn_scout_patrol",
    name: "Scout Patrol",
    level: 1,
    questGiverId: "questGiver",
    targetTemplate: "grimspawn_scout",
    targetZone: "briar_edge",
    targetCount: 3,
    copperReward: ZONE_QUEST_COPPER_REWARD,
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
    copperReward: ZONE_QUEST_COPPER_REWARD,
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
    copperReward: ZONE_QUEST_COPPER_REWARD,
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
    copperReward: ZONE_QUEST_COPPER_REWARD,
    description: "Slay a Grimspawn Captain at Stillwater Mere and recover the Captain's Insignia.",
  },
  {
    id: "spore_crested_mushroom",
    name: "The Spore-Crested Mushroom",
    level: 4,
    questGiverId: "herbalistKaspar",
    prerequisiteQuests: ["captains_seal"],
    targetTemplate: "grimspawn_warrior",
    targetZone: "briar_edge",
    targetCount: 0,
    questItem: "rare_mushroom",
    copperReward: ZONE_QUEST_COPPER_REWARD,
    description: "Recover a Spore-Crested Mushroom from a Grimspawn Warrior in The Briar's Edge (25% drop).",
  },
  {
    id: "stonewick_planting",
    name: "Seeds of Ruin",
    level: 5,
    questGiverId: "herbalistKaspar",
    prerequisiteQuests: ["spore_crested_mushroom"],
    prerequisiteFlags: ["boughtFromWanderingTrader"],
    // Multi-step: arriving at the target zone plants the mushroom and spawns the farmer.
    arrivalSpawn: {
      zone: "stonewick",
      spawnTemplate: "grimspawn_farmer",
    },
    targetTemplate: "grimspawn_farmer",
    targetZone: "stonewick",
    targetCount: 1,
    copperReward: ZONE_QUEST_COPPER_REWARD,
    rewardItem: { name: "Farmer's Reinforced Tunic", powerLevel: 4, slot: "chest", material: "leather" },
    description: "Plant the Spore-Crested Mushroom at Stonewick Farm and slay the Grimspawn Farmer that springs forth.",
  },
];

export const ENEMY_TEMPLATES = {
  grimspawn_scout:      { id: "grimspawn_scout",      name: "Grimspawn Scout",      faction: ENEMY_FACTION.id, type: "humanoid", level: 1, powerLevel: 1, xpReward: 50,   discoveryRate: 1.0 },
  grimspawn_warrior:    { id: "grimspawn_warrior",    name: "Grimspawn Warrior",    faction: ENEMY_FACTION.id, type: "humanoid", level: 2, powerLevel: 1, xpReward: 100,  discoveryRate: 1.0 },
  grimspawn_enforcer:   { id: "grimspawn_enforcer",   name: "Grimspawn Enforcer",   faction: ENEMY_FACTION.id, type: "humanoid", level: 3, powerLevel: 1, xpReward: 200,  discoveryRate: 1.0 },
  grimspawn_captain:    { id: "grimspawn_captain",    name: "Grimspawn Captain",    faction: ENEMY_FACTION.id, type: "humanoid", level: 4, powerLevel: 2, xpReward: 350,  discoveryRate: 1.0 },
  grimspawn_warlord:    { id: "grimspawn_warlord",    name: "Grimspawn Warlord",    faction: ENEMY_FACTION.id, type: "humanoid", level: 5, powerLevel: 2, xpReward: 500,  discoveryRate: 1.0 },
  // Non-discoverable: only appears as a result of the Seeds of Ruin quest's planting step.
  grimspawn_farmer:     { id: "grimspawn_farmer",     name: "Grimspawn Farmer",     faction: ENEMY_FACTION.id, type: "humanoid", level: 5, powerLevel: 2, xpReward: 600,  discoveryRate: 1.0, discoverable: false },
  // World boss: roams hostile zones, Lv 7 (max zone enemy Lv 5 + 2), spawned as a full entity.
  grimspawn_chieftain:  { id: "grimspawn_chieftain",  name: "Grimspawn Chieftain",  faction: ENEMY_FACTION.id, type: "humanoid", level: 7, powerLevel: 4, xpReward: 3000, discoveryRate: 0.8, discoverable: false },
};

export const ZONE_ENEMIES = {
  briar_edge: ["grimspawn_scout", "grimspawn_warrior"],
  stonewick:  ["grimspawn_scout", "grimspawn_farmer"],
  stillwater: ["grimspawn_warrior", "grimspawn_enforcer", "grimspawn_captain", "grimspawn_warlord"],
};

// Some enemy archetypes are associated with a zone but not surface-able via look-around;
// they appear only through other gameplay (e.g. quest-triggered planting).
export const ZONE_DISCOVERABLES = Object.fromEntries(
  ZONES.map(z => [
    z.id,
    [
      ...(ZONE_ENEMIES[z.id] ?? [])
        .filter(id => ENEMY_TEMPLATES[id]?.discoverable !== false)
        .map(id => ({ id, discoveryRate: ENEMY_TEMPLATES[id].discoveryRate })),
      ...ALL_QUEST_GIVERS.filter(qg => qg.location === z.id).map(qg => ({ id: qg.id, discoveryRate: qg.discoveryRate })),
      ...ALL_VENDORS.filter(v => v.location === z.id).map(v => ({ id: v.id, discoveryRate: v.discoveryRate })),
    ],
  ])
);

export const HOSTILE_ZONES = ["briar_edge", "stonewick", "stillwater"];

export const CHEST_CONFIGS = [
  {
    name: "Worn Wooden Chest",
    minItems: 1, maxItems: 2,
    discoveryRate: 0.75,
    spawnChance: 0.25,
    cooldownTicks: 100,
    spawnZones: HOSTILE_ZONES,
  },
];

// Loot pool definitions for enemy drops and chests, keyed by zone id.
// Each pool is a query object understood by queryItems() in items.mjs.
export const ZONE_LOOT_POOLS = {
  briar_edge: { powerLevel: [1, 2] },
  stillwater: { powerLevel: [2, 3] },
  stonewick:  { powerLevel: [3, 4] },
};

// Named pools: shorthand aliases that expand to specific item ids.
export const NAMED_POOLS = {
  sentinel_mail:    ["mail_head_4", "mail_shoulders_4", "mail_chest_4", "mail_legs_4", "mail_feet_4"],
  sentinel_leather: ["leather_head_4", "leather_shoulders_4", "leather_chest_4", "leather_legs_4", "leather_feet_4"],
  adept_cloth:      ["cloth_head_4", "cloth_shoulders_4", "cloth_chest_4", "cloth_legs_4", "cloth_feet_4"],
};

// Global item database. Every lootable, chestable, or quest-rewardable piece of gear lives here.
// material: "cloth" | "leather" | "mail" | null  (null = weapons / jewelry, no class restriction)
export const ITEM_DB = [
  // ── CLOTH power 1 ──
  { id: "cloth_head_1",      name: "Frayed Linen Hood",           slot: "head",      material: "cloth",   powerLevel: 1 },
  { id: "cloth_shoulders_1", name: "Tattered Cloth Mantle",       slot: "shoulders", material: "cloth",   powerLevel: 1 },
  { id: "cloth_chest_1",     name: "Tattered Cloth Robe",         slot: "chest",     material: "cloth",   powerLevel: 1 },
  { id: "cloth_wrist_1",     name: "Frayed Linen Bracers",        slot: "wrist",     material: "cloth",   powerLevel: 1 },
  { id: "cloth_hands_1",     name: "Frayed Cloth Gloves",         slot: "hands",     material: "cloth",   powerLevel: 1 },
  { id: "cloth_waist_1",     name: "Worn Cloth Sash",             slot: "waist",     material: "cloth",   powerLevel: 1 },
  { id: "cloth_legs_1",      name: "Worn Linen Leggings",         slot: "legs",      material: "cloth",   powerLevel: 1 },
  { id: "cloth_feet_1",      name: "Tattered Cloth Slippers",     slot: "feet",      material: "cloth",   powerLevel: 1 },
  // ── CLOTH power 2 ──
  { id: "cloth_head_2",      name: "Spun Linen Hood",             slot: "head",      material: "cloth",   powerLevel: 2 },
  { id: "cloth_shoulders_2", name: "Scholar's Cloth Mantle",      slot: "shoulders", material: "cloth",   powerLevel: 2 },
  { id: "cloth_chest_2",     name: "Scholar's Cloth Robe",        slot: "chest",     material: "cloth",   powerLevel: 2 },
  { id: "cloth_wrist_2",     name: "Apprentice's Bracers",        slot: "wrist",     material: "cloth",   powerLevel: 2 },
  { id: "cloth_hands_2",     name: "Linen Weave Gloves",          slot: "hands",     material: "cloth",   powerLevel: 2 },
  { id: "cloth_waist_2",     name: "Linen Weave Sash",            slot: "waist",     material: "cloth",   powerLevel: 2 },
  { id: "cloth_legs_2",      name: "Apprentice's Leggings",       slot: "legs",      material: "cloth",   powerLevel: 2 },
  { id: "cloth_feet_2",      name: "Woven Cloth Shoes",           slot: "feet",      material: "cloth",   powerLevel: 2 },
  // ── CLOTH power 3 ──
  { id: "cloth_head_3",      name: "Sorcerer's Woven Hood",       slot: "head",      material: "cloth",   powerLevel: 3 },
  { id: "cloth_shoulders_3", name: "Sorcerer's Mantle",           slot: "shoulders", material: "cloth",   powerLevel: 3 },
  { id: "cloth_chest_3",     name: "Journeyman's Cloth Robe",     slot: "chest",     material: "cloth",   powerLevel: 3 },
  { id: "cloth_wrist_3",     name: "Sorcerer's Bracers",          slot: "wrist",     material: "cloth",   powerLevel: 3 },
  { id: "cloth_hands_3",     name: "Invoker's Cloth Gloves",      slot: "hands",     material: "cloth",   powerLevel: 3 },
  { id: "cloth_waist_3",     name: "Invoker's Cloth Sash",        slot: "waist",     material: "cloth",   powerLevel: 3 },
  { id: "cloth_legs_3",      name: "Sorcerer's Leggings",         slot: "legs",      material: "cloth",   powerLevel: 3 },
  { id: "cloth_feet_3",      name: "Mystic's Cloth Slippers",     slot: "feet",      material: "cloth",   powerLevel: 3 },
  // ── CLOTH power 4 ──
  { id: "cloth_head_4",      name: "Adept's Woven Hood",          slot: "head",      material: "cloth",   powerLevel: 4 },
  { id: "cloth_shoulders_4", name: "Adept's Embroidered Mantle",  slot: "shoulders", material: "cloth",   powerLevel: 4 },
  { id: "cloth_chest_4",     name: "Adept's Embroidered Robe",    slot: "chest",     material: "cloth",   powerLevel: 4 },
  { id: "cloth_wrist_4",     name: "Adept's Linen Bracers",       slot: "wrist",     material: "cloth",   powerLevel: 4 },
  { id: "cloth_hands_4",     name: "Adept's Weave Gloves",        slot: "hands",     material: "cloth",   powerLevel: 4 },
  { id: "cloth_waist_4",     name: "Adept's Cloth Girdle",        slot: "waist",     material: "cloth",   powerLevel: 4 },
  { id: "cloth_legs_4",      name: "Adept's Spun Leggings",       slot: "legs",      material: "cloth",   powerLevel: 4 },
  { id: "cloth_feet_4",      name: "Adept's Cloth Slippers",      slot: "feet",      material: "cloth",   powerLevel: 4 },

  // ── LEATHER power 1 ──
  { id: "leather_head_1",      name: "Worn Leather Cap",              slot: "head",      material: "leather", powerLevel: 1 },
  { id: "leather_shoulders_1", name: "Tattered Leather Spaulders",    slot: "shoulders", material: "leather", powerLevel: 1 },
  { id: "leather_chest_1",     name: "Battered Leather Vest",         slot: "chest",     material: "leather", powerLevel: 1 },
  { id: "leather_wrist_1",     name: "Worn Leather Bracers",          slot: "wrist",     material: "leather", powerLevel: 1 },
  { id: "leather_hands_1",     name: "Worn Leather Gloves",           slot: "hands",     material: "leather", powerLevel: 1 },
  { id: "leather_waist_1",     name: "Cracked Leather Belt",          slot: "waist",     material: "leather", powerLevel: 1 },
  { id: "leather_legs_1",      name: "Worn Leather Pants",            slot: "legs",      material: "leather", powerLevel: 1 },
  { id: "leather_feet_1",      name: "Scuffed Leather Boots",         slot: "feet",      material: "leather", powerLevel: 1 },
  // ── LEATHER power 2 ──
  { id: "leather_head_2",      name: "Cured Leather Cap",             slot: "head",      material: "leather", powerLevel: 2 },
  { id: "leather_shoulders_2", name: "Scout's Leather Spaulders",     slot: "shoulders", material: "leather", powerLevel: 2 },
  { id: "leather_chest_2",     name: "Supple Leather Vest",           slot: "chest",     material: "leather", powerLevel: 2 },
  { id: "leather_wrist_2",     name: "Cured Leather Bracers",         slot: "wrist",     material: "leather", powerLevel: 2 },
  { id: "leather_hands_2",     name: "Tanned Leather Gloves",         slot: "hands",     material: "leather", powerLevel: 2 },
  { id: "leather_waist_2",     name: "Cured Leather Belt",            slot: "waist",     material: "leather", powerLevel: 2 },
  { id: "leather_legs_2",      name: "Cured Leather Pants",           slot: "legs",      material: "leather", powerLevel: 2 },
  { id: "leather_feet_2",      name: "Trail Leather Boots",           slot: "feet",      material: "leather", powerLevel: 2 },
  // ── LEATHER power 3 ──
  { id: "leather_head_3",      name: "Tracker's Leather Cap",         slot: "head",      material: "leather", powerLevel: 3 },
  { id: "leather_shoulders_3", name: "Tracker's Spaulders",           slot: "shoulders", material: "leather", powerLevel: 3 },
  { id: "leather_chest_3",     name: "Ranger's Leather Vest",         slot: "chest",     material: "leather", powerLevel: 3 },
  { id: "leather_wrist_3",     name: "Scout's Leather Bracers",       slot: "wrist",     material: "leather", powerLevel: 3 },
  { id: "leather_hands_3",     name: "Tracker's Leather Grips",       slot: "hands",     material: "leather", powerLevel: 3 },
  { id: "leather_waist_3",     name: "Ranger's Leather Belt",         slot: "waist",     material: "leather", powerLevel: 3 },
  { id: "leather_legs_3",      name: "Scout's Leather Pants",         slot: "legs",      material: "leather", powerLevel: 3 },
  { id: "leather_feet_3",      name: "Ranger's Leather Boots",        slot: "feet",      material: "leather", powerLevel: 3 },
  // ── LEATHER power 4 ──
  { id: "leather_head_4",      name: "Sentinel's Leather Helm",       slot: "head",      material: "leather", powerLevel: 4 },
  { id: "leather_shoulders_4", name: "Sentinel's Leather Spaulders",  slot: "shoulders", material: "leather", powerLevel: 4 },
  { id: "leather_chest_4",     name: "Sentinel's Leather Vest",       slot: "chest",     material: "leather", powerLevel: 4 },
  { id: "leather_wrist_4",     name: "Sentinel's Leather Bracers",    slot: "wrist",     material: "leather", powerLevel: 4 },
  { id: "leather_hands_4",     name: "Sentinel's Leather Grips",      slot: "hands",     material: "leather", powerLevel: 4 },
  { id: "leather_waist_4",     name: "Sentinel's Leather Belt",       slot: "waist",     material: "leather", powerLevel: 4 },
  { id: "leather_legs_4",      name: "Sentinel's Leather Leggings",   slot: "legs",      material: "leather", powerLevel: 4 },
  { id: "leather_feet_4",      name: "Sentinel's Leather Boots",      slot: "feet",      material: "leather", powerLevel: 4 },

  // ── MAIL power 1 ──
  { id: "mail_head_1",      name: "Battered Iron Coif",           slot: "head",      material: "mail",    powerLevel: 1 },
  { id: "mail_shoulders_1", name: "Battered Iron Pauldrons",      slot: "shoulders", material: "mail",    powerLevel: 1 },
  { id: "mail_chest_1",     name: "Rusty Iron Hauberk",           slot: "chest",     material: "mail",    powerLevel: 1 },
  { id: "mail_wrist_1",     name: "Rusty Iron Vambraces",         slot: "wrist",     material: "mail",    powerLevel: 1 },
  { id: "mail_hands_1",     name: "Pitted Iron Gauntlets",        slot: "hands",     material: "mail",    powerLevel: 1 },
  { id: "mail_waist_1",     name: "Dented Iron Girdle",           slot: "waist",     material: "mail",    powerLevel: 1 },
  { id: "mail_legs_1",      name: "Dented Iron Chausses",         slot: "legs",      material: "mail",    powerLevel: 1 },
  { id: "mail_feet_1",      name: "Scuffed Iron Sabatons",        slot: "feet",      material: "mail",    powerLevel: 1 },
  // ── MAIL power 2 ──
  { id: "mail_head_2",      name: "Hammered Iron Coif",           slot: "head",      material: "mail",    powerLevel: 2 },
  { id: "mail_shoulders_2", name: "Iron Scale Pauldrons",         slot: "shoulders", material: "mail",    powerLevel: 2 },
  { id: "mail_chest_2",     name: "Chainmail Hauberk",            slot: "chest",     material: "mail",    powerLevel: 2 },
  { id: "mail_wrist_2",     name: "Linked Iron Vambraces",        slot: "wrist",     material: "mail",    powerLevel: 2 },
  { id: "mail_hands_2",     name: "Iron Scale Gauntlets",         slot: "hands",     material: "mail",    powerLevel: 2 },
  { id: "mail_waist_2",     name: "Riveted Iron Girdle",          slot: "waist",     material: "mail",    powerLevel: 2 },
  { id: "mail_legs_2",      name: "Linked Iron Chausses",         slot: "legs",      material: "mail",    powerLevel: 2 },
  { id: "mail_feet_2",      name: "Studded Iron Sabatons",        slot: "feet",      material: "mail",    powerLevel: 2 },
  // ── MAIL power 3 ──
  { id: "mail_head_3",      name: "Rough-spun Chain Coif",        slot: "head",      material: "mail",    powerLevel: 3 },
  { id: "mail_shoulders_3", name: "Scuffed Iron Pauldrons",       slot: "shoulders", material: "mail",    powerLevel: 3 },
  { id: "mail_chest_3",     name: "Forged Ringmail Hauberk",      slot: "chest",     material: "mail",    powerLevel: 3 },
  { id: "mail_wrist_3",     name: "Linked Steel Vambraces",       slot: "wrist",     material: "mail",    powerLevel: 3 },
  { id: "mail_hands_3",     name: "Forged Steel Gauntlets",       slot: "hands",     material: "mail",    powerLevel: 3 },
  { id: "mail_waist_3",     name: "Riveted Steel Girdle",         slot: "waist",     material: "mail",    powerLevel: 3 },
  { id: "mail_legs_3",      name: "Linked Steel Chausses",        slot: "legs",      material: "mail",    powerLevel: 3 },
  { id: "mail_feet_3",      name: "Forged Steel Sabatons",        slot: "feet",      material: "mail",    powerLevel: 3 },
  // ── MAIL power 4 ──
  { id: "mail_head_4",      name: "Sentinel's Iron Helm",         slot: "head",      material: "mail",    powerLevel: 4 },
  { id: "mail_shoulders_4", name: "Sentinel's Iron Pauldrons",    slot: "shoulders", material: "mail",    powerLevel: 4 },
  { id: "mail_chest_4",     name: "Sentinel's Ringmail Hauberk",  slot: "chest",     material: "mail",    powerLevel: 4 },
  { id: "mail_wrist_4",     name: "Sentinel's Iron Vambraces",    slot: "wrist",     material: "mail",    powerLevel: 4 },
  { id: "mail_hands_4",     name: "Sentinel's Iron Gauntlets",    slot: "hands",     material: "mail",    powerLevel: 4 },
  { id: "mail_waist_4",     name: "Sentinel's Iron Girdle",       slot: "waist",     material: "mail",    powerLevel: 4 },
  { id: "mail_legs_4",      name: "Sentinel's Iron Greaves",      slot: "legs",      material: "mail",    powerLevel: 4 },
  { id: "mail_feet_4",      name: "Sentinel's Iron Sabatons",     slot: "feet",      material: "mail",    powerLevel: 4 },

  // ── Weapons (material: null — no class restriction) ──
  { id: "weapon_sword_1",   name: "Chipped Shortsword",           slot: "mainhand",  material: null,      powerLevel: 1 },
  { id: "weapon_dagger_1",  name: "Rusty Dagger",                 slot: "mainhand",  material: null,      powerLevel: 1 },
  { id: "weapon_mace_1",    name: "Crude Wooden Club",            slot: "mainhand",  material: null,      powerLevel: 1 },
  { id: "weapon_staff_1",   name: "Gnarled Branch",               slot: "mainhand",  material: null,      powerLevel: 1 },
  { id: "weapon_wand_1",    name: "Whittled Wand",                slot: "mainhand",  material: null,      powerLevel: 1 },
  { id: "weapon_shield_1",  name: "Battered Wooden Shield",       slot: "offhand",   material: null,      powerLevel: 1 },
  { id: "weapon_sword_2",   name: "Worn Iron Sword",              slot: "mainhand",  material: null,      powerLevel: 2 },
  { id: "weapon_axe_2",     name: "Iron Hatchet",                 slot: "mainhand",  material: null,      powerLevel: 2 },
  { id: "weapon_mace_2",    name: "Iron-capped Mace",             slot: "mainhand",  material: null,      powerLevel: 2 },
  { id: "weapon_dagger_2",  name: "Honed Dagger",                 slot: "mainhand",  material: null,      powerLevel: 2 },
  { id: "weapon_shield_2",  name: "Dented Iron Shield",           slot: "offhand",   material: null,      powerLevel: 2 },
  { id: "weapon_sword_3",   name: "Notched Broadsword",           slot: "mainhand",  material: null,      powerLevel: 3 },
  { id: "weapon_axe_3",     name: "Crude Iron Axe",               slot: "mainhand",  material: null,      powerLevel: 3 },
  { id: "weapon_mace_3",    name: "Bludgeoning Mace",             slot: "mainhand",  material: null,      powerLevel: 3 },
  { id: "weapon_staff_3",   name: "Gnarled Ironwood Staff",       slot: "mainhand",  material: null,      powerLevel: 3 },
  { id: "weapon_shield_3",  name: "Reinforced Iron Shield",       slot: "offhand",   material: null,      powerLevel: 3 },
  { id: "weapon_sword_4",   name: "Well-Forged Longsword",        slot: "mainhand",  material: null,      powerLevel: 4 },
  { id: "weapon_axe_4",     name: "Broad Iron Axe",               slot: "mainhand",  material: null,      powerLevel: 4 },
  { id: "weapon_staff_4",   name: "Carved Hardwood Staff",        slot: "mainhand",  material: null,      powerLevel: 4 },
  { id: "weapon_shield_4",  name: "Tempered Iron Shield",         slot: "offhand",   material: null,      powerLevel: 4 },

  // ── Accessories (material: null — no class restriction) ──
  { id: "acc_ring_1",       name: "Tarnished Copper Band",        slot: "ring1",     material: null,      powerLevel: 1 },
  { id: "acc_ring_2",       name: "Copper Road Ring",             slot: "ring1",     material: null,      powerLevel: 2 },
  { id: "acc_neck_2",       name: "Leather-cord Pendant",         slot: "neck",      material: null,      powerLevel: 2 },
  { id: "acc_ring_3",       name: "Polished Silver Ring",         slot: "ring1",     material: null,      powerLevel: 3 },
  { id: "acc_neck_3",       name: "Etched Bronze Talisman",       slot: "neck",      material: null,      powerLevel: 3 },
  { id: "acc_ring_4",       name: "Engraved Iron Signet",         slot: "ring1",     material: null,      powerLevel: 4 },

  // ── World Boss drops (Grimspawn Chieftain only — bossOnly flag excludes them from zone loot pools) ──
  { id: "chieftain_ruinblade",    name: "Chieftain's Ruinblade",   slot: "mainhand", material: null,      powerLevel: 4, bossOnly: true },
  { id: "chieftain_helm_cloth",   name: "Chieftain's Ironveil",    slot: "head",     material: "cloth",   powerLevel: 4, bossOnly: true },
  { id: "chieftain_helm_leather", name: "Chieftain's Scalpcrown",  slot: "head",     material: "leather", powerLevel: 4, bossOnly: true },
  { id: "chieftain_helm_mail",    name: "Chieftain's Warbrow",     slot: "head",     material: "mail",    powerLevel: 4, bossOnly: true },
];

const _FRIENDLY_ZONE_IDS = ZONES.filter(z => !HOSTILE_ZONES.includes(z.id)).map(z => z.id);

export const WANDERING_TRADER_ITEM_POOL = [
  // power 3 — mail armor
  { name: "Trail-Hardened Chain Coif",  powerLevel: 3, slot: "head",      material: "mail",    cost: 80 },
  { name: "Drifter's Iron Pauldrons",   powerLevel: 3, slot: "shoulders", material: "mail",    cost: 80 },
  { name: "Traveler's Ringmail Vest",   powerLevel: 3, slot: "chest",     material: "mail",    cost: 80 },
  { name: "Road-Worn Iron Greaves",     powerLevel: 3, slot: "legs",      material: "mail",    cost: 80 },
  { name: "Caravan Guard's Sabatons",   powerLevel: 3, slot: "feet",      material: "mail",    cost: 80 },
  // power 3 — leather armor
  { name: "Wanderer's Leather Hood",    powerLevel: 3, slot: "head",      material: "leather", cost: 80 },
  { name: "Drifter's Leather Spaulders",powerLevel: 3, slot: "shoulders", material: "leather", cost: 80 },
  { name: "Road-Worn Leather Vest",     powerLevel: 3, slot: "chest",     material: "leather", cost: 80 },
  // power 3 — cloth armor
  { name: "Wanderer's Cloth Hood",      powerLevel: 3, slot: "head",      material: "cloth",   cost: 80 },
  { name: "Traveler's Embroidered Robe",powerLevel: 3, slot: "chest",     material: "cloth",   cost: 80 },
  // power 2 — leather accessories
  { name: "Trader's Leather Bracers",   powerLevel: 2, slot: "wrist",     material: "leather", cost: 50 },
  { name: "Dusty Leather Gloves",       powerLevel: 2, slot: "hands",     material: "leather", cost: 50 },
  { name: "Patched Leather Belt",       powerLevel: 2, slot: "waist",     material: "leather", cost: 50 },
  // power 2 — jewelry (no material restriction)
  { name: "Copper Road Ring",           powerLevel: 2, slot: "ring1",     material: null,      cost: 50 },
  { name: "Leather-cord Pendant",       powerLevel: 2, slot: "neck",      material: null,      cost: 50 },
];

export const WANDERING_TRADER_CONFIGS = [
  {
    id: "wanderingTrader",
    name: "Theron the Wandering Trader",
    discoveryRate: 0.80,
    spawnChance: 0.02,
    minLifespan: 20,
    maxLifespan: 40,
    cooldownTicks: 10,
    minCampTicks: 5,
    itemPool: WANDERING_TRADER_ITEM_POOL,
    itemSellCount: 3,
    friendlyZoneOptions: _FRIENDLY_ZONE_IDS,
    hostileZoneOptions: [...HOSTILE_ZONES],
  },
];

export const CHIEFTAIN_DROPS = ["chieftain_ruinblade", "chieftain_helm_cloth", "chieftain_helm_leather", "chieftain_helm_mail"];

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
