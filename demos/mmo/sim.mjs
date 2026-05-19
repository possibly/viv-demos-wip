export {
  RACES, CLASS_DATA, RACE_CLASS, RACE_LABELS,
  ZONES, ZONE_MAP, LEVEL_XP_MIN, LEVEL_CAP,
  ENEMY_FACTION, ZONE_FACTION, FACTIONS,
  QUEST_GIVER, RANGER_VOSS, HERBALIST_KASPAR, ALL_QUEST_GIVERS,
  VENDOR_ARNAULT, QUARTERMASTER_RHYS, ALL_VENDORS, QUEST_GIVERS_BY_ZONE, VENDORS_BY_ZONE,
  QUEST_ITEMS, QUESTS,
  ENEMY_TEMPLATES, ZONE_ENEMIES, ZONE_DISCOVERABLES,
  HOSTILE_ZONES, LEVEL_RANGE_POWER, CHEST_CONFIGS, WEAK_LOOT_ITEMS,
  EQUIPMENT_SLOTS, SLOT_LABELS,
  WANDERING_TRADER_CONFIGS,
} from "./core/data.mjs";
export { questXpReward, pickQuestForAdventurer, factionRepPerQuest, initialFactionRep } from "./core/quests.mjs";
export { itemSellPrice, copperToString } from "./core/items.mjs";
export { PLAYER_IDS } from "./core/character.mjs";

