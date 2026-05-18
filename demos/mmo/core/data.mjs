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
  { id: "stonewick",    name: "Stonewick Farm",      desc: "Rolling fields and weathered farmhouses, goats grazing in the amber light." },
  { id: "stillwater",   name: "Stillwater Mere",    desc: "A glittering lake that mirrors the sky. Scouts watch from the reed banks." },
];

export const ZONE_MAP = new Map(ZONES.map(z => [z.id, z]));

export const LEVEL_XP_MIN = [0, 300, 900, 2700, 6500, 14000];
export const LEVEL_CAP = 6;

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

export const HOSTILE_ZONES = ["briar_edge", "stonewick", "stillwater"];

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
