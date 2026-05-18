import { QUESTS, FACTIONS } from "./data.mjs";

export function questXpReward(questLevel) {
  return questLevel * 400;
}

export function pickQuestForAdventurer(adventurer, questGiverId) {
  const completed = adventurer.completedQuests ?? [];
  return QUESTS
    .filter(q => !completed.includes(q.id) && q.level <= adventurer.level + 2 && q.questGiverId === questGiverId)
    .sort((a, b) => a.level - b.level)[0] ?? null;
}

export function initialFactionRep(factionId) {
  return FACTIONS[factionId]?.type === "enemy" ? 0 : 50;
}
