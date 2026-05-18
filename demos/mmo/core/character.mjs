import { LEVEL_XP_MIN, LEVEL_CAP, RACE_CLASS, RACES, ZONES, QUEST_GIVER, RANGER_VOSS, ALL_VENDORS } from "./data.mjs";
import { pickRandom } from "./utils.mjs";
import { getStarterEquipment } from "./items.mjs";

export function getLevel(xp) {
  for (let i = LEVEL_XP_MIN.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_XP_MIN[i]) return i + 1;
  }
  return 1;
}

export function generateCharacter(EntityType, rng) {
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

export function buildInitialState(EntityType) {
  const entities = {};
  const locations = [];
  for (const z of ZONES) {
    entities[z.id] = { entityType: EntityType.Location, id: z.id, name: z.name, desc: z.desc };
    locations.push(z.id);
  }
  const character = generateCharacter(EntityType, () => Math.random());
  entities[character.id] = character;
  entities[QUEST_GIVER.id] = {
    entityType: EntityType.Character,
    id: QUEST_GIVER.id,
    name: QUEST_GIVER.name,
    location: QUEST_GIVER.location,
    memories: {},
  };
  entities[RANGER_VOSS.id] = {
    entityType: EntityType.Character,
    id: RANGER_VOSS.id,
    name: RANGER_VOSS.name,
    location: RANGER_VOSS.location,
    memories: {},
  };
  for (const vendor of ALL_VENDORS) {
    entities[vendor.id] = {
      entityType: EntityType.Character,
      id: vendor.id,
      name: vendor.name,
      location: vendor.location,
      memories: {},
    };
  }
  entities["world"] = { entityType: EntityType.Character, id: "world", name: "The World", memories: {} };
  return {
    timestamp: 0, entities,
    characters: [character.id, QUEST_GIVER.id, RANGER_VOSS.id, ...ALL_VENDORS.map(v => v.id), "world"], locations,
    items: [], actions: [],
    vivInternalState: null,
    zoneEnemyStacks: {},
    chestState: { activeChestId: null, cooldownUntilTick: 0 },
  };
}