import {
  ZONES, ZONE_MAP, LEVEL_XP_MIN, LEVEL_CAP,
  ENEMY_FACTION, FACTIONS,
  QUEST_GIVER, ALL_QUEST_GIVERS,
  ALL_VENDORS, QUEST_GIVERS_BY_ZONE, VENDORS_BY_ZONE,
  QUEST_ITEMS, QUESTS,
  ENEMY_TEMPLATES, ZONE_DISCOVERABLES,
  CHEST_CONFIGS,
  WANDERING_TRADER_CONFIGS,
} from "./core/data.mjs";
import { questXpReward, pickQuestForAdventurer, initialFactionRep, factionRepPerQuest } from "./core/quests.mjs";
import { getAvgEquipmentPower, combatWinChance, generateLoot, formatLootSummary } from "./core/combat.mjs";
import { itemSellPrice, copperToString, spawnChest } from "./core/items.mjs";
import { getLevel, buildInitialState, PLAYER_IDS } from "./core/character.mjs";
import { mulberry32, hashSeed, makeUUID, pickRandom, setIn } from "./core/utils.mjs";
import {
  PARTY_MAX_SIZE, PARTY_REQUEST_CHANCE, PARTY_RESPOND_CHANCE,
  splitXp, splitCopper, eligibleForPartyOnQuest,
} from "./core/party.mjs";

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

  function shuffleArr(arr) {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  state.traderStates = WANDERING_TRADER_CONFIGS.map(config => {
    const friendlyZone = pickRandom(rng, config.friendlyZoneOptions);
    const hostileZone  = pickRandom(rng, config.hostileZoneOptions);
    return { config, active: false, cooldown: 0, friendlyZone, hostileZone, location: null, campTicks: 0, lifespanRemaining: 0, moveAtCampTick: null, hasMovedOnce: false, currentItems: [] };
  });

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

  const xpCap = LEVEL_XP_MIN[LEVEL_CAP - 1];
  const chestConfig = CHEST_CONFIGS[0];

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

  async function drainUrgent(playerId, onNew) {
    while (true) {
      const newIds = await select({ initiatorID: playerId, urgentOnly: true });
      if (newIds.length === 0) break;
      await onNew(newIds);
    }
  }

  function pushEvent(events, who, text, type) {
    events.push({ who, text, type });
  }

  async function equipFromList(player, itemIds, events) {
    for (const itemId of itemIds) {
      const item = state.entities[itemId];
      const currentPower = player.equipment[item.slot]?.powerLevel ?? 0;
      if (item.powerLevel > currentPower) {
        player.shouldEquipLoot = true;
        const newIds = await attempt("equip-item", player.id, { adventurer: [player.id], item: [itemId] }, true);
        newIds.forEach(id => {
          const a = state.entities[id];
          pushEvent(events, player.id, a.report ?? a.gloss ?? "(action)", "loot");
        });
        const displaced = player.equipment[item.slot];
        if (displaced) player.inventory = [...player.inventory, { ...displaced, slot: item.slot }];
        player.equipment[item.slot] = { name: item.name, powerLevel: item.powerLevel };
        player.inventory = player.inventory.filter(i => i.id !== itemId);
      }
    }
  }

  function partyMembersOf(player) {
    if (!player.partyActive) return [player];
    return (player.partyMembers ?? []).map(id => state.entities[id]).filter(Boolean);
  }

  // Discovers a new faction for the adventurer if they don't yet know it, firing an
  // urgent reserved discover-faction action on the same tick. Returns true if a new
  // faction was discovered.
  async function maybeDiscoverFaction(adventurer, factionId, sourceId, events) {
    if (!factionId) return false;
    if (factionId in adventurer.factionRelationships) return false;
    const initialRep = initialFactionRep(factionId);
    adventurer.factionRelationships[factionId] = initialRep;
    // Only pass @source when it's an existing entity (e.g. quest giver, vendor). Enemy
    // discoveries reference an archetype id, not a spawned entity, so we omit the role.
    const bindings = { adventurer: [adventurer.id] };
    if (sourceId && state.entities[sourceId]) bindings.source = [sourceId];
    const discIds = await attempt("discover-faction", adventurer.id, bindings, true);
    discIds.forEach(id => {
      const a = state.entities[id];
      pushEvent(events, adventurer.id, a.report ?? a.gloss ?? "(action)", "scouting");
    });
    const factionName = FACTIONS[factionId]?.name ?? factionId;
    pushEvent(events, adventurer.id, `${adventurer.name} now knows of ${factionName} (rep: ${initialRep}).`, "scouting");
    return true;
  }

  function partyMembersInZone(player, zoneId) {
    return partyMembersOf(player).filter(m => m.location === zoneId);
  }

  function updateAllPartyAllHuntDone(partyMembers) {
    const allDone = partyMembers.every(m => m.questActive && (m.questHuntDone ?? false));
    for (const m of partyMembers) m.partyAllHuntDone = allDone;
    return allDone;
  }

  // --- Party formation: leader puts out request, eligible others respond ---

  async function tryFormParty(leader, quest, events) {
    if (rng() >= PARTY_REQUEST_CHANCE) return;

    const requestIds = await attempt("request-party", leader.id, { adventurer: [leader.id] }, true);
    requestIds.forEach(id => {
      const a = state.entities[id];
      pushEvent(events, leader.id, a.report ?? a.gloss ?? "(action)", "party");
    });

    const candidates = state.players
      .map(pid => state.entities[pid])
      .filter(p => eligibleForPartyOnQuest(p, leader, quest));

    if (candidates.length === 0) {
      pushEvent(events, leader.id, `${leader.name}'s call goes unanswered — no eligible party members nearby.`, "party");
      return;
    }

    const joiners = [];
    for (const candidate of candidates) {
      if (joiners.length >= PARTY_MAX_SIZE - 1) break;
      const respondIds = await attempt("respond-to-party", candidate.id, { adventurer: [candidate.id], leader: [leader.id] }, true);
      const accept = rng() < PARTY_RESPOND_CHANCE;
      respondIds.forEach(id => {
        const a = state.entities[id];
        const verbose = `${candidate.name} ${accept ? "accepts" : "declines"} ${leader.name}'s party invitation.`;
        pushEvent(events, candidate.id, verbose, "party");
      });
      if (accept) joiners.push(candidate);
    }

    if (joiners.length === 0) {
      pushEvent(events, leader.id, `${leader.name}'s party request finds no takers this time.`, "party");
      return;
    }

    const partyId = makeUUID(rng);
    const members = [leader, ...joiners];
    const memberIds = members.map(m => m.id);
    for (const m of members) {
      m.partyId = partyId;
      m.partyActive = true;
      m.partyLeaderId = leader.id;
      m.partyMembers = memberIds;
      m.partyQuestId = quest.id;
      m.partyAllHuntDone = false;
    }
    pushEvent(events, leader.id, `Party formed: ${members.map(m => m.name).join(", ")} (${members.length}/${PARTY_MAX_SIZE}).`, "party");

    // For each member without the quest, share it via urgent share-quest
    for (const m of joiners) {
      if (m.questActive && m.questId === quest.id) continue;
      if (m.questActive) {
        // Already on a different quest — abandon it silently to take the party quest
        m.questActive = false;
      }
      const shareIds = await attempt("share-quest", m.id, { adventurer: [m.id], sharer: [leader.id], questGiver: [leader.questGiverId] }, true);
      shareIds.forEach(id => {
        const a = state.entities[id];
        pushEvent(events, m.id, a.report ?? a.gloss ?? "(action)", "party");
      });
      m.questId = quest.id;
      m.questGiverId = leader.questGiverId;
      m.questGiverLocation = leader.questGiverLocation;
      m.questTargetTemplate = quest.targetTemplate;
      m.questTargetZone = quest.targetZone;
      m.questKillsNeeded = quest.targetCount;
      m.questKillsDone = leader.questKillsDone ?? 0;
      m.questItemCollected = leader.questItemCollected ?? false;
      m.questXpReward = questXpReward(quest.level);
      m.questEnemyFound = (m.discoveredNPCs[quest.targetZone] ?? []).includes(quest.targetTemplate);
      m.questHuntDone = false;
      m.questReadyToComplete = false;
      m.questStepDone = leader.questStepDone ?? false;
    }
  }

  // --- Shared quest credit & loot resolution within a party ---

  function applyKillSharedCredit(killer, enemy, events) {
    const members = partyMembersOf(killer);
    for (const m of members) {
      if (!m.questActive || m.questId !== killer.questId) continue;
      if (enemy.templateId === m.questTargetTemplate && (m.questKillsDone ?? 0) < (m.questKillsNeeded ?? 0)) {
        m.questKillsDone = (m.questKillsDone ?? 0) + 1;
      }
    }
    if (members.length > 1) {
      pushEvent(events, killer.id, `Party shares the kill (${members.map(m => m.name).join(", ")}).`, "party");
    }
  }

  function applyXpAwardForKill(killer, enemy, events) {
    const zone = killer.location;
    const sharers = partyMembersInZone(killer, zone);
    const baseXp = enemy.xpReward ?? 0;
    if (sharers.length <= 1) {
      const xpAward = Math.min(baseXp, Math.max(0, xpCap - killer.xp));
      killer.pendingXpReward = xpAward;
      killer.pendingLevel = Math.min(getLevel(killer.xp + xpAward), LEVEL_CAP);
      return { primaryXp: xpAward, sharers: [killer] };
    }
    const levels = sharers.map(m => m.level ?? 1);
    const shares = splitXp(baseXp, levels);
    let primaryXp = 0;
    sharers.forEach((m, i) => {
      const cap = Math.max(0, xpCap - m.xp);
      const award = Math.min(shares[i], cap);
      if (m.id === killer.id) {
        m.pendingXpReward = award;
        m.pendingLevel = Math.min(getLevel(m.xp + award), LEVEL_CAP);
        primaryXp = award;
      } else {
        // Award XP directly to other party members (no Viv `kill` action fires for them)
        m.xp = Math.min(m.xp + award, xpCap);
        const newLevel = Math.min(getLevel(m.xp), LEVEL_CAP);
        if (newLevel > (m.level ?? 1)) {
          m.level = newLevel;
          pushEvent(events, m.id, `${m.name} reaches level ${newLevel}!`, "victory");
        }
        pushEvent(events, m.id, `${m.name} gains ${award} XP (party share).`, "victory");
      }
    });
    return { primaryXp, sharers };
  }

  function applyQuestItemDrop(killer, enemy, events) {
    if (!killer.questActive) return;
    const activeQuest = QUESTS.find(q => q.id === killer.questId);
    if (!activeQuest?.questItem) return;
    const questItemDef = QUEST_ITEMS[activeQuest.questItem];
    if (!questItemDef) return;
    if (questItemDef.dropFrom !== enemy.templateId) return;
    if (rng() >= (questItemDef.dropChance ?? 1.0)) return;
    const members = partyMembersOf(killer);
    let recipients = 0;
    for (const m of members) {
      if (m.questActive && m.questId === killer.questId && !m.questItemCollected) {
        m.questItemCollected = true;
        recipients++;
      }
    }
    if (recipients > 0) {
      const who = members.length > 1 ? "The party" : killer.name;
      pushEvent(events, killer.id, `${who} recovers the ${questItemDef.name}!`, "loot");
    }
  }

  async function resolveAttemptLoot(looter, enemy, attemptLootIds, events) {
    attemptLootIds.forEach(id => {
      const a = state.entities[id];
      pushEvent(events, looter.id, a.report ?? a.gloss ?? "(action)", "loot");
    });

    const sharers = partyMembersInZone(looter, looter.location);
    const items = (enemy.lootItems ?? []).map(id => state.entities[id]).filter(Boolean);
    const copper = enemy.lootCopper ?? 0;

    if (sharers.length <= 1) {
      // Solo loot — everything to the looter
      for (const item of items) {
        looter.inventory = [...(looter.inventory ?? []), item];
      }
      if (copper > 0) looter.copper = (looter.copper ?? 0) + copper;
      await equipFromList(looter, items.map(it => it.id), events);
      return;
    }

    // Party loot — roll for each item, split copper with min 1
    for (const item of items) {
      const rolls = [];
      for (const m of sharers) {
        m.lootRollValue = 1 + Math.floor(rng() * 100);
        const rollIds = await attempt("loot-roll", m.id, { adventurer: [m.id], enemy: [enemy.id] }, true);
        rollIds.forEach(id => {
          const a = state.entities[id];
          pushEvent(events, m.id, a.report ?? a.gloss ?? "(action)", "loot");
        });
        rolls.push({ member: m, value: m.lootRollValue });
      }
      rolls.sort((a, b) => b.value - a.value);
      const winner = rolls[0].member;
      winner.inventory = [...(winner.inventory ?? []), item];
      pushEvent(events, winner.id, `${winner.name} wins ${item.name} (roll ${rolls[0].value}).`, "loot");
      await equipFromList(winner, [item.id], events);
    }

    if (copper > 0 || sharers.length > 1) {
      const each = splitCopper(copper, sharers.length);
      for (const m of sharers) m.copper = (m.copper ?? 0) + each;
      pushEvent(events, looter.id, `${copperToString(copper)} split: ${each}c to each of ${sharers.length} party member${sharers.length > 1 ? "s" : ""}.`, "loot");
    }
  }

  async function maybeDisbandParty(player, events) {
    if (!player.partyActive) return;
    const members = partyMembersOf(player);
    const allDone = members.every(m => m.questActive && (m.questHuntDone ?? false));
    for (const m of members) m.partyAllHuntDone = allDone;
    if (!allDone) return;

    pushEvent(events, player.id, `Party hunt complete — ${members.map(m => m.name).join(", ")} disband to turn in alone.`, "party");
    for (const m of members) {
      const disbandIds = await attempt("disband-party", m.id, { adventurer: [m.id] }, true);
      disbandIds.forEach(id => {
        const a = state.entities[id];
        pushEvent(events, m.id, a.report ?? a.gloss ?? "(action)", "party");
      });
      m.partyId = null;
      m.partyActive = false;
      m.partyMembers = [];
      m.partyLeaderId = null;
      m.partyQuestId = null;
      m.partyAllHuntDone = false;
    }
  }

  // --- Wandering trader tick processing ---

  async function departTrader(ts, events) {
    const { config } = ts;
    const departIds = await attempt("trader-depart", config.id, { trader: [config.id] }, true);
    for (const id of departIds) {
      const a = state.entities[id];
      pushEvent(events, null, a.report ?? a.gloss ?? `${config.name} departs`, "trader");
    }
    ts.active = false;
    ts.cooldown = config.cooldownTicks;
    ts.currentItems = [];
    state.entities[config.id].active = false;
    state.entities[config.id].location = null;
  }

  async function processTraderTick(ts, events) {
    const { config } = ts;

    if (ts.cooldown > 0) { ts.cooldown--; return; }

    if (!ts.active) {
      if (rng() < config.spawnChance) {
        const lifespan = Math.floor(rng() * (config.maxLifespan - config.minLifespan + 1)) + config.minLifespan;
        ts.active = true;
        ts.lifespanRemaining = lifespan;
        ts.location = pickRandom(rng, [ts.friendlyZone, ts.hostileZone]);
        ts.campTicks = 0;
        ts.hasMovedOnce = false;
        ts.moveAtCampTick = lifespan > config.minCampTicks * 2
          ? Math.floor(rng() * (Math.min(15, lifespan - config.minCampTicks) - config.minCampTicks + 1)) + config.minCampTicks
          : null;
        ts.currentItems = shuffleArr(config.itemPool).slice(0, config.itemSellCount);
        state.entities[config.id].location = ts.location;
        state.entities[config.id].active = true;

        const arrIds = await attempt("trader-arrive", config.id, { trader: [config.id], zone: [ts.location] }, true);
        for (const id of arrIds) {
          const a = state.entities[id];
          pushEvent(events, null, a.report ?? a.gloss ?? `${config.name} arrives`, "trader");
        }
        const campIds = await attempt("trader-setup-camp", config.id, { trader: [config.id], zone: [ts.location] }, true);
        for (const id of campIds) {
          const a = state.entities[id];
          pushEvent(events, null, a.report ?? a.gloss ?? `${config.name} sets up camp`, "trader");
        }
      }
      return;
    }

    ts.lifespanRemaining--;
    ts.campTicks++;

    if (ts.lifespanRemaining <= 0) {
      await departTrader(ts, events);
      return;
    }

    if (!ts.hasMovedOnce && ts.moveAtCampTick !== null && ts.campTicks >= ts.moveAtCampTick) {
      const otherZone = ts.location === ts.friendlyZone ? ts.hostileZone : ts.friendlyZone;
      ts.location = otherZone;
      ts.campTicks = 0;
      ts.hasMovedOnce = true;
      state.entities[config.id].location = otherZone;

      const moveIds = await attempt("trader-move-camp", config.id, { trader: [config.id], zone: [otherZone] }, true);
      for (const id of moveIds) {
        const a = state.entities[id];
        pushEvent(events, null, a.report ?? a.gloss ?? `${config.name} moves camp`, "trader");
      }
    }
  }

  // --- Per-player tick processing ---

  // Phase 1: update flags, auto-accept quest, optionally fire party-request — same tick.
  async function preActionUpdates(playerId, events) {
    const adventurer = state.entities[playerId];
    const locationID = adventurer.location;
    const discoveredHere = adventurer.discoveredNPCs[locationID] ?? [];

    if (adventurer.questActive) {
      const activeQuest = QUESTS.find(q => q.id === adventurer.questId);

      // Multi-step: when the adventurer arrives at a quest's arrival-spawn zone with the
      // planting step still open, fire plant-quest-item, spawn the linked enemy, and
      // auto-discover it for the adventurer (and any party members on the same quest).
      if (activeQuest?.arrivalSpawn && !adventurer.questStepDone && locationID === activeQuest.arrivalSpawn.zone) {
        const arr = activeQuest.arrivalSpawn;
        const plantIds = await attempt("plant-quest-item", adventurer.id, { adventurer: [adventurer.id], zone: [arr.zone] }, true);
        plantIds.forEach(id => {
          const a = state.entities[id];
          pushEvent(events, adventurer.id, a.report ?? a.gloss ?? "(action)", "quest");
        });

        const newMobId = spawnEnemy(arr.spawnTemplate, arr.zone);
        const mobName = ENEMY_TEMPLATES[arr.spawnTemplate]?.name ?? arr.spawnTemplate;
        const zoneName = ZONE_MAP.get(arr.zone)?.name ?? arr.zone;

        const witnesses = partyMembersOf(adventurer).filter(m => m.questActive && m.questId === adventurer.questId);
        const recipients = witnesses.length > 0 ? witnesses : [adventurer];
        for (const m of recipients) {
          if (!m.discoveredNPCs[arr.zone]) m.discoveredNPCs[arr.zone] = [];
          if (!m.discoveredNPCs[arr.zone].includes(arr.spawnTemplate)) {
            m.discoveredNPCs[arr.zone].push(arr.spawnTemplate);
          }
          m.questStepDone = true;
        }
        pushEvent(events, adventurer.id, `A ${mobName} erupts from the soil at ${zoneName} — the party readies for combat!`, "scouting");
      }

      adventurer.questEnemyFound = (adventurer.discoveredNPCs[adventurer.questTargetZone] ?? []).includes(adventurer.questTargetTemplate);
      const killsDone = (adventurer.questKillsDone ?? 0) >= (adventurer.questKillsNeeded ?? 1);
      const itemDone = !activeQuest?.questItem || adventurer.questItemCollected;
      const stepDone = !activeQuest?.arrivalSpawn || adventurer.questStepDone;
      adventurer.questHuntDone = killsDone && itemDone && stepDone;
      adventurer.questReadyToComplete = adventurer.questHuntDone && locationID === adventurer.questGiverLocation && !adventurer.partyActive;
      if (adventurer.questReadyToComplete) {
        const newXp = Math.min(adventurer.xp + (adventurer.questXpReward ?? 0), xpCap);
        adventurer.pendingLevel = Math.min(getLevel(newXp), LEVEL_CAP);
      }
    }

    const discoveredQuestGiversHere = (QUEST_GIVERS_BY_ZONE[locationID] ?? []).filter(qg => discoveredHere.includes(qg.id));
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

    if (adventurer.pendingAcceptQuest) {
      adventurer.pendingAcceptQuest = false;
      const quest = QUESTS.find(q => q.id === adventurer.pendingQuestId);
      const activeQuestGiverId = adventurer.pendingAcceptQuestGiverId ?? QUEST_GIVER.id;
      const newAcceptIDs = await attempt("accept-quest", adventurer.id, { adventurer: [adventurer.id], questGiver: [activeQuestGiverId] });
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
        adventurer.questStepDone = false;
        newAcceptIDs.forEach(id => {
          const a = state.entities[id];
          pushEvent(events, adventurer.id, a.report ?? a.gloss ?? "(action)", "quest");
        });
        pushEvent(events, adventurer.id, `Quest: ${quest.description}`, "quest");

        if (!adventurer.partyActive && state.players.length > 1) {
          await tryFormParty(adventurer, quest, events);
        }
      }
    }
  }

  async function processPlayerTick(playerId, t, events) {
    const adventurer = state.entities[playerId];
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

    // Add active undiscovered wandering traders in this zone
    for (const ts of state.traderStates) {
      if (ts.active && ts.location === locationID && !(adventurer.knownTraderIds ?? []).includes(ts.config.id)) {
        undiscoveredPool.push({ id: ts.config.id, discoveryRate: ts.config.discoveryRate, _traderState: ts });
      }
    }

    const discoveredVendorsHere = (VENDORS_BY_ZONE[locationID] ?? []).filter(v => discoveredHere.includes(v.id));

    // Include active known wandering traders as virtual vendors
    const allVendorsHere = [...discoveredVendorsHere];
    for (const ts of state.traderStates) {
      if (ts.active && ts.location === locationID &&
          (adventurer.knownTraderIds ?? []).includes(ts.config.id) &&
          ts.currentItems.length > 0) {
        allVendorsHere.push({ id: ts.config.id, name: ts.config.name, items: ts.currentItems, _traderState: ts });
      }
    }

    adventurer.canFight = discoveredHere.some(id => id in ENEMY_TEMPLATES);
    adventurer.canScout = undiscoveredPool.length > 0;

    const sellableItems = (adventurer.inventory ?? []).filter(item => !item.isQuestItem);
    adventurer.canSellItems = sellableItems.length > 0 && allVendorsHere.length > 0;

    const buyableCandidates = [];
    for (const vendor of allVendorsHere) {
      const playerRep = vendor.factionId ? (adventurer.factionRelationships[vendor.factionId] ?? 0) : null;
      for (const vi of vendor.items) {
        // Faction-gated stock: an item only appears in the candidate pool if the player
        // has met its required rep with this vendor's faction.
        if (vi.requiredRep && (playerRep === null || playerRep < vi.requiredRep)) continue;
        const currentPower = adventurer.equipment[vi.slot]?.powerLevel ?? 0;
        if (vi.powerLevel > currentPower && vi.cost <= (adventurer.copper ?? 0)) {
          buyableCandidates.push({ item: vi, vendor });
        }
      }
    }
    adventurer.canBuyItem = buyableCandidates.length > 0;

    const newActionIDs = await select({ initiatorID: adventurer.id });
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

      const combatBindings = { adventurer: [adventurer.id], enemy: [enemyId] };

      if (playerWins) {
        applyXpAwardForKill(adventurer, enemy, events);

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

        const killNewIDs = await attempt("kill", adventurer.id, combatBindings, true);
        killNewIDs.forEach(id => {
          const a = state.entities[id];
          pushEvent(events, adventurer.id, a.report ?? a.gloss ?? "(action)", "victory");
        });

        applyKillSharedCredit(adventurer, enemy, events);
        applyQuestItemDrop(adventurer, enemy, events);

        await drainUrgent(adventurer.id, async (newIds) => {
          for (const id of newIds) {
            const a = state.entities[id];
            if (a.name === "attempt-loot") {
              await resolveAttemptLoot(adventurer, enemy, [id], events);
            } else {
              pushEvent(events, adventurer.id, a.report ?? a.gloss ?? "(action)", "victory");
            }
          }
        });

      } else {
        const retreatNewIDs = await attempt("retreat", adventurer.id, combatBindings, true);
        retreatNewIDs.forEach(id => {
          const a = state.entities[id];
          pushEvent(events, adventurer.id, a.report ?? a.gloss ?? "(action)", "retreat");
        });
      }

    } else if (selectedActionName === "look-around") {
      if (undiscoveredPool.length > 0) {
        const questTargetEntry = (adventurer.questActive && !adventurer.questEnemyFound)
          ? undiscoveredPool.find(d => d.id === adventurer.questTargetTemplate)
          : null;
        const chosen = questTargetEntry ?? pickRandom(rng, undiscoveredPool);

        if (rng() < chosen.discoveryRate) {
          if (chosen._traderState) {
            // Wandering trader: remembered globally, not per-zone
            if (!adventurer.knownTraderIds) adventurer.knownTraderIds = [];
            adventurer.knownTraderIds.push(chosen.id);
            pushEvent(events, adventurer.id, `${adventurer.name} spots ${chosen._traderState.config.name} making camp in ${zoneName}!`, "scouting");
          } else {
          if (!adventurer.discoveredNPCs[locationID]) adventurer.discoveredNPCs[locationID] = [];
          adventurer.discoveredNPCs[locationID].push(chosen.id);

          const chosenEntity = state.entities[chosen.id];
          const enemyTemplate = ENEMY_TEMPLATES[chosen.id];

          if (chosenEntity?.isChest) {
            const chest = chosenEntity;
            pushEvent(events, adventurer.id, `${adventurer.name} discovers a ${chest.name} in ${zoneName}!`, "scouting");

            const chestItemEntities = chest.lootItems.map(id => state.entities[id]);
            chest.lootSummary = formatLootSummary(chestItemEntities, 0);

            const lootNewIDs = await attempt("loot-chest-all", adventurer.id, { adventurer: [adventurer.id], chest: [chest.id] }, true);
            lootNewIDs.forEach(id => {
              const a = state.entities[id];
              pushEvent(events, adventurer.id, a.report ?? a.gloss ?? "(action)", "loot");
            });

            for (const itemId of chest.lootItems) {
              adventurer.inventory = [...(adventurer.inventory ?? []), state.entities[itemId]];
            }

            await equipFromList(adventurer, chest.lootItems, events);

            state.chestState.activeChestId = null;
            state.chestState.cooldownUntilTick = t + chestConfig.cooldownTicks;

          } else if (enemyTemplate) {
            pushEvent(events, adventurer.id, `${adventurer.name} spots a level ${enemyTemplate.level} ${enemyTemplate.name} in ${zoneName}.`, "scouting");
            await maybeDiscoverFaction(adventurer, enemyTemplate.faction, chosen.id, events);
          } else {
            const vendor = ALL_VENDORS.find(v => v.id === chosen.id);
            if (vendor) {
              pushEvent(events, adventurer.id, `${adventurer.name} encounters ${vendor.name} in ${zoneName}!`, "scouting");
              await maybeDiscoverFaction(adventurer, vendor.factionId, chosen.id, events);
            } else {
              const questGiver = ALL_QUEST_GIVERS.find(qg => qg.id === chosen.id);
              pushEvent(events, adventurer.id, `${adventurer.name} meets ${questGiver.name} in ${zoneName}!`, "scouting");
              await maybeDiscoverFaction(adventurer, questGiver.factionId, chosen.id, events);
            }
          }
          } // end trader else
        } else {
          pushEvent(events, adventurer.id, `${adventurer.name} searches ${zoneName} but finds nothing unusual.`, "scouting");
        }
      }

    } else if (selectedActionName === "complete-quest") {
      newActionIDs.forEach(id => {
        const a = state.entities[id];
        pushEvent(events, adventurer.id, a.report ?? a.gloss ?? "(action)", "quest");
      });
      const activeGiver = ALL_QUEST_GIVERS.find(qg => qg.id === adventurer.questGiverId) ?? QUEST_GIVER;
      const completedQuest = QUESTS.find(q => q.id === adventurer.questId);
      pushEvent(events, adventurer.id, `${adventurer.name} receives ${adventurer.questXpReward} XP from ${activeGiver.name}!`, "quest");

      // Faction rep gain — the giver's faction (Zone Factions only, currently).
      if (activeGiver?.factionId) {
        const factionId = activeGiver.factionId;
        const gain = factionRepPerQuest(factionId);
        if (gain > 0) {
          const oldRep = adventurer.factionRelationships[factionId] ?? initialFactionRep(factionId);
          const newRep = Math.min(100, oldRep + gain);
          adventurer.factionRelationships[factionId] = newRep;
          pushEvent(events, adventurer.id, `${adventurer.name} gains ${gain} reputation with ${FACTIONS[factionId]?.name ?? factionId} (${oldRep} → ${newRep}).`, "quest");
        }
      }

      // Copper reward (zone-faction quests award a flat amount in addition to XP).
      if (completedQuest?.copperReward) {
        adventurer.copper = (adventurer.copper ?? 0) + completedQuest.copperReward;
        pushEvent(events, adventurer.id, `${adventurer.name} pockets ${copperToString(completedQuest.copperReward)} from ${activeGiver.name}.`, "quest");
      }

      // Optional fixed reward item (added to inventory; equipped if it's an upgrade).
      if (completedQuest?.rewardItem) {
        const rewardId = makeUUID(rng);
        const item = {
          entityType: EntityType.Item,
          id: rewardId,
          name: completedQuest.rewardItem.name,
          powerLevel: completedQuest.rewardItem.powerLevel,
          slot: completedQuest.rewardItem.slot,
          location: locationID,
        };
        state.entities[rewardId] = item;
        state.items.push(rewardId);
        adventurer.inventory = [...(adventurer.inventory ?? []), item];
        pushEvent(events, adventurer.id, `${adventurer.name} receives ${item.name} (Power ${item.powerLevel}).`, "loot");
        await equipFromList(adventurer, [rewardId], events);
      }

      adventurer.completedQuests = [...(adventurer.completedQuests ?? []), adventurer.questId];
      adventurer.questItemCollected = false;
      adventurer.questStepDone = false;

      const levelUpNewIDs = await select({ initiatorID: adventurer.id, urgentOnly: true });
      levelUpNewIDs.forEach(id => {
        const a = state.entities[id];
        pushEvent(events, adventurer.id, a.report ?? a.gloss ?? "(action)", "victory");
      });

    } else if (selectedActionName === "sell-items") {
      const toSell = (adventurer.inventory ?? []).filter(item => !item.isQuestItem);
      const sellValue = toSell.reduce((sum, item) => sum + itemSellPrice(item), 0);
      const soldAt = allVendorsHere[0];
      newActionIDs.forEach(id => {
        const a = state.entities[id];
        pushEvent(events, adventurer.id, a.report ?? a.gloss ?? "(action)", "vendor");
      });
      adventurer.copper = (adventurer.copper ?? 0) + sellValue;
      adventurer.inventory = (adventurer.inventory ?? []).filter(item => item.isQuestItem);
      pushEvent(events, adventurer.id, `${adventurer.name} sells ${toSell.length} item(s) to ${soldAt.name} for ${copperToString(sellValue)}.`, "vendor");

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

        const purchaseNewIDs = await attempt("purchase-item", adventurer.id, { adventurer: [adventurer.id], item: [boughtItemId], vendor: [boughtFrom.id] }, true);
        purchaseNewIDs.forEach(id => {
          const a = state.entities[id];
          pushEvent(events, adventurer.id, a.report ?? a.gloss ?? "(action)", "vendor");
        });

        await drainUrgent(adventurer.id, newIds => {
          newIds.forEach(id => {
            const a = state.entities[id];
            pushEvent(events, adventurer.id, a.report ?? a.gloss ?? "(action)", "vendor");
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

        if (boughtFrom._traderState) {
          const ts = boughtFrom._traderState;
          adventurer.boughtFromWanderingTrader = true;
          ts.currentItems = ts.currentItems.filter(it => it !== boughtItem);
          if (ts.currentItems.length === 0) {
            pushEvent(events, null, `${ts.config.name} has sold the last of their wares.`, "trader");
            await departTrader(ts, events);
          }
        }
      }

    } else if (selectedActionName === "travel-to-quest-zone" || selectedActionName === "return-to-quest-giver") {
      newActionIDs.forEach(id => {
        const a = state.entities[id];
        pushEvent(events, adventurer.id, a.report ?? a.gloss ?? "(action)", "quest");
      });

    } else {
      newActionIDs.forEach(id => {
        const a = state.entities[id];
        pushEvent(events, adventurer.id, a.report ?? a.gloss ?? "(action)", "");
      });
    }

    // After hunting actions, check whether the party is fully hunt-done and should disband
    await maybeDisbandParty(adventurer, events);
  }

  // --- Sim loop ---

  const ticks = [];
  const initialChars = Object.fromEntries(state.players.map(pid => [pid, structuredClone(state.entities[pid])]));

  for (let t = 0; t < tickCount; t++) {
    if (!state.chestState.activeChestId && t >= state.chestState.cooldownUntilTick) {
      if (rng() < chestConfig.spawnChance) {
        const { chestId, zoneId } = spawnChest(chestConfig, EntityType, rng, state);
        await attempt("spawn-chest", "world", { world: ["world"], chest: [chestId], zone: [zoneId] }, true);
      }
    }

    const events = [];
    for (const ts of state.traderStates) {
      await processTraderTick(ts, events);
    }

    for (const pid of state.players) {
      await preActionUpdates(pid, events);
      await tickPlanner();
      await processPlayerTick(pid, t, events);
    }

    state.timestamp += 10;
    const characters = Object.fromEntries(
      state.players.map(pid => [pid, structuredClone(state.entities[pid])])
    );
    const traders = state.traderStates.map(ts => ({
      id: ts.config.id,
      name: ts.config.name,
      active: ts.active,
      location: ts.location,
      friendlyZone: ts.friendlyZone,
      hostileZone: ts.hostileZone,
      currentItems: ts.active ? [...ts.currentItems] : [],
    }));
    ticks.push({ index: t, timestamp: state.timestamp, events, characters, traders });
  }

  return { characters: initialChars, ticks, playerIds: state.players };
}

export function summarize(tick) {
  const lines = [];
  for (const pid of Object.keys(tick.characters)) {
    const c = tick.characters[pid];
    const loc = ZONE_MAP.get(c.location)?.name ?? c.location;
    const questPart = c.questActive ? ` [Quest: ${c.questKillsDone ?? 0}/${c.questKillsNeeded ?? 0}]` : "";
    const copperPart = (c.copper ?? 0) > 0 ? ` [${copperToString(c.copper)}]` : "";
    const partyPart = c.partyActive ? ` [Party ${c.partyMembers?.length ?? 0}]` : "";
    lines.push(`${c.name} (${c.class}, Lv.${c.level ?? 1}, ${c.xp ?? 0} XP) @ ${loc}${questPart}${copperPart}${partyPart}`);
  }
  return lines.join("  |  ");
}
