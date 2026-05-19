import { QUESTS, ALL_QUEST_GIVERS, FACTIONS } from "./data.mjs";

// Pre-count quests offered by each zone faction's NPCs so faction rep math is automatic:
// any new quest added to a Zone Faction giver will recalculate rep-per-quest at load time.
const QUEST_COUNT_BY_FACTION = (() => {
  const counts = {};
  for (const q of QUESTS) {
    const giver = ALL_QUEST_GIVERS.find(qg => qg.id === q.questGiverId);
    const fid = giver?.factionId;
    if (!fid) continue;
    counts[fid] = (counts[fid] ?? 0) + 1;
  }
  return counts;
})();

// Zone Factions: completing every quest in the zone takes a player from neutral (50) to
// exalted (90), so a single quest is worth ceil(40 / N) rep. Other faction types: 0.
export function factionRepPerQuest(factionId) {
  const faction = FACTIONS[factionId];
  if (!faction || faction.type !== "zone") return 0;
  const count = QUEST_COUNT_BY_FACTION[factionId] ?? 0;
  if (count === 0) return 0;
  return Math.ceil(40 / count);
}

export function questXpReward(questLevel) {
  return questLevel * 400;
}

export function pickQuestForAdventurer(adventurer, questGiverId) {
  const completed = adventurer.completedQuests ?? [];
  return QUESTS
    .filter(q => {
      if (completed.includes(q.id)) return false;
      if (q.questGiverId !== questGiverId) return false;
      if (q.level > (adventurer.level ?? 1) + 2) return false;
      if (q.prerequisiteQuests && !q.prerequisiteQuests.every(pid => completed.includes(pid))) return false;
      if (q.prerequisiteFlags && !q.prerequisiteFlags.every(f => adventurer[f])) return false;
      return true;
    })
    .sort((a, b) => a.level - b.level)[0] ?? null;
}

// Zone factions start at neutral (50) the moment a player discovers them.
// Enemy / other factions start at 0.
export function initialFactionRep(factionId) {
  const faction = FACTIONS[factionId];
  if (!faction) return 0;
  if (faction.type === "zone") return 50;
  return 0;
}
