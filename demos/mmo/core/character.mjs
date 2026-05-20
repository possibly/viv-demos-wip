import { LEVEL_XP_MIN, LEVEL_CAP, RACE_CLASS, RACES, ZONES, ALL_QUEST_GIVERS, ALL_VENDORS, WANDERING_TRADER_CONFIGS } from "./data.mjs";
import { pickRandom } from "./utils.mjs";
import { getStarterEquipment } from "./items.mjs";

export function getLevel(xp) {
  for (let i = LEVEL_XP_MIN.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_XP_MIN[i]) return i + 1;
  }
  return 1;
}

export function generateCharacter(EntityType, rng, id, takenNames = new Set()) {
  const raceKey  = pickRandom(rng, Object.keys(RACE_CLASS));
  const classKey = pickRandom(rng, RACE_CLASS[raceKey]);
  const gender   = rng() < 0.5 ? "m" : "f";
  const pool = RACES[raceKey].names[gender].filter(n => !takenNames.has(n));
  const name = pickRandom(rng, pool.length > 0 ? pool : RACES[raceKey].names[gender]);
  return {
    id,
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
    questStepDone: false,
    pendingQuestEligible: false,
    partyId: null,
    partyActive: false,
    partyMembers: [],
    partyLeaderId: null,
    partyQuestId: null,
    knownTraderIds: [],
    boughtFromWanderingTrader: false,
    stunned: false,
    hasActivePlan: false,
    seekingBossParty: false,
    bossPartyFormed: false,
    bossPartyId: null,
    bossPartyMembers: [],
    bossPartyZoneReady: false,
    planTargetZone: null,
    worldBossKillCredited: false,
  };
}

export const PLAYER_IDS = ["adventurer", "adventurer2"];

export function buildInitialState(EntityType) {
  const entities = {};
  const locations = [];
  for (const z of ZONES) {
    entities[z.id] = { entityType: EntityType.Location, id: z.id, name: z.name, desc: z.desc };
    locations.push(z.id);
  }
  const rngForChars = () => Math.random();
  const takenNames = new Set();
  const players = [];
  for (const pid of PLAYER_IDS) {
    const character = generateCharacter(EntityType, rngForChars, pid, takenNames);
    takenNames.add(character.name);
    entities[character.id] = character;
    players.push(character.id);
  }
  for (const qg of ALL_QUEST_GIVERS) {
    entities[qg.id] = {
      entityType: EntityType.Character,
      id: qg.id,
      name: qg.name,
      location: qg.location,
      memories: {},
    };
  }
  for (const vendor of ALL_VENDORS) {
    entities[vendor.id] = {
      entityType: EntityType.Character,
      id: vendor.id,
      name: vendor.name,
      location: vendor.location,
      memories: {},
    };
  }
  for (const config of WANDERING_TRADER_CONFIGS) {
    entities[config.id] = {
      entityType: EntityType.Character,
      id: config.id,
      name: config.name,
      location: null,
      memories: {},
      active: false,
    };
  }
  entities["world"] = { entityType: EntityType.Character, id: "world", name: "The World", memories: {} };
  return {
    timestamp: 0, entities,
    players,
    characters: [...players, ...ALL_QUEST_GIVERS.map(qg => qg.id), ...ALL_VENDORS.map(v => v.id), ...WANDERING_TRADER_CONFIGS.map(c => c.id), "world"],
    locations,
    items: [], actions: [],
    vivInternalState: null,
    zoneEnemyStacks: {},
    chestState: { activeChestId: null, cooldownUntilTick: 0 },
  };
}
