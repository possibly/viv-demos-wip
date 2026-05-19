import { ITEM_DB } from "./data.mjs";
import { queryItems } from "./items.mjs";
import { pickRandom } from "./utils.mjs";

const SLOT_WEIGHTS = {
  mainhand:  2.0,
  offhand:   1.5,
  chest:     1.5,
  legs:      1.25,
  head:      1.0,
  shoulders: 1.0,
  hands:     1.0,
  feet:      1.0,
  back:      0.75,
  wrist:     0.75,
  waist:     0.75,
  ranged:    0.75,
  ring1:     0.5,
  ring2:     0.5,
  neck:      0.5,
  trinket:   0.5,
  ammo:      0.25,
};

export function getAvgEquipmentPower(char) {
  let weightedSum = 0, totalWeight = 0;
  for (const [slot, item] of Object.entries(char.equipment)) {
    if (item === null) continue;
    const w = SLOT_WEIGHTS[slot] ?? 1.0;
    weightedSum += item.powerLevel * w;
    totalWeight += w;
  }
  return totalWeight === 0 ? 1 : weightedSum / totalWeight;
}

export function combatWinChance(playerLevel, avgEquipPower, enemyLevel, enemyPower) {
  const diff = (playerLevel + avgEquipPower) - (enemyLevel + enemyPower);
  const x = Math.max(0, Math.min(4, diff + 4));
  if (x <= 0) return 0;
  if (x >= 4) return 0.99;
  return -0.000417 * x ** 4 + 0.01083 * x ** 3 - 0.12957 * x ** 2 + 0.619157 * x;
}

// lootPool: pool descriptor for queryItems (e.g. { powerLevel: [1, 2] }).
//           Falls back to the full ITEM_DB if absent or empty.
// allowedMaterials: string[] | null — restricts armor drops to the looter's class types.
export function generateLoot(rng, enemy, lootPool, allowedMaterials) {
  const result = { copper: 0, items: [] };
  if (enemy.type !== "humanoid" || enemy.level > 5) return result;
  if (rng() < 0.4) result.copper = Math.floor(rng() * 3) + 1;
  if (rng() < 0.3) {
    const pool = lootPool ?? {};
    const candidates = queryItems(pool, allowedMaterials);
    const source = candidates.length > 0 ? candidates : ITEM_DB;
    result.items.push(pickRandom(rng, source));
  }
  return result;
}

export function formatLootSummary(items, copper) {
  const parts = items.map(it => it.name);
  if (copper > 0) parts.push(`${copper} copper`);
  return parts.length > 0 ? parts.join(", ") : "nothing";
}
