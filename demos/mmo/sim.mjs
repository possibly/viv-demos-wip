export {
  RACES, CLASS_DATA, RACE_CLASS, RACE_LABELS,
  ZONES, ZONE_MAP, LEVEL_XP_MIN, LEVEL_CAP,
  ENEMY_FACTION, FACTIONS,
  QUEST_GIVER, RANGER_VOSS, ALL_QUEST_GIVERS,
  VENDOR_ARNAULT, ALL_VENDORS, QUEST_GIVERS_BY_ZONE, VENDORS_BY_ZONE,
  QUEST_ITEMS, QUESTS,
  ENEMY_TEMPLATES, ZONE_ENEMIES, ZONE_DISCOVERABLES,
  HOSTILE_ZONES, LEVEL_RANGE_POWER, CHEST_CONFIGS, WEAK_LOOT_ITEMS,
  EQUIPMENT_SLOTS, SLOT_LABELS,
} from "./core/data.mjs";
export { questXpReward, pickQuestForAdventurer } from "./core/quests.mjs";
export { itemSellPrice, copperToString } from "./core/items.mjs";

import {
  ZONES, ZONE_MAP, LEVEL_XP_MIN, LEVEL_CAP,
  ENEMY_FACTION, FACTIONS,
  QUEST_GIVER, ALL_QUEST_GIVERS,
  ALL_VENDORS, QUEST_GIVERS_BY_ZONE, VENDORS_BY_ZONE,
  QUEST_ITEMS, QUESTS,
  ENEMY_TEMPLATES, ZONE_DISCOVERABLES,
  CHEST_CONFIGS,
} from "./core/data.mjs";
import { questXpReward, pickQuestForAdventurer, initialFactionRep } from "./core/quests.mjs";
import { getAvgEquipmentPower, combatWinChance, generateLoot, formatLootSummary } from "./core/combat.mjs";
import { itemSellPrice, copperToString, spawnChest } from "./core/items.mjs";
import { getLevel, buildInitialState } from "./core/character.mjs";
import { mulberry32, hashSeed, makeUUID, pickRandom, setIn } from "./core/utils.mjs";

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

  // --- Tick-loop helpers ---

  async function attempt(actionName, initiatorID, precastBindings, suppressConditions) {
    const before = new Set(state.actions);
    await attemptAction({ actionName, initiatorID, precastBindings, suppressConditions });
    return state.actions.filter(id => !before.has(id));
  }

  async function select(opts) {
    const before = new Set(state.actions);
    await selectAction(opts);
    return state.actions.filter(id => !before.has(id));
  }

  // Drains the urgent-action queue, calling onNew(ids) for each batch until empty.
  async function drainUrgent(onNew) {
    while (true) {
      const newIds = await select({ initiatorID: "adventurer", urgentOnly: true });
      if (newIds.length === 0) break;
      onNew(newIds);
    }
  }

  // Equips each item from itemIds if it beats the currently equipped slot power.
  async function equipFromList(adventurer, itemIds, events) {
    for (const itemId of itemIds) {
      const item = state.entities[itemId];
      const currentPower = adventurer.equipment[item.slot]?.powerLevel ?? 0;
      if (item.powerLevel > currentPower) {
        const newIds = await attempt("equip-item", "adventurer", { adventurer: ["adventurer"], item: [itemId] }, true);
        newIds.forEach(id => {
          const a = state.entities[id];
          events.push({ text: a.report ?? a.gloss ?? "(action)", type: "loot" });
        });
        const displaced = adventurer.equipment[item.slot];
        if (displaced) adventurer.inventory = [...adventurer.inventory, { ...displaced, slot: item.slot }];
        adventurer.equipment[item.slot] = { name: item.name, powerLevel: item.powerLevel };
        adventurer.inventory = adventurer.inventory.filter(i => i.id !== itemId);
      }
    }
  }

  // --- Sim loop ---

  const ticks = [];
  const initialChar = structuredClone(state.entities["adventurer"]);
  const xpCap = LEVEL_XP_MIN[LEVEL_CAP - 1];
  const chestConfig = CHEST_CONFIGS[0];

  for (let t = 0; t < tickCount; t++) {
    if (!state.chestState.activeChestId && t >= state.chestState.cooldownUntilTick) {
      if (rng() < chestConfig.spawnChance) {
        const { chestId, zoneId } = spawnChest(chestConfig, EntityType, rng, state);
        await attempt("spawn-chest", "world", { world: ["world"], chest: [chestId], zone: [zoneId] }, true);
      }
    }

    const adventurer = state.entities["adventurer"];
    const locationID = adventurer.location;
    const zoneName = ZONE_MAP.get(locationID)?.name ?? locationID;
    const discoveredHere = adventurer.discoveredNPCs[locationID] ?? [];

    const undiscoveredPool = (ZONE_DISCOVERABLES[locationID] ?? []).filter(d => !discoveredHere.includes(d.id));

    if (state.chestState.activeChestId) {
      const chest = state.entities[state.chestState.activeChestId];
      if (chest?.location === locationID && !discoveredHere.includes(chest.id)) {
        undiscoveredPool.push({ id: chest.id, discoveryRate: chestConfig.discoveryRate });
      }
    }

    // Quest givers already discovered here — used for auto-accept logic below
    const discoveredQuestGiversHere = (QUEST_GIVERS_BY_ZONE[locationID] ?? []).filter(qg => discoveredHere.includes(qg.id));

    // Vendors already discovered here — used for buy/sell flag computation
    const discoveredVendorsHere = (VENDORS_BY_ZONE[locationID] ?? []).filter(v => discoveredHere.includes(v.id));

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

    // These flags expose what's possible at the current location and are read as conditions by Viv actions.
    adventurer.canFight = discoveredHere.some(id => id in ENEMY_TEMPLATES);
    adventurer.canScout = undiscoveredPool.length > 0;

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

    if (adventurer.pendingAcceptQuest) {
      adventurer.pendingAcceptQuest = false;
      const quest = QUESTS.find(q => q.id === adventurer.pendingQuestId);
      const activeQuestGiverId = adventurer.pendingAcceptQuestGiverId ?? QUEST_GIVER.id;
      const newAcceptIDs = await attempt("accept-quest", "adventurer", { adventurer: ["adventurer"], questGiver: [activeQuestGiverId] });
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
    const newActionIDs = await select({ initiatorID: "adventurer" });
    const selectedActionName = newActionIDs.length > 0 ? state.entities[newActionIDs[0]].name : null;

    if (selectedActionName === "fight") {
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
        const loot = generateLoot(rng, enemy);
        const lootItemEntities = loot.items.map(it => {
          const id = makeUUID(rng);
          state.entities[id] = { entityType: EntityType.Item, id, location: locationID, ...it };
          state.items.push(id);
          return state.entities[id];
        });
        enemy.lootItems = lootItemEntities.map(e => e.id);
        enemy.lootCopper = loot.copper;
        enemy.lootSummary = formatLootSummary(lootItemEntities, loot.copper);
        enemy.hasLoot = lootItemEntities.length > 0 || loot.copper > 0;

        const killNewIDs = await attempt("kill", "adventurer", combatBindings, true);
        killNewIDs.forEach(id => {
          const a = state.entities[id];
          events.push({ text: a.report ?? a.gloss ?? "(action)", type: "victory" });
        });

        if (adventurer.questActive && enemy.templateId === templateId && templateId === adventurer.questTargetTemplate) {
          adventurer.questKillsDone = (adventurer.questKillsDone ?? 0) + 1;
        }

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

        await drainUrgent(newIds => {
          newIds.forEach(id => {
            const a = state.entities[id];
            const evType = a.name === "loot-all" ? "loot" : "victory";
            events.push({ text: a.report ?? a.gloss ?? "(action)", type: evType });
            if (a.name === "loot-all") {
              for (const itemId of enemy.lootItems) {
                adventurer.inventory = [...(adventurer.inventory ?? []), state.entities[itemId]];
              }
              adventurer.copper = (adventurer.copper ?? 0) + (enemy.lootCopper ?? 0);
            }
          });
        });

        await equipFromList(adventurer, enemy.lootItems, events);

      } else {
        const retreatNewIDs = await attempt("retreat", "adventurer", combatBindings, true);
        retreatNewIDs.forEach(id => {
          const a = state.entities[id];
          events.push({ text: a.report ?? a.gloss ?? "(action)", type: "retreat" });
        });
      }

    } else if (selectedActionName === "look-around") {
      if (undiscoveredPool.length > 0) {
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
            const chest = chosenEntity;
            events.push({ text: `${adventurer.name} discovers a ${chest.name} in ${zoneName}!`, type: "scouting" });

            const chestItemEntities = chest.lootItems.map(id => state.entities[id]);
            chest.lootSummary = formatLootSummary(chestItemEntities, 0);

            const lootNewIDs = await attempt("loot-chest-all", "adventurer", { adventurer: ["adventurer"], chest: [chest.id] }, true);
            lootNewIDs.forEach(id => {
              const a = state.entities[id];
              events.push({ text: a.report ?? a.gloss ?? "(action)", type: "loot" });
            });

            // All chest items go to inventory first; equip-item below will move upgrades to equipment.
            for (const itemId of chest.lootItems) {
              adventurer.inventory = [...(adventurer.inventory ?? []), state.entities[itemId]];
            }

            await equipFromList(adventurer, chest.lootItems, events);

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
      const levelUpNewIDs = await select({ initiatorID: "adventurer", urgentOnly: true });
      levelUpNewIDs.forEach(id => {
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
        const purchaseNewIDs = await attempt("purchase-item", "adventurer", { adventurer: ["adventurer"], item: [boughtItemId], vendor: [boughtFrom.id] }, true);
        purchaseNewIDs.forEach(id => {
          const a = state.entities[id];
          events.push({ text: a.report ?? a.gloss ?? "(action)", type: "vendor" });
        });

        await drainUrgent(newIds => {
          newIds.forEach(id => {
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
        });
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
  const loc = ZONE_MAP.get(c.location)?.name ?? c.location;
  const questPart = c.questActive ? ` [Quest: ${c.questKillsDone ?? 0}/${c.questKillsNeeded ?? 0}]` : "";
  const copperPart = (c.copper ?? 0) > 0 ? ` [${copperToString(c.copper)}]` : "";
  return `${c.name} (${c.class}, Lv.${c.level ?? 1}, ${c.xp ?? 0} XP) @ ${loc}${questPart}${copperPart}`;
}
