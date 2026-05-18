import { WEAK_LOOT_ITEMS } from "./data.mjs";
import { pickRandom } from "./utils.mjs";

export function getAvgEquipmentPower(char) {
  const items = Object.values(char.equipment).filter(item => item !== null);
  if (items.length === 0) return 1;
  return items.reduce((sum, item) => sum + item.powerLevel, 0) / items.length;
}

export function combatWinChance(playerLevel, avgEquipPower, enemyLevel, enemyPower) {
  const diff = (playerLevel + avgEquipPower) - (enemyLevel + enemyPower);
  const x = Math.max(0, Math.min(4, diff + 4));
  if (x <= 0) return 0;
  if (x >= 4) return 0.99;
  return -0.000417 * x ** 4 + 0.01083 * x ** 3 - 0.12957 * x ** 2 + 0.619157 * x;
}

export function generateLoot(rng, enemy) {
  const result = { copper: 0, items: [] };
  if (enemy.type !== "humanoid" || enemy.level > 5) return result;
  if (rng() < 0.4) result.copper = Math.floor(rng() * 3) + 1;
  if (rng() < 0.3) result.items.push(pickRandom(rng, WEAK_LOOT_ITEMS));
  return result;
}

export function formatLootSummary(items, copper) {
  const parts = items.map(it => it.name);
  if (copper > 0) parts.push(`${copper} copper`);
  return parts.length > 0 ? parts.join(", ") : "nothing";
}
