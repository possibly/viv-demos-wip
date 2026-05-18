import { EQUIPMENT_SLOTS, WEAK_LOOT_ITEMS } from "./data.mjs";
import { makeUUID, pickRandom } from "./utils.mjs";

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

export function getStarterEquipment(classKey, raceKey) {
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

export function spawnChest(config, EntityType, rng, state) {
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
