export const PARTY_MAX_SIZE = 5;
export const PARTY_REQUEST_CHANCE = 0.6;
export const PARTY_RESPOND_CHANCE = 0.7;

// WoW Classic party XP multiplier (no rest bonus) by party size 1..5
export const PARTY_XP_BONUS = [1.0, 1.1162, 1.3024, 1.4609, 1.6168];

export function splitXp(totalXp, memberLevels) {
  if (memberLevels.length <= 1) return [totalXp];
  const bonus = PARTY_XP_BONUS[memberLevels.length - 1] ?? 1;
  const sumLevels = memberLevels.reduce((a, b) => a + b, 0);
  return memberLevels.map(lv => Math.max(1, Math.floor(totalXp * bonus * (lv / sumLevels))));
}

export function splitCopper(totalCopper, numMembers) {
  return Math.max(1, Math.floor((totalCopper ?? 0) / Math.max(1, numMembers)));
}

// A player qualifies to respond to a leader's party-request if they:
// - are in the same zone as the leader
// - are not already in a party
// - haven't completed the quest
// - are either already on the same quest, or eligible to accept it (level + 2)
export function eligibleForPartyOnQuest(player, leader, quest) {
  if (!player || !leader || !quest) return false;
  if (player.id === leader.id) return false;
  if (player.location !== leader.location) return false;
  if (player.partyId) return false;
  if ((player.completedQuests ?? []).includes(quest.id)) return false;
  if (player.questActive && player.questId === quest.id) return true;
  if (!player.questActive && quest.level <= (player.level ?? 1) + 2) return true;
  return false;
}
